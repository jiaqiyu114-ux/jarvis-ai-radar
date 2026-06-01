param(
  [string]$Base       = "http://localhost:3000",
  [string]$BundleFile = "config\source-bundles\official-ai-company-sources.json",
  [switch]$Apply,
  [switch]$SkipUrlTest
)

$ErrorActionPreference = "Continue"
$PackOrigin = "official-ai-company-pack-v1"

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Import Official AI Company Sources ===" -ForegroundColor Cyan
Write-Host ("Base:        " + $Base)
Write-Host ("BundleFile:  " + $BundleFile)
Write-Host ("Apply:       " + $Apply)
Write-Host ("SkipUrlTest: " + $SkipUrlTest)
if (-not $Apply) {
  Write-Host "[DRY-RUN] Pass -Apply to write changes." -ForegroundColor Yellow
}
Write-Host ("Time:        " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ""

# ── Helpers ───────────────────────────────────────────────────────────────────

function Normalize-Url {
  param([string]$u)
  if (-not $u) { return "" }
  $u = $u.Trim().ToLower()
  $u = $u -replace "^https?://", ""
  $u = $u.TrimEnd("/")
  return $u
}

function Build-Note {
  param(
    [string]$Company,
    [string]$Role,
    [bool]$Official,
    [bool]$Person,
    [string]$Fallback
  )
  $off = if ($Official) { "true" } else { "false" }
  $per = if ($Person)   { "true" } else { "false" }
  $n   = "company:" + $Company + " | role:" + $Role +
         " | official:" + $off + " | person:" + $per +
         " | origin:" + $PackOrigin
  if ($Fallback) { $n += " | fallback:" + $Fallback }
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

$rawBundle = [System.IO.File]::ReadAllText($bundlePath, [System.Text.Encoding]::UTF8)
$bundle    = $rawBundle | ConvertFrom-Json
$sources   = @($bundle)
Write-Host ("[OK] Loaded bundle: " + $sources.Count + " sources") -ForegroundColor Green

$officialCount = @($sources | Where-Object { $_.isOfficial -eq $true }).Count
$personCount   = @($sources | Where-Object { $_.sourceRole -eq "key_person" }).Count
$rssCount      = @($sources | Where-Object { $_.platform  -eq "rss" }).Count
Write-Host ("     official=" + $officialCount + " key_person=" + $personCount + " rss=" + $rssCount)
Write-Host ""

# ── Check server + load existing sources ─────────────────────────────────────

$serverOk    = $false
$existingMap = @{}
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
  Write-Host "       Start dev server with: pnpm dev" -ForegroundColor DarkGray
  if ($Apply) {
    Write-Host "[FAIL] Cannot apply without running server." -ForegroundColor Red
    exit 1
  }
}
Write-Host ""

# ── Process each source ───────────────────────────────────────────────────────

$insertedCount = 0
$updatedCount  = 0
$dryRunCount   = 0
$failedCount   = 0
$tableRows     = @()

foreach ($src in $sources) {
  # Enforce: key_person must NOT be official
  $isPerson   = ($src.sourceRole -eq "key_person")
  $isOfficial = [bool]$src.isOfficial
  if ($isPerson) { $isOfficial = $false }

  # Map JSON priority: 1 -> user_source_priority 1, 2 -> 5
  $priority = if ($src.priority -eq 1) { 1 } else { 5 }

  # Resolve effective URL/platform (test RSS reachability if fallback available)
  $effectiveUrl      = $src.url
  $effectivePlatform = $src.platform
  $usedFallback      = $false
  $fallbackNote      = ""

  if ($Apply -and $serverOk -and (-not $SkipUrlTest) -and $src.platform -eq "rss" -and $src.fallbackUrl) {
    try {
      $null = Invoke-WebRequest -Uri $src.url -Method Head -TimeoutSec 8 -UseBasicParsing -ErrorAction Stop
    } catch {
      $effectiveUrl      = $src.fallbackUrl
      $effectivePlatform = "web"
      $usedFallback      = $true
      $fallbackNote      = " [rss->web]"
      Write-Host ("[WARN] RSS unreachable, using fallback: " + $src.name) -ForegroundColor Yellow
    }
  }

  # Build user_source_note
  $note = Build-Note -Company $src.company -Role $src.sourceRole `
                     -Official $isOfficial -Person $isPerson `
                     -Fallback $src.fallbackUrl

  # Find existing source by URL
  $normUrl      = Normalize-Url $effectiveUrl
  $normOrigUrl  = Normalize-Url $src.url
  $existing     = $null

  if ($existingMap.ContainsKey($normUrl)) {
    $existing = $existingMap[$normUrl]
  } elseif ($usedFallback -and $existingMap.ContainsKey($normOrigUrl)) {
    $existing = $existingMap[$normOrigUrl]
  }

  $action = "dry_run"
  $status = if ($null -ne $existing) { "would_update" } else { "would_insert" }

  if ($Apply -and $serverOk) {
    if ($null -ne $existing) {
      # ── PATCH existing ───────────────────────────────────────────────
      $patchBody = @{
        source_tier          = $src.tier
        is_official          = $isOfficial
        is_user_curated      = $true
        user_source_label    = "Official AI Pack"
        user_source_note     = $note
        user_source_priority = $priority
        category             = $src.contentCategory
      }
      if ($usedFallback) { $patchBody["platform"] = $effectivePlatform }

      $patchJson = $patchBody | ConvertTo-Json -Compress
      try {
        $pr = Invoke-RestMethod -Method Patch `
          -Uri ($Base + "/api/sources/" + $existing.id) `
          -Body $patchJson -ContentType "application/json" `
          -TimeoutSec 15 -ErrorAction Stop
        if ($pr.ok) {
          $action = "updated"
          $status = "ok (id:" + $existing.id.Substring(0,8) + ")"
          $updatedCount++
        } else {
          $action = "failed"
          $status = if ($pr.error) { $pr.error } else { "patch returned ok=false" }
          $failedCount++
        }
      } catch {
        $action = "failed"
        $msg    = $_.Exception.Message
        $status = $msg.Substring(0, [Math]::Min(50, $msg.Length))
        $failedCount++
      }

    } else {
      # ── POST new source ───────────────────────────────────────────────
      $postBody = @{
        name                 = $src.name
        url                  = $effectiveUrl
        source_tier          = $src.tier
        category             = $src.contentCategory
        platform             = $effectivePlatform
        is_official          = $isOfficial
        is_user_curated      = $true
        user_source_label    = "Official AI Pack"
        user_source_note     = $note
        user_source_priority = $priority
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
          $status = "ok (id:" + $cr.source.id.Substring(0,8) + ")"
          $insertedCount++
        } else {
          $action = "failed"
          $status = if ($cr.error) { $cr.error } else { "post returned ok=false" }
          $failedCount++
        }
      } catch {
        # 409 = URL/name conflict -> find by name and PATCH
        $httpCode = 0
        if ($_.Exception.Response) { $httpCode = [int]$_.Exception.Response.StatusCode }

        if ($httpCode -eq 409) {
          $byName = @($existingList | Where-Object { $_.name -eq $src.name })
          if ($byName.Count -gt 0) {
            $conflictSrc = $byName[0]
            $patchBody = @{
              source_tier          = $src.tier
              is_official          = $isOfficial
              is_user_curated      = $true
              user_source_label    = "Official AI Pack"
              user_source_note     = $note
              user_source_priority = $priority
              category             = $src.contentCategory
            }
            $patchJson = $patchBody | ConvertTo-Json -Compress
            try {
              $pr2 = Invoke-RestMethod -Method Patch `
                -Uri ($Base + "/api/sources/" + $conflictSrc.id) `
                -Body $patchJson -ContentType "application/json" `
                -TimeoutSec 15 -ErrorAction Stop
              if ($pr2.ok) {
                $action = "updated"
                $status = "ok via 409-patch (id:" + $conflictSrc.id.Substring(0,8) + ")"
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
            $status = "409-no-name-match"
            $failedCount++
          }
        } else {
          $msg    = $_.Exception.Message
          $action = "failed"
          $status = $msg.Substring(0, [Math]::Min(50, $msg.Length))
          $failedCount++
        }
      }
    }
  } else {
    $dryRunCount++
  }

  $actionColor = switch ($action) {
    "inserted" { "Green"  }
    "updated"  { "Cyan"   }
    "dry_run"  { "Gray"   }
    "failed"   { "Red"    }
    default    { "Gray"   }
  }

  $companyPad = $src.company.PadRight(16)
  $rolePad    = $src.sourceRole.PadRight(17)
  Write-Host ("  [" + $action.ToUpper().PadRight(10) + "] " + $companyPad + " | " + $rolePad + " | " + $src.name) -ForegroundColor $actionColor

  $tableRows += [PSCustomObject]@{
    Company  = $src.company
    Name     = if ($src.name.Length -gt 26) { $src.name.Substring(0,23) + "..." } else { $src.name }
    Role     = $src.sourceRole
    Platform = $effectivePlatform + $fallbackNote
    Tier     = $src.tier
    Official = if ($isOfficial) { "true" } else { "false" }
    Action   = $action
    Status   = if ($status.Length -gt 32) { $status.Substring(0,29) + "..." } else { $status }
  }
}

