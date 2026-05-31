# ============================================================
#  JARVIS - Run Recommendation Pipeline (Single Execution)
#
#  Triggers one complete pipeline run:
#    1. RSS ingest (up to MaxSources sources, IngestTimeoutMs deadline)
#    2. Recommendation snapshot generation (WindowHours window)
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\run-recommendation-pipeline.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\run-recommendation-pipeline.ps1 -MaxSources 4
#    powershell -ExecutionPolicy Bypass -File scripts\run-recommendation-pipeline.ps1 -Mode scheduled -Secret "mysecret"
#
#  Future automation:
#    Windows Task Scheduler:
#      Action: powershell -ExecutionPolicy Bypass -File "C:\path\jarvis\scripts\run-recommendation-pipeline.ps1" -Mode scheduled -Secret "mysecret"
#      Trigger: Daily / Every 6 hours
#
#  This script runs ONCE. It does not loop.
# ============================================================

param(
  [string]$Base             = "http://localhost:3000",
  [int]   $MaxSources       = 8,
  [int]   $IngestTimeoutMs  = 55000,
  [int]   $WindowHours      = 72,
  [int]   $RefreshLimit     = 50,
  [string]$Mode             = "manual",
  [string]$Secret           = ""
)

Write-Host ""
Write-Host "=== JARVIS Recommendation Pipeline ===" -ForegroundColor Cyan
Write-Host "  Base        : $Base"
Write-Host "  MaxSources  : $MaxSources"
Write-Host "  IngestTimeout: ${IngestTimeoutMs}ms"
Write-Host "  Window      : ${WindowHours}h"
Write-Host "  Mode        : $Mode"
Write-Host "  Started     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# Check freshness before running
$statusUrl = $Base + "/api/pipeline/recommendations"
Write-Host "Checking pipeline status..." -ForegroundColor Gray
try {
  $status = Invoke-RestMethod -Method Get -Uri $statusUrl -TimeoutSec 15 -ErrorAction Stop
  if ($status.freshness) {
    $sev = $status.freshness.severity
    $sevColor = switch ($sev) { "ok" { "Green" } "warning" { "Yellow" } "stale" { "Red" } default { "Gray" } }
    Write-Host "  Freshness   : [$sev] $($status.freshness.reason)" -ForegroundColor $sevColor
  }
  if ($status.coverage) {
    Write-Host "  Coverage    : $($status.coverage.fetchedLast24h)/$($status.coverage.totalActiveRss) fetched last 24h" -ForegroundColor Gray
  }
} catch {
  Write-Host "  (status check failed: $_)" -ForegroundColor DarkGray
}
Write-Host ""

# Build URL by concatenation — avoids PowerShell parsing & as call operator
$url = $Base + "/api/pipeline/recommendations" +
  "?ingest=true" +
  "&refresh=true" +
  "&maxSources=$MaxSources" +
  "&ingestTimeoutMs=$IngestTimeoutMs" +
  "&refreshWindowHours=$WindowHours" +
  "&refreshLimit=$RefreshLimit" +
  "&mode=$Mode"

Write-Host "Calling: POST /api/pipeline/recommendations (mode=$Mode)" -ForegroundColor Yellow
Write-Host "  (this may take up to $([math]::Round(($IngestTimeoutMs / 1000) + 15)) seconds)" -ForegroundColor Gray
Write-Host ""

$headers = @{}
if ($Mode -eq "scheduled" -and $Secret -ne "") {
  $headers["Authorization"] = "Bearer $Secret"
  Write-Host "  Auth: Bearer token set" -ForegroundColor Gray
}

try {
  $startTime = Get-Date
  $result = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -TimeoutSec 120 -ErrorAction Stop
  $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

  # ── Handle already_running ────────────────────────────────────────────────
  if ($result.status -eq "already_running") {
    Write-Host "--- Already Running ---" -ForegroundColor Yellow
    Write-Host "  Pipeline is already running (started $($result.run.ageMinutes)m ago)." -ForegroundColor Yellow
    Write-Host "  Wait for it to finish, then run again." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Done (already_running)" -ForegroundColor Yellow
    exit 0
  }

  Write-Host "--- Result ---" -ForegroundColor Cyan
  $statusColor = if ($result.ok) { "Green" } elseif ($result.status -eq "partial_success") { "Yellow" } else { "Red" }
  Write-Host "  status     : $($result.status)" -ForegroundColor $statusColor
  Write-Host "  durationMs : $($result.durationMs)"
  Write-Host "  mode       : $($result.mode)"
  Write-Host ""

  if ($result.ingest -and $result.ingest.enabled) {
    Write-Host "--- Ingest ---" -ForegroundColor Yellow
    Write-Host "  ok         : $($result.ingest.ok)"
    Write-Host "  runStatus  : $($result.ingest.runStatus)"
    if ($result.ingest.sources) {
      Write-Host "  sources    : $($result.ingest.sources.successful)ok / $($result.ingest.sources.failed)fail / $($result.ingest.sources.timedOut)timeout"
    }
    if ($result.ingest.items) {
      Write-Host "  items      : +$($result.ingest.items.insertedItems) new / ~$($result.ingest.items.reusedItems) reused"
    }
    if ($result.ingest.sourceSelection) {
      $sel = $result.ingest.sourceSelection
      Write-Host "  selected   : $($sel.selectedCount) sources / $($sel.deferredCount) deferred" -ForegroundColor Cyan
      if ($sel.selectedSources -and $sel.selectedSources.Count -gt 0) {
        foreach ($src in $sel.selectedSources | Select-Object -First 5) {
          Write-Host "    + [$($src.tier)] $($src.name)" -ForegroundColor Cyan
        }
      }
    }
    if ($result.ingest.failedSources -and $result.ingest.failedSources.Count -gt 0) {
      foreach ($fs in $result.ingest.failedSources | Select-Object -First 3) {
        Write-Host "    x $($fs.name): $($fs.reason)" -ForegroundColor Red
      }
    }
    Write-Host ""
  }

  if ($result.refresh -and $result.refresh.enabled) {
    Write-Host "--- Refresh ---" -ForegroundColor Yellow
    Write-Host "  ok         : $($result.refresh.ok)"
    Write-Host "  runStatus  : $($result.refresh.runStatus)"
    if ($result.refresh.stats) {
      Write-Host "  must_read  : $($result.refresh.stats.mustReadCount)"
      Write-Host "  high_value : $($result.refresh.stats.highValueCount)"
      Write-Host "  observe    : $($result.refresh.stats.observeCount)"
    }
    if ($result.refresh.snapshot) {
      Write-Host "  snapshot   : $($result.refresh.snapshot.id)" -ForegroundColor Green
    }
    Write-Host ""
  }

  if ($result.hints -and $result.hints.Count -gt 0) {
    Write-Host "--- Hints ---" -ForegroundColor Gray
    foreach ($hint in $result.hints | Select-Object -First 5) {
      Write-Host "  $hint" -ForegroundColor Gray
    }
    Write-Host ""
  }

  Write-Host "Finished in ${elapsed}s" -ForegroundColor $statusColor

} catch {
  Write-Host "FAILED: $_" -ForegroundColor Red
  Write-Host ""
  Write-Host "Possible causes:" -ForegroundColor Yellow
  Write-Host "  - pnpm dev is not running at $Base"
  Write-Host "  - Supabase is not configured (.env.local missing)"
  Write-Host "  - Request timed out (pipeline ran too long)"
  exit 1
}

Write-Host ""
