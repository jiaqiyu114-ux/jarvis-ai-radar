# ============================================================
#  JARVIS - Run Recommendation Pipeline (Single Execution)
#
#  Triggers one complete pipeline run:
#    1. RSS ingest (up to 8 sources, 55 s deadline)
#    2. Recommendation snapshot generation (72 h window)
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\run-recommendation-pipeline.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\run-recommendation-pipeline.ps1 -Base "http://localhost:3001"
#    powershell -ExecutionPolicy Bypass -File scripts\run-recommendation-pipeline.ps1 -MaxSources 6
#
#  Future automation:
#    Windows Task Scheduler:
#      Action: powershell -ExecutionPolicy Bypass -File "C:\path\to\jarvis\scripts\run-recommendation-pipeline.ps1"
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
  [string]$Mode             = "manual"
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

# Build URL by concatenation — avoids PowerShell parsing & as call operator
$url = $Base + "/api/pipeline/recommendations" +
  "?ingest=true" +
  "&refresh=true" +
  "&maxSources=$MaxSources" +
  "&ingestTimeoutMs=$IngestTimeoutMs" +
  "&refreshWindowHours=$WindowHours" +
  "&refreshLimit=$RefreshLimit" +
  "&mode=$Mode"

Write-Host "Calling: POST /api/pipeline/recommendations" -ForegroundColor Yellow
Write-Host "  (this may take up to $([math]::Round(($IngestTimeoutMs / 1000) + 15)) seconds)" -ForegroundColor Gray
Write-Host ""

try {
  $startTime = Get-Date
  $result = Invoke-RestMethod -Method Post -Uri $url -TimeoutSec 120 -ErrorAction Stop
  $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

  Write-Host "--- Result ---" -ForegroundColor Cyan
  Write-Host "  status     : $($result.status)" -ForegroundColor $(if ($result.ok) { "Green" } else { "Red" })
  Write-Host "  durationMs : $($result.durationMs)"
  Write-Host "  mode       : $($result.mode)"
  Write-Host ""

  if ($result.ingest -and $result.ingest.enabled) {
    Write-Host "--- Ingest ---" -ForegroundColor Yellow
    Write-Host "  ok         : $($result.ingest.ok)"
    Write-Host "  runStatus  : $($result.ingest.runStatus)"
    if ($result.ingest.sources) {
      Write-Host "  sources    : $($result.ingest.sources.successful)ok / $($result.ingest.sources.failed)fail / $($result.ingest.sources.timedOut)timeout / $($result.ingest.sources.skipped)skipped"
    }
    if ($result.ingest.items) {
      Write-Host "  items      : +$($result.ingest.items.insertedItems) new / ~$($result.ingest.items.reusedItems) reused"
    }
    if ($result.ingest.failedSources -and $result.ingest.failedSources.Count -gt 0) {
      Write-Host "  failedSources:" -ForegroundColor Red
      foreach ($fs in $result.ingest.failedSources) {
        Write-Host "    - $($fs.name): $($fs.reason)" -ForegroundColor Red
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
      Write-Host "  captured   : $($result.refresh.stats.capturedTotal)"
    }
    if ($result.refresh.snapshot) {
      Write-Host "  snapshot   : $($result.refresh.snapshot.id)" -ForegroundColor Green
    } else {
      Write-Host "  snapshot   : (not created)" -ForegroundColor Yellow
    }
    if ($result.refresh.run) {
      Write-Host "  run.id     : $($result.refresh.run.id)"
    }
    Write-Host ""
  }

  if ($result.hints -and $result.hints.Count -gt 0) {
    Write-Host "--- Hints ---" -ForegroundColor Gray
    foreach ($hint in $result.hints) {
      Write-Host "  $hint" -ForegroundColor Gray
    }
    Write-Host ""
  }

  Write-Host "Finished in ${elapsed}s" -ForegroundColor $(if ($result.ok) { "Green" } else { "Red" })

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