# ── Results table ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "-- Import Results --------------------------------------------------------" -ForegroundColor Cyan
$tableRows | Format-Table -AutoSize

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "-- Statistics -----------------------------------------------------------" -ForegroundColor Cyan
Write-Host ("bundleTotal: " + $sources.Count)
if ($Apply) {
  Write-Host ("inserted:    " + $insertedCount) -ForegroundColor Green
  Write-Host ("updated:     " + $updatedCount)  -ForegroundColor Cyan
  Write-Host ("failed:      " + $failedCount)   -ForegroundColor Red
} else {
  Write-Host "inserted:    0 (dry-run)"
  Write-Host "updated:     0 (dry-run)"
  Write-Host "failed:      0 (dry-run)"
}
Write-Host ""

Write-Host "=== RESULT ===" -ForegroundColor Cyan
if (-not $Apply) {
  Write-Host ("RESULT: DRY-RUN -- pass -Apply to import " + $sources.Count + " source(s)") -ForegroundColor Yellow
  exit 0
}
if ($failedCount -eq 0) {
  Write-Host ("RESULT: PASS (" + $insertedCount + " inserted, " + $updatedCount + " updated, 0 failed)") -ForegroundColor Green
  exit 0
} else {
  Write-Host ("RESULT: WARN (" + $failedCount + " failed, " + $insertedCount + " inserted, " + $updatedCount + " updated)") -ForegroundColor Yellow
  exit 0
}
