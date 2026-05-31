param(
  [string]$Base = "http://localhost:3000",
  [switch]$SkipPipelineTrigger
)

$ErrorActionPreference = "Stop"
$allOk = $true

function Mark-Ok([string]$msg) { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Mark-Warn([string]$msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Mark-Fail([string]$msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:allOk = $false }
function Mark-Info([string]$msg) { Write-Host "[INFO] $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "=== Verify Recommendations Pipeline ===" -ForegroundColor Cyan
Write-Host "Base: $Base"
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

#
# 1) Health Check
#
$healthUrl = $Base + "/api/recommendations/health"
Write-Host "1) Health Check: $healthUrl"
try {
  $health = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec 20
  if ($health.ok) {
    Mark-Ok "health ok=true"
  } else {
    Mark-Fail "health ok=false"
  }
} catch {
  Mark-Fail "health request failed: $($_.Exception.Message)"
}
Write-Host ""

#
# 2) Pipeline Status
#
$pipelineStatusUrl = $Base + "/api/pipeline/recommendations"
Write-Host "2) Pipeline Status: $pipelineStatusUrl"
try {
  $status = Invoke-RestMethod -Method Get -Uri $pipelineStatusUrl -TimeoutSec 20
  if (-not $status.ok) {
    Mark-Fail "pipeline status ok=false"
  } else {
    Mark-Ok "pipeline status ok=true"
    if ($null -eq $status.freshness) { Mark-Fail "freshness missing" } else { Mark-Ok "freshness present" }
    if ($null -eq $status.coverage) { Mark-Fail "coverage missing" } else { Mark-Ok "coverage present" }
    if ($null -eq $status.automation) { Mark-Fail "automation missing" } else { Mark-Ok "automation present" }
    if ($status.freshness -and $status.freshness.message) {
      Mark-Info "freshness: $($status.freshness.severity) | $($status.freshness.message)"
    }
    if ($status.coverage) {
      Mark-Info "coverage: fetched24h=$($status.coverage.fetchedLast24h) total=$($status.coverage.totalActive)"
    }
    if ($status.automation) {
      Mark-Info "automation: cron=$($status.automation.vercelCronConfigured) localTask=$($status.automation.localTaskScriptAvailable)"
    }
  }
} catch {
  Mark-Fail "pipeline status request failed: $($_.Exception.Message)"
}
Write-Host ""

#
# 3) Trigger Pipeline
#
if ($SkipPipelineTrigger) {
  Mark-Warn "3) Trigger Pipeline skipped by -SkipPipelineTrigger"
} else {
  $triggerUrl = $Base + "/api/pipeline/recommendations" +
    "?ingest=true" +
    "&refresh=true" +
    "&maxSources=8" +
    "&ingestTimeoutMs=55000" +
    "&mode=manual"
  Write-Host "3) Trigger Pipeline: $triggerUrl"
  try {
    $trigger = Invoke-RestMethod -Method Post -Uri $triggerUrl -TimeoutSec 120
    if ($trigger.status -eq "already_running") {
      Mark-Warn "pipeline already_running"
    } elseif ($trigger.ok -and ($trigger.status -eq "success" -or $trigger.status -eq "partial_success")) {
      Mark-Ok "pipeline trigger status=$($trigger.status)"
    } else {
      Mark-Fail "pipeline trigger failed status=$($trigger.status)"
    }
  } catch {
    Mark-Fail "pipeline trigger request failed: $($_.Exception.Message)"
  }
}
Write-Host ""

#
# 4) Query Recommendations
#
$recommendationsUrl = $Base + "/api/recommendations?windowHours=72&limit=30"
Write-Host "4) Query Recommendations: $recommendationsUrl"
try {
  $rec = Invoke-RestMethod -Method Get -Uri $recommendationsUrl -TimeoutSec 20
  if (-not $rec.ok) {
    Mark-Fail "recommendations ok=false"
  } else {
    Mark-Ok "recommendations ok=true"
    if ($rec.source -eq "snapshot") { Mark-Ok "source=snapshot" } else { Mark-Warn "source=$($rec.source)" }
    $itemsCount = 0
    if ($rec.items) { $itemsCount = $rec.items.Count }
    if ($itemsCount -gt 0) { Mark-Ok "items count=$itemsCount" } else { Mark-Warn "items count=0" }
    if ($rec.stats) {
      Mark-Info "stats: candidates=$($rec.stats.recommendationCandidates) MR=$($rec.stats.mustReadCount) HV=$($rec.stats.highValueCount)"
    }
  }
} catch {
  Mark-Fail "recommendations request failed: $($_.Exception.Message)"
}
Write-Host ""

#
# 5) List Snapshots
#
$snapshotsUrl = $Base + "/api/recommendations/snapshots?limit=10"
Write-Host "5) List Snapshots: $snapshotsUrl"
try {
  $snaps = Invoke-RestMethod -Method Get -Uri $snapshotsUrl -TimeoutSec 20
  if ($snaps.ok) {
    Mark-Ok "snapshots ok=true count=$($snaps.count)"
  } else {
    Mark-Fail "snapshots ok=false"
  }
} catch {
  Mark-Fail "snapshots request failed: $($_.Exception.Message)"
}
Write-Host ""

#
# 6) List Runs
#
$runsUrl = $Base + "/api/recommendations/runs?limit=10"
Write-Host "6) List Runs: $runsUrl"
try {
  $runs = Invoke-RestMethod -Method Get -Uri $runsUrl -TimeoutSec 20
  if ($runs.ok) {
    Mark-Ok "runs ok=true count=$($runs.count)"
  } else {
    Mark-Fail "runs ok=false"
  }
} catch {
  Mark-Fail "runs request failed: $($_.Exception.Message)"
}
Write-Host ""

Write-Host "=== Summary ==="
if ($allOk) {
  Write-Host "RESULT: PASS" -ForegroundColor Green
  exit 0
} else {
  Write-Host "RESULT: FAIL" -ForegroundColor Red
  exit 1
}
