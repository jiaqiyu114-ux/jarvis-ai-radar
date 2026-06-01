param(
  [string]$Base          = "http://localhost:3000",
  [string]$HealthReport  = ".tmp\source-health-report.json",
  [string]$BundleFile    = "config\source-bundles\ai-radar-sources.json",
  [switch]$Apply,
  [switch]$IncludeUsable
)

$ErrorActionPreference = "Continue"
$allOk = $true

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Import Healthy Sources ===" -ForegroundColor Cyan
Write-Host ("Base:          " + $Base)
Write-Host ("Apply:         " + $Apply)
Write-Host ("IncludeUsable: " + $IncludeUsable)
if (-not $Apply) {
  Write-Host "[DRY-RUN] No changes will be written. Pass -Apply to insert." -ForegroundColor Yellow
}
Write-Host ("Time:          " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ""

# ── Load health report ─────────────────────────────────────────────────────────

$reportPath = Join-Path (Get-Location) $HealthReport
$candidates = @()

if (Test-Path $reportPath) {
  try {
    $rawReport = [System.IO.File]::ReadAllText($reportPath, [System.Text.Encoding]::UTF8)
    $report = $rawReport | ConvertFrom-Json
    $reportAge = (Get-Date) - [DateTime]::Parse($report.generatedAt)
    $ageMin = [Math]::Round($reportAge.TotalMinutes)
    Write-Host ("[OK] Loaded health report: " + $reportPath + " (generated " + $ageMin + "m ago)") -ForegroundColor Green
    if ($reportAge.TotalHours -gt 24) {
      Write-Host "[WARN] Health report is over 24h old. Run verify-source-health.ps1 first." -ForegroundColor Yellow
    }
    $allResults = @($report.results)
    Write-Host ("      Sources in report: " + $allResults.Count)
  } catch {
    Write-Host ("[WARN] Could not parse health report: " + $_.Exception.Message) -ForegroundColor Yellow
    $allResults = @()
  }
} else {
  Write-Host ("[WARN] No health report at: " + $reportPath) -ForegroundColor Yellow
  Write-Host "       Run: powershell -ExecutionPolicy Bypass -File scripts\verify-source-health.ps1" -ForegroundColor DarkGray
  $allResults = @()
}

# Fall back to bundle JSON if no health report
if ($allResults.Count -eq 0) {
  Write-Host "[INFO] Falling back to bundle JSON (no health data -- all statuses marked as unknown)" -ForegroundColor Gray
  $bundlePath = Join-Path $PSScriptRoot "..\$BundleFile"
  if (-not (Test-Path $bundlePath)) { $bundlePath = Join-Path (Get-Location) $BundleFile }
  if (Test-Path $bundlePath) {
    $rawBundle = [System.IO.File]::ReadAllText($bundlePath, [System.Text.Encoding]::UTF8)
    $bundle = $rawBundle | ConvertFrom-Json
    $allResults = @($bundle.sources | ForEach-Object {
      $_ | Add-Member -NotePropertyName status     -NotePropertyValue "unknown" -Force -PassThru |
           Add-Member -NotePropertyName errorReason -NotePropertyValue ""        -Force -PassThru
    })
    Write-Host ("      Bundle sources: " + $allResults.Count)
  } else {
    Write-Host "[FAIL] Bundle file not found either. Cannot continue." -ForegroundColor Red
    exit 1
  }
}

# ── Filter candidates ──────────────────────────────────────────────────────────

$statuses = @("healthy")
if ($IncludeUsable) { $statuses += "usable" }

$candidates = @($allResults | Where-Object {
  $statuses -contains $_.status
})

$skippedFailed = @($allResults | Where-Object { $_.status -eq "failed" }).Count
$skippedWeak   = @($allResults | Where-Object { $_.status -eq "weak"   }).Count
$skippedUnknown = @($allResults | Where-Object { $_.status -eq "unknown" -and $statuses -notcontains "unknown" }).Count

Write-Host ("Candidates eligible for import: " + $candidates.Count)
Write-Host ("  (healthy: " + @($allResults | Where-Object { $_.status -eq "healthy" }).Count + ")")
if ($IncludeUsable) {
  Write-Host ("  (usable:  " + @($allResults | Where-Object { $_.status -eq "usable" }).Count + ")")
}
Write-Host ("  (skipped failed: " + $skippedFailed + ", weak: " + $skippedWeak + ")")
Write-Host ""

if ($candidates.Count -eq 0) {
  Write-Host "[INFO] No eligible candidates. Run verify-source-health.ps1 first, or use -IncludeUsable." -ForegroundColor Yellow
  Write-Host ""
  exit 0
}

# ── Check server reachability ──────────────────────────────────────────────────

$serverOk = $false
try {
  $ping = Invoke-RestMethod -Method Get -Uri ($Base + "/api/sources") -TimeoutSec 10 -ErrorAction Stop
  if ($ping.ok -ne $false) {
    $serverOk = $true
    Write-Host ("[OK] Server reachable: " + $Base + " (sources: " + @($ping.sources).Count + " total)") -ForegroundColor Green
  }
} catch {
  Write-Host ("[WARN] Server not reachable at " + $Base + ": " + $_.Exception.Message) -ForegroundColor Yellow
  Write-Host "       Start the dev server with 'pnpm dev' first." -ForegroundColor DarkGray
  if ($Apply) {
    Write-Host "[FAIL] Cannot apply imports without a running server." -ForegroundColor Red
    exit 1
  }
}
Write-Host ""

# ── Process each candidate ────────────────────────────────────────────────────

$insertedCount     = 0
$updatedCount      = 0
$alreadyExistsCount = 0
$failedCount       = 0
$skippedDryRun     = 0

$tableRows = @()

foreach ($src in $candidates) {
  $nameTrunc = if ($src.name.Length -gt 28) { $src.name.Substring(0,25) + "..." } else { $src.name }
  $urlTrunc  = if ($src.url.Length  -gt 50) { $src.url.Substring(0,47)  + "..." } else { $src.url  }

  $noteContent = "origin:" + $src.origin + " | importedFrom:" + $src.importedFrom +
    " | tier:" + $src.tier + " | priority:" + $src.priority +
    " | official:" + $src.official + " | healthStatus:" + $src.status

  if ($src.riskNotes) { $noteContent += " | risk:" + $src.riskNotes }

  $noteShort = if ($noteContent.Length -gt 255) { $noteContent.Substring(0, 252) + "..." } else { $noteContent }

  $action = "dry_run"
  $reason = ""
  $enabled = $true

  if ($Apply -and $serverOk) {
    $body = @{
      name               = $src.name
      url                = $src.url
      source_tier        = $src.tier
      category           = $src.category
      is_official        = $src.official
      is_user_curated    = $false
      user_source_label  = "Bundle"
      user_source_note   = $noteShort
      user_source_priority = 10
      platform           = "rss"
      data_origin        = "real"
    }

    $bodyJson = $body | ConvertTo-Json -Compress
    try {
      $resp = Invoke-RestMethod -Method Post -Uri ($Base + "/api/sources") `
        -Body $bodyJson -ContentType "application/json" -TimeoutSec 20 -ErrorAction Stop
      if ($resp.ok) {
        $action  = "insert"
        $reason  = "inserted (id:" + $resp.source.id.Substring(0,8) + ")"
        $insertedCount++
      } else {
        $action = "failed"
        $reason = $resp.error
        $failedCount++
        $allOk = $false
      }
    } catch {
      $statusCode = 0
      if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
      }
      if ($statusCode -eq 409) {
        $action = "already_exists"
        $reason = "URL or name already in sources table"
        $alreadyExistsCount++
      } else {
        $rawErr = $_.Exception.Message
        $action = "failed"
        $reason = $rawErr.Substring(0, [Math]::Min(60, $rawErr.Length))
        $failedCount++
        $allOk = $false
      }
    }
  } else {
    $action = "dry_run"
    $reason = "pass -Apply to insert"
    $skippedDryRun++
  }

  $actionColor = switch ($action) {
    "insert"        { "Green"  }
    "already_exists"{ "Cyan"   }
    "dry_run"       { "Gray"   }
    "failed"        { "Red"    }
    default         { "Gray"   }
  }
  Write-Host ("  [" + $action.ToUpper().PadRight(14) + "] " + $nameTrunc) -ForegroundColor $actionColor
  if ($reason) { Write-Host ("                         " + $reason) -ForegroundColor DarkGray }

  $tableRows += [PSCustomObject]@{
    Name         = $nameTrunc
    URL          = $urlTrunc
    BundleStatus = $src.status
    Action       = $action
    Reason       = if ($reason.Length -gt 35) { $reason.Substring(0,32) + "..." } else { $reason }
    Enabled      = $enabled
    Tier         = $src.tier
    Pri          = $src.priority
    Official     = $src.official
    Origin       = $src.origin -replace "ai_news_radar","aiRadar"
  }
}

# ── Table ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "── Import Results ────────────────────────────────────────────────────" -ForegroundColor Cyan
$tableRows | Format-Table -AutoSize

# ── Statistics ─────────────────────────────────────────────────────────────────

Write-Host "── Statistics ────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ("candidatesTotal:    " + $candidates.Count)
Write-Host ("healthyCount:       " + @($allResults | Where-Object { $_.status -eq "healthy" }).Count)
Write-Host ("usableCount:        " + @($allResults | Where-Object { $_.status -eq "usable"  }).Count)
Write-Host ("skippedFailedCount: " + $skippedFailed)
Write-Host ("skippedWeakCount:   " + $skippedWeak)
if ($Apply) {
  Write-Host ("insertedCount:      " + $insertedCount)  -ForegroundColor Green
  Write-Host ("alreadyExistsCount: " + $alreadyExistsCount) -ForegroundColor Cyan
  Write-Host ("failedCount:        " + $failedCount)    -ForegroundColor Red
} else {
  Write-Host ("insertedCount:      0 (dry-run)")
  Write-Host ("alreadyExistsCount: n/a (dry-run)")
  Write-Host ("failedCount:        0 (dry-run)")
}
Write-Host ""

Write-Host "=== RESULT ===" -ForegroundColor Cyan
if (-not $Apply) {
  Write-Host "RESULT: DRY-RUN (pass -Apply to insert " + $candidates.Count + " source(s))" -ForegroundColor Yellow
  exit 0
} elseif ($allOk -and $failedCount -eq 0) {
  Write-Host ("RESULT: PASS (" + $insertedCount + " inserted, " + $alreadyExistsCount + " already existed)") -ForegroundColor Green
  exit 0
} else {
  Write-Host ("RESULT: WARN (" + $failedCount + " failed, " + $insertedCount + " inserted)") -ForegroundColor Yellow
  exit 0
}
