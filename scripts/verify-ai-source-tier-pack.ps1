param(
  [string]$Base       = "http://localhost:3000",
  [string]$BundleFile = "config\source-bundles\ai-source-tier-pack-v1.json"
)

$ErrorActionPreference = "Continue"
$PackName = "ai-source-tier-pack-v1"
$ValidTiers = @("S","A","B","C","D")
$MinRssEnabled = 12

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Verify AI Source Tier Pack ===" -ForegroundColor Cyan
Write-Host ("Base:       " + $Base)
Write-Host ("BundleFile: " + $BundleFile)
Write-Host ("Time:       " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ""

$warnings = @()
$failures = @()

# ── Check 1: bundle JSON readable + fields valid ──────────────────────────────

Write-Host "-- Check 1: Bundle JSON structure ---------------------------------------" -ForegroundColor Cyan

$bundlePath = Join-Path (Get-Location) $BundleFile
if (-not (Test-Path $bundlePath)) {
  $bundlePath = Join-Path $PSScriptRoot ("..\$BundleFile")
}

$bundle = $null
if (-not (Test-Path $bundlePath)) {
  Write-Host ("[FAIL] Bundle not found: " + $BundleFile) -ForegroundColor Red
  $failures += "Bundle file not found"
} else {
  try {
    $raw    = [System.IO.File]::ReadAllText($bundlePath, [System.Text.Encoding]::UTF8)
    $bundle = $raw | ConvertFrom-Json
    $all    = @($bundle)
    Write-Host ("[OK]   Bundle loaded: " + $all.Count + " sources") -ForegroundColor Green

    # Required fields
    $missingTier = @($all | Where-Object { -not ($ValidTiers -contains $_.tier) })
    if ($missingTier.Count -eq 0) {
      Write-Host "[OK]   All sources have valid tier (S/A/B/C/D)" -ForegroundColor Green
    } else {
      $badNames = ($missingTier | ForEach-Object { $_.name + "=" + $_.tier }) -join ", "
      Write-Host ("[FAIL] " + $missingTier.Count + " source(s) with invalid tier: " + $badNames) -ForegroundColor Red
      $failures += ($missingTier.Count.ToString() + " sources with invalid tier")
    }

    # D tier must be disabled
    $dEnabled = @($all | Where-Object { $_.tier -eq "D" -and $_.enabled -eq $true })
    if ($dEnabled.Count -eq 0) {
      Write-Host "[OK]   D-tier sources are all disabled (none in bundle yet)" -ForegroundColor Green
    } else {
      Write-Host ("[FAIL] " + $dEnabled.Count + " D-tier source(s) have enabled=true") -ForegroundColor Red
      $failures += ($dEnabled.Count.ToString() + " D-tier sources are enabled (must be disabled)")
    }

    # Tier counts
    Write-Host ""
    Write-Host "     Tier distribution:" -ForegroundColor Gray
    foreach ($t in $ValidTiers) {
      $cnt = @($all | Where-Object { $_.tier -eq $t }).Count
      if ($cnt -gt 0) {
        $color = switch ($t) { "S" { "Yellow" } "A" { "Cyan" } "B" { "Gray" } "C" { "DarkGray" } "D" { "DarkGray" } default { "Gray" } }
        Write-Host ("     " + $t + ": " + $cnt) -ForegroundColor $color
      }
    }

    # RSS enabled count
    $rssEnabled = @($all | Where-Object { $_.platform -eq "rss" -and $_.enabled -eq $true })
    $pendingWeb = @($all | Where-Object { $_.pendingWeb -eq $true })
    Write-Host ("     RSS/enabled: " + $rssEnabled.Count)
    Write-Host ("     pendingWeb:  " + $pendingWeb.Count)

  } catch {
    Write-Host ("[FAIL] Cannot parse bundle JSON: " + $_.Exception.Message) -ForegroundColor Red
    $failures += "Bundle JSON parse error"
    $all = @()
  }
}

$all = if ($bundle) { @($bundle) } else { @() }
Write-Host ""

# ── Check 2: RSS enabled count >= minimum ─────────────────────────────────────

Write-Host "-- Check 2: Minimum RSS enabled sources ---------------------------------" -ForegroundColor Cyan
$rssEnabled = @($all | Where-Object { $_.platform -eq "rss" -and $_.enabled -eq $true })
if ($rssEnabled.Count -ge $MinRssEnabled) {
  Write-Host ("[OK]   RSS enabled sources: " + $rssEnabled.Count + " >= " + $MinRssEnabled) -ForegroundColor Green
} else {
  Write-Host ("[FAIL] RSS enabled sources: " + $rssEnabled.Count + " < " + $MinRssEnabled) -ForegroundColor Red
  $failures += ("Only " + $rssEnabled.Count + " RSS/enabled sources (minimum " + $MinRssEnabled + ")")
}
Write-Host ""

# ── Check 3: pendingWeb sources are disabled ──────────────────────────────────

Write-Host "-- Check 3: pendingWeb sources are disabled -----------------------------" -ForegroundColor Cyan
$pendingEnabled = @($all | Where-Object { $_.pendingWeb -eq $true -and $_.enabled -eq $true })
if ($pendingEnabled.Count -eq 0) {
  Write-Host "[OK]   All pendingWeb sources have enabled=false" -ForegroundColor Green
} else {
  $names = ($pendingEnabled | ForEach-Object { $_.name }) -join ", "
  Write-Host ("[FAIL] " + $pendingEnabled.Count + " pendingWeb source(s) with enabled=true: " + $names) -ForegroundColor Red
  $failures += ($pendingEnabled.Count.ToString() + " pendingWeb sources are enabled (must be false)")
}
Write-Host ""

# ── Check 4: official=true + person=true not allowed (person sources not in this pack) ───

Write-Host "-- Check 4: No official+person conflict ---------------------------------" -ForegroundColor Cyan
$personSources = @($all | Where-Object { $_.role -eq "key_person" -and $_.official -eq $true })
if ($personSources.Count -eq 0) {
  Write-Host "[OK]   No key_person sources with official=true" -ForegroundColor Green
} else {
  $names = ($personSources | ForEach-Object { $_.name }) -join ", "
  Write-Host ("[WARN] " + $personSources.Count + " key_person source(s) with official=true: " + $names) -ForegroundColor Yellow
  $warnings += ($personSources.Count.ToString() + " key_person sources have official=true")
}
Write-Host ""

# ── Check 5: DB sources with pack note not participating in ingest if web ────

Write-Host "-- Check 5: DB sources from pack have correct blocked/platform ----------" -ForegroundColor Cyan
$dbOk     = $false
$dbChecks = @()

try {
  $resp = Invoke-RestMethod -Method Get -Uri ($Base + "/api/sources") -TimeoutSec 20 -ErrorAction Stop
  $dbSources = @($resp.sources)
  $packSources = @($dbSources | Where-Object {
    $_.userSourceNote -and $_.userSourceNote.Contains($PackName)
  })

  Write-Host ("[OK]   Retrieved " + $dbSources.Count + " total DB sources") -ForegroundColor Green
  Write-Host ("       Pack sources in DB: " + $packSources.Count)

  if ($packSources.Count -gt 0) {
    # Check: web platform sources must be blocked
    $webNotBlocked = @($packSources | Where-Object { $_.platform -eq "web" -and $_.isBlocked -ne $true })
    if ($webNotBlocked.Count -eq 0) {
      Write-Host "[OK]   All web-platform pack sources are blocked in DB" -ForegroundColor Green
    } else {
      $names = ($webNotBlocked | ForEach-Object { $_.name }) -join ", "
      Write-Host ("[FAIL] " + $webNotBlocked.Count + " web-platform source(s) not blocked in DB: " + $names) -ForegroundColor Red
      $failures += ($webNotBlocked.Count.ToString() + " web sources not blocked (would enter ingest)")
    }

    # Check: pendingWeb note present on web sources
    $webSources = @($packSources | Where-Object { $_.platform -eq "web" })
    $pendingInNote = @($webSources | Where-Object { $_.userSourceNote -and $_.userSourceNote.Contains("pendingWeb:true") })
    Write-Host ("       Web sources: " + $webSources.Count + " | pendingWeb:true in note: " + $pendingInNote.Count)
  } else {
    Write-Host "[INFO] No pack sources found in DB. Run import-ai-source-tier-pack.ps1 -Apply first." -ForegroundColor Gray
    $warnings += "Pack sources not yet imported to DB"
  }
  $dbOk = $true
} catch {
  Write-Host ("[WARN] Cannot reach server: " + $_.Exception.Message) -ForegroundColor Yellow
  $warnings += "Server not reachable -- DB checks skipped"
}
Write-Host ""

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "-- Summary --------------------------------------------------------------" -ForegroundColor Cyan
Write-Host ("  S: " + @($all | Where-Object { $_.tier -eq "S" }).Count + "  (official RSS, highest trust)")
Write-Host ("  A: " + @($all | Where-Object { $_.tier -eq "A" }).Count + "  (official web/pending, high trust)")
Write-Host ("  B: " + @($all | Where-Object { $_.tier -eq "B" }).Count + "  (quality media)")
Write-Host ("  C: " + @($all | Where-Object { $_.tier -eq "C" }).Count + "  (KOL / newsletter)")
Write-Host ("  D: " + @($all | Where-Object { $_.tier -eq "D" }).Count + "  (disabled by default)")
Write-Host ("  RSS enabled:  " + @($all | Where-Object { $_.platform -eq "rss" -and $_.enabled -eq $true }).Count)
Write-Host ("  Pending web:  " + @($all | Where-Object { $_.pendingWeb -eq $true }).Count)
Write-Host ""

Write-Host "=== RESULT ===" -ForegroundColor Cyan
if ($failures.Count -gt 0) {
  Write-Host ("RESULT: FAIL (" + $failures.Count + " failure(s), " + $warnings.Count + " warning(s))") -ForegroundColor Red
  $failures | ForEach-Object { Write-Host ("  FAIL: " + $_) -ForegroundColor Red }
  if ($warnings.Count -gt 0) { $warnings | ForEach-Object { Write-Host ("  WARN: " + $_) -ForegroundColor Yellow } }
  exit 1
} elseif ($warnings.Count -gt 0) {
  Write-Host ("RESULT: WARN (" + $warnings.Count + " warning(s))") -ForegroundColor Yellow
  $warnings | ForEach-Object { Write-Host ("  WARN: " + $_) -ForegroundColor Yellow }
  exit 0
} else {
  Write-Host "RESULT: PASS" -ForegroundColor Green
  exit 0
}
