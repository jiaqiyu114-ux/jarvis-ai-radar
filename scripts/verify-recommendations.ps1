# ============================================================
#  JARVIS - Recommendation Pipeline Verification Script
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\verify-recommendations.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\verify-recommendations.ps1 -SkipPipeline
#    powershell -ExecutionPolicy Bypass -File scripts\verify-recommendations.ps1 -SkipRefresh -Base "http://localhost:3001"
# ============================================================

param(
  [string]$Base         = "http://localhost:3000",
  [switch]$SkipPipeline,
  [switch]$SkipRefresh
)

$ok  = $true
$sep = "----------------------------------------------"

function Print-Ok   ([string]$msg) { Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Print-Warn ([string]$msg) { Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Print-Fail ([string]$msg) { Write-Host "  [NG]  $msg" -ForegroundColor Red; $script:ok = $false }
function Print-Info ([string]$msg) { Write-Host "        $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "=== JARVIS Recommendation Verification ===" -ForegroundColor Cyan
Write-Host "  Base URL : $Base"
Write-Host "  Time     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# ── 1. Health ──────────────────────────────────────────────

Write-Host $sep
Write-Host "[1/6] Health Check" -ForegroundColor Yellow
$healthUrl = $Base + "/api/recommendations/health"
try {
  $h = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec 15 -ErrorAction Stop
  if ($h.ok) {
    Print-Ok "health: ok"
    Print-Info "activeRss    : $($h.sources.activeRss)"
    Print-Info "items last24h: $($h.items.last24h)"
    Print-Info "items last72h: $($h.items.last72h)"
    if ($h.recommendations) {
      Print-Info "candidates   : $($h.recommendations.recommendationCandidates)"
    }
    if ($h.emptyReason) { Print-Warn "emptyReason: $($h.emptyReason)" }
  } else {
    Print-Fail "health returned ok=false: $($h.error)"
  }
} catch {
  Print-Fail "health request failed: $_"
}

# ── 2. Pipeline (ingest + refresh) ─────────────────────────

Write-Host ""
Write-Host $sep
if ($SkipPipeline) {
  Write-Host "[2/6] Pipeline -- SKIPPED (omit -SkipPipeline to enable)" -ForegroundColor DarkGray
} else {
  Write-Host "[2/6] Trigger Pipeline (POST /api/pipeline/recommendations)" -ForegroundColor Yellow

  # Build URL by concatenation so & is never parsed as a PS operator
  $pipelineUrl = $Base + "/api/pipeline/recommendations" +
    "?ingest=true" +
    "&refresh=true" +
    "&maxSources=8" +
    "&ingestTimeoutMs=55000" +
    "&mode=manual"

  try {
    $p = Invoke-RestMethod -Method Post -Uri $pipelineUrl -TimeoutSec 90 -ErrorAction Stop
    if ($p.ok) {
      Print-Ok "pipeline: $($p.status)"
      Print-Info "durationMs : $($p.durationMs)"
      if ($p.ingest -and $p.ingest.enabled) {
        Print-Info "ingest ok  : $($p.ingest.ok) | sources=$($p.ingest.sources.successful)ok/$($p.ingest.sources.failed)fail"
        Print-Info "items      : +$($p.ingest.items.insertedItems) new / ~$($p.ingest.items.reusedItems) reused"
      }
      if ($p.refresh -and $p.refresh.enabled) {
        Print-Info "refresh ok : $($p.refresh.ok) | status=$($p.refresh.runStatus)"
        if ($p.refresh.stats) {
          Print-Info "MR=$($p.refresh.stats.mustReadCount)  HV=$($p.refresh.stats.highValueCount)  OB=$($p.refresh.stats.observeCount)"
        }
        if ($p.refresh.snapshot) {
          Print-Info "snapshotId : $($p.refresh.snapshot.id)"
        }
      }
    } else {
      Print-Fail "pipeline returned ok=false: $($p.error) status=$($p.status)"
    }
  } catch {
    Print-Fail "pipeline request failed: $_"
  }
}

# ── 3. Recommendations ─────────────────────────────────────

Write-Host ""
Write-Host $sep
Write-Host '[3/6] Query Recommendations (GET ?windowHours=72&limit=30)' -ForegroundColor Yellow

$recUrl = $Base + '/api/recommendations?windowHours=72&limit=30'
try {
  $rec = Invoke-RestMethod -Method Get -Uri $recUrl -TimeoutSec 15 -ErrorAction Stop
  if ($rec.ok) {
    if ($rec.source -eq "snapshot") {
      Print-Ok "recommendations ok  source=$($rec.source)"
    } else {
      Print-Warn "recommendations ok  source=$($rec.source) (not snapshot)"
    }
    Print-Info "capturedTotal: $($rec.stats.capturedTotal)"
    Print-Info "candidates   : $($rec.stats.recommendationCandidates)"
    Print-Info "must read    : $($rec.stats.mustReadCount)"
    Print-Info "high value   : $($rec.stats.highValueCount)"
    Print-Info "observe      : $($rec.stats.observeCount)"
    Print-Info "items count  : $($rec.items.Count)"
    if ($rec.source -ne "snapshot") {
      Print-Warn "Not using snapshot. Run pipeline to generate one."
    }
  } else {
    Print-Fail "recommendations returned ok=false: $($rec.error)"
  }
} catch {
  Print-Fail "recommendations request failed: $_"
}

# ── 4. Snapshots ───────────────────────────────────────────

Write-Host ""
Write-Host $sep
Write-Host '[4/6] List Snapshots (GET /api/recommendations/snapshots?limit=10)' -ForegroundColor Yellow

$snapsUrl = $Base + '/api/recommendations/snapshots?limit=10'
try {
  $snaps = Invoke-RestMethod -Method Get -Uri $snapsUrl -TimeoutSec 15 -ErrorAction Stop
  Print-Ok "snapshot count: $($snaps.count)"
  if ($snaps.snapshots.Count -gt 0) {
    $latest = $snaps.snapshots[0]
    Print-Info "latest status     : $($latest.status)"
    Print-Info "latest generatedAt: $($latest.generatedAt)"
    Print-Info "MR=$($latest.mustReadCount)  HV=$($latest.highValueCount)  OB=$($latest.observeCount)"
  } else {
    Print-Warn "No snapshots found. Run pipeline to generate one."
  }
} catch {
  Print-Fail "snapshots request failed: $_"
}

# ── 5. Runs ────────────────────────────────────────────────

Write-Host ""
Write-Host $sep
Write-Host '[5/6] List Runs (GET /api/recommendations/runs?limit=10)' -ForegroundColor Yellow

$runsUrl = $Base + '/api/recommendations/runs?limit=10'
try {
  $runs = Invoke-RestMethod -Method Get -Uri $runsUrl -TimeoutSec 15 -ErrorAction Stop
  Print-Ok "runs count: $($runs.count)"
  if ($runs.runs.Count -gt 0) {
    $lr = $runs.runs[0]
    Print-Info "latest status    : $($lr.status)"
    Print-Info "latest durationMs: $($lr.durationMs)"
    Print-Info "latest startedAt : $($lr.startedAt)"
  } else {
    Print-Warn "No runs found. Runs are created by POST /api/recommendations/refresh or POST /api/pipeline/recommendations."
  }
} catch {
  Print-Fail "runs request failed: $_"
}

# ── 6. Direct Refresh (optional) ──────────────────────────

Write-Host ""
Write-Host $sep
if ($SkipRefresh) {
  Write-Host '[6/6] Direct Refresh -- SKIPPED (omit -SkipRefresh to enable)' -ForegroundColor DarkGray
} else {
  Write-Host "[6/6] Direct Refresh (POST /api/recommendations/refresh)" -ForegroundColor Yellow
  $refreshUrl = $Base + "/api/recommendations/refresh"
  try {
    $r = Invoke-RestMethod -Method Post -Uri $refreshUrl -TimeoutSec 30 -ErrorAction Stop
    if ($r.ok) {
      Print-Ok "refresh: $($r.runStatus)"
      Print-Info "durationMs : $($r.durationMs)"
      if ($r.snapshot) {
        Print-Info "snapshotId : $($r.snapshot.id)"
      }
      if ($r.stats) {
        Print-Info "MR=$($r.stats.mustReadCount)  HV=$($r.stats.highValueCount)  OB=$($r.stats.observeCount)"
      }
    } else {
      Print-Fail "refresh returned ok=false: $($r.error)"
    }
  } catch {
    Print-Fail "refresh request failed: $_"
  }
}

# ── Summary ────────────────────────────────────────────────

# ── Rotation Spot-Check ────────────────────────────────────────────────────────

Write-Host ""
Write-Host $sep
Write-Host "[Bonus] Source Rotation Spot-Check" -ForegroundColor Yellow
Write-Host "Running two pipeline calls with maxSources=4 and comparing selected sources..."

$sel1 = @()
$sel2 = @()

$rotUrl = $Base + "/api/pipeline/recommendations?ingest=true&refresh=false&maxSources=4&ingestTimeoutMs=55000"

try {
  $r1 = Invoke-RestMethod -Method Post -Uri $rotUrl -TimeoutSec 90 -ErrorAction Stop
  if ($r1.ingest -and $r1.ingest.sourceSelection -and $r1.ingest.sourceSelection.selectedSources) {
    $sel1 = $r1.ingest.sourceSelection.selectedSources | ForEach-Object { $_.name }
    Print-Info "Run 1 selected: $($sel1 -join ', ')"
  }
} catch {
  Print-Warn "Rotation run 1 failed: $_"
}

Start-Sleep -Seconds 2

try {
  $r2 = Invoke-RestMethod -Method Post -Uri $rotUrl -TimeoutSec 90 -ErrorAction Stop
  if ($r2.ingest -and $r2.ingest.sourceSelection -and $r2.ingest.sourceSelection.selectedSources) {
    $sel2 = $r2.ingest.sourceSelection.selectedSources | ForEach-Object { $_.name }
    Print-Info "Run 2 selected: $($sel2 -join ', ')"
  }
} catch {
  Print-Warn "Rotation run 2 failed: $_"
}

if ($sel1.Count -gt 0 -and $sel2.Count -gt 0) {
  $identical = ($sel1 -join ',') -eq ($sel2 -join ',')
  if ($identical) {
    Print-Warn "Both runs selected identical sources. This is OK if all other sources are fresh/cooling-down."
    Write-Host "  Note: run 'POST /api/pipeline/recommendations?maxSources=12' to see more rotation." -ForegroundColor Gray
  } else {
    Print-Ok "Source rotation working — runs selected different source sets"
  }
} else {
  Print-Warn "Could not compare rotation (sourceSelection not returned or ingest skipped)"
}

# ── Final Summary ──────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "==========================================="
if ($ok) {
  Write-Host "  RESULT: ALL CHECKS PASSED" -ForegroundColor Green
} else {
  Write-Host "  RESULT: SOME CHECKS FAILED -- see [NG] lines above" -ForegroundColor Red
}
Write-Host ""
