param(
  [string]$Base       = "http://localhost:3000",
  [string]$BundleFile = "config\source-bundles\ai-source-tier-pack-v1.json",
  [switch]$Apply
)

$ErrorActionPreference = "Continue"
$PackName = "ai-source-tier-pack-v1"

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Import AI Source Tier Pack ===" -ForegroundColor Cyan
Write-Host ("Base:       " + $Base)
Write-Host ("BundleFile: " + $BundleFile)
Write-Host ("Apply:      " + $Apply)
if (-not $Apply) {
  Write-Host "[DRY-RUN] Pass -Apply to write changes." -ForegroundColor Yellow
}
Write-Host ("Time:       " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ""

# ── Helpers ───────────────────────────────────────────────────────────────────

function Normalize-Url {
  param([string]$u)
  if (-not $u) { return "" }
  $u = $u.Trim().ToLower() -replace "^https?://", ""
  return $u.TrimEnd("/")
}

function Build-TierNote {
  param($Src)
  $pendingStr  = if ($Src.pendingWeb -eq $true)  { "true"  } else { "false" }
  $officialStr = if ($Src.official   -eq $true)  { "true"  } else { "false" }
  $n = "tier:" + $Src.tier + " | company:" + $Src.company + " | role:" + $Src.role +
       " | official:" + $officialStr + " | pendingWeb:" + $pendingStr +
       " | sourcePack:" + $PackName
  if ($n.Length -gt 255) { $n = $n.Substring(0, 252) + "..." }
  return $n
}

# ── Load bundle ───────────────────────────────────────────────────────────────

$bundlePath = Join-Path (Get-Location) $BundleFile
if (-not (Test-Path $bundlePath)) {
  $bundlePath = Join-Path $PSScriptRoot ("..\$BundleFile")
}
if (-not (Test-Path $bundlePath)) {
  Write-Host ("[FAIL] Bundle not found: " + $BundleFile) -ForegroundColor Red
  exit 1
}

$raw    = [System.IO.File]::ReadAllText($bundlePath, [System.Text.Encoding]::UTF8)
$bundle = $raw | ConvertFrom-Json
$all    = @($bundle)

$rssEnabled   = @($all | Where-Object { $_.platform -eq "rss" -and $_.enabled -eq $true })
$webPending   = @($all | Where-Object { $_.pendingWeb -eq $true })
$byTier       = @{}
foreach ($s in $all) {
  $t = $s.tier
  if (-not $byTier.ContainsKey($t)) { $byTier[$t] = 0 }
  $byTier[$t]++
}

Write-Host ("[OK] Loaded bundle: " + $all.Count + " sources") -ForegroundColor Green
foreach ($t in ("S","A","B","C","D")) {
  if ($byTier.ContainsKey($t)) {
    Write-Host ("     " + $t + ": " + $byTier[$t]) -ForegroundColor Gray
  }
}
Write-Host ("     RSS/enabled: " + $rssEnabled.Count)
Write-Host ("     pendingWeb:  " + $webPending.Count)
Write-Host ""

# ── Check server + load existing sources ─────────────────────────────────────

$serverOk     = $false
$existingMap  = @{}
$existingList = @()

try {
  $resp = Invoke-RestMethod -Method Get -Uri ($Base + "/api/sources") -TimeoutSec 15 -ErrorAction Stop
  if ($resp.ok -ne $false) {
    $serverOk     = $true
    $existingList = @($resp.sources)
    foreach ($s in $existingList) {
      $key = Normalize-Url $s.url
      if ($key) { $existingMap[$key] = $s }
    }
    Write-Host ("[OK] Server reachable. Existing sources: " + $existingList.Count) -ForegroundColor Green
  }
} catch {
  Write-Host ("[WARN] Server not reachable: " + $_.Exception.Message) -ForegroundColor Yellow
  if ($Apply) {
    Write-Host "[FAIL] Cannot apply without running server." -ForegroundColor Red
    exit 1
  }
}
Write-Host ""

# ── Process sources ───────────────────────────────────────────────────────────

$insertedCount = 0
$updatedCount  = 0
$dryRunCount   = 0
$failedCount   = 0
$tableRows     = @()

foreach ($src in $all) {
  $note       = Build-TierNote $src
  $isPending  = ($src.pendingWeb -eq $true)
  $isBlocked  = (-not ($src.enabled -eq $true))  # disabled = blocked in DB
  $isOfficial = ($src.official -eq $true)

  # Map priority: 1->1, 2->5, 3->10, 4->15
  $priMap     = @{ 1 = 1; 2 = 5; 3 = 10; 4 = 15 }
  $dbPriority = if ($priMap.ContainsKey([int]$src.priority)) { $priMap[[int]$src.priority] } else { 10 }

  $normUrl  = Normalize-Url $src.url
  $existing = $null
  if ($existingMap.ContainsKey($normUrl)) { $existing = $existingMap[$normUrl] }

  $action = "dry_run"
  $status = if ($null -ne $existing) { "would_update" } else { "would_insert" }

  if ($Apply -and $serverOk) {
    if ($null -ne $existing) {
      # PATCH existing source
      $patchBody = @{
        source_tier          = $src.tier
        is_official          = $isOfficial
        is_blocked           = $isBlocked
        is_user_curated      = $true
        user_source_label    = ("Tier Pack " + $src.tier)
        user_source_note     = $note
        user_source_priority = $dbPriority
      }
      $patchJson = $patchBody | ConvertTo-Json -Compress
      try {
        $pr = Invoke-RestMethod -Method Patch `
          -Uri ($Base + "/api/sources/" + $existing.id) `
          -Body $patchJson -ContentType "application/json" `
          -TimeoutSec 15 -ErrorAction Stop
        if ($pr.ok) {
          $action = "updated"
          $status = "ok"
          $updatedCount++
        } else {
          $action = "failed"
          $status = if ($pr.error) { $pr.error } else { "patch ok=false" }
          $failedCount++
        }
      } catch {
        $action = "failed"
        $msg    = $_.Exception.Message
        $status = $msg.Substring(0, [Math]::Min(45, $msg.Length))
        $failedCount++
      }

    } else {
      # POST new source
      $postBody = @{
        name                 = $src.name
        url                  = $src.url
        source_tier          = $src.tier
        category             = "AI"
        platform             = $src.platform
        is_official          = $isOfficial
        is_blocked           = $isBlocked
        is_user_curated      = $true
        user_source_label    = ("Tier Pack " + $src.tier)
        user_source_note     = $note
        user_source_priority = $dbPriority
        data_origin          = "real"
      }
      $postJson = $postBody | ConvertTo-Json -Compress
      try {
        $cr = Invoke-RestMethod -Method Post `
          -Uri ($Base + "/api/sources") `
          -Body $postJson -ContentType "application/json" `
          -TimeoutSec 15 -ErrorAction Stop
        if ($cr.ok) {
          $action = "inserted"
          $status = "ok"
          $insertedCount++
        } else {
          $action = "failed"
          $status = if ($cr.error) { $cr.error } else { "post ok=false" }
          $failedCount++
        }
      } catch {
        $httpCode = 0
        if ($_.Exception.Response) { $httpCode = [int]$_.Exception.Response.StatusCode }
        if ($httpCode -eq 409) {
          # Name conflict: find by name and PATCH
          $byName = @($existingList | Where-Object { $_.name -eq $src.name })
          if ($byName.Count -gt 0) {
            $conflict = $byName[0]
            $patchBody = @{
              source_tier          = $src.tier
              is_official          = $isOfficial
              is_blocked           = $isBlocked
              is_user_curated      = $true
              user_source_label    = ("Tier Pack " + $src.tier)
              user_source_note     = $note
              user_source_priority = $dbPriority
            }
            $patchJson = $patchBody | ConvertTo-Json -Compress
            try {
              $pr2 = Invoke-RestMethod -Method Patch `
                -Uri ($Base + "/api/sources/" + $conflict.id) `
                -Body $patchJson -ContentType "application/json" `
                -TimeoutSec 15 -ErrorAction Stop
              if ($pr2.ok) {
                $action = "updated"
                $status = "ok (409->patch)"
                $updatedCount++
              } else {
                $action = "failed"
                $status = "409-patch-failed"
                $failedCount++
              }
            } catch {
              $action = "failed"
              $status = "409-patch-error"
              $failedCount++
            }
          } else {
            $action = "failed"
            $status = "409-no-match"
            $failedCount++
          }
        } else {
          $msg    = $_.Exception.Message
          $action = "failed"
          $status = $msg.Substring(0, [Math]::Min(45, $msg.Length))
          $failedCount++
        }
      }
    }
  } else {
    $dryRunCount++
  }

  $blockedDisp  = if ($isBlocked)  { "blocked" } else { "active" }
  $pendingDisp  = if ($isPending)  { "yes" } else { "no" }
  $officialDisp = if ($isOfficial) { "true" } else { "false" }

  $actionColor = switch ($action) {
    "inserted" { "Green" }
    "updated"  { "Cyan"  }
    "dry_run"  { "Gray"  }
    "failed"   { "Red"   }
    default    { "Gray"  }
  }
  Write-Host ("  [" + $action.ToUpper().PadRight(10) + "] " + $src.tier.PadRight(2) + " | " + $src.platform.PadRight(4) + " | " + $blockedDisp.PadRight(7) + " | " + $src.name) -ForegroundColor $actionColor

  $tableRows += [PSCustomObject]@{
    Tier     = $src.tier
    Company  = $src.company
    Name     = if ($src.name.Length -gt 26) { $src.name.Substring(0,23) + "..." } else { $src.name }
    Platform = $src.platform
    Enabled  = if ($src.enabled -eq $true) { "true" } else { "false" }
    Official = $officialDisp
    Pending  = $pendingDisp
    Action   = $action
    Status   = if ($status.Length -gt 28) { $status.Substring(0,25) + "..." } else { $status }
  }
}

# ── Results table ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "-- Import Results --------------------------------------------------------" -ForegroundColor Cyan
$tableRows | Sort-Object Tier, Company | Format-Table -AutoSize

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "-- Statistics -----------------------------------------------------------" -ForegroundColor Cyan
Write-Host ("bundleTotal:  " + $all.Count)
Write-Host ("rssEnabled:   " + $rssEnabled.Count)
Write-Host ("pendingWeb:   " + $webPending.Count)
if ($Apply) {
  Write-Host ("inserted:     " + $insertedCount) -ForegroundColor Green
  Write-Host ("updated:      " + $updatedCount)  -ForegroundColor Cyan
  Write-Host ("failed:       " + $failedCount)   -ForegroundColor Red
} else {
  Write-Host "inserted:     0 (dry-run)"
  Write-Host "updated:      0 (dry-run)"
}
Write-Host ""

Write-Host "=== RESULT ===" -ForegroundColor Cyan
if (-not $Apply) {
  Write-Host ("RESULT: DRY-RUN -- pass -Apply to import " + $all.Count + " sources") -ForegroundColor Yellow
  exit 0
}
if ($failedCount -eq 0) {
  Write-Host ("RESULT: PASS (" + $insertedCount + " inserted, " + $updatedCount + " updated)") -ForegroundColor Green
  exit 0
} else {
  Write-Host ("RESULT: WARN (" + $failedCount + " failed, " + $insertedCount + " inserted, " + $updatedCount + " updated)") -ForegroundColor Yellow
  exit 0
}
