param(
  [string]$Base = "http://localhost:3000",
  [int]$MaxSources = 8,
  [int]$IngestTimeoutMs = 55000,
  [int]$WindowHours = 72,
  [ValidateSet("manual", "scheduled", "auto")]
  [string]$Mode = "manual",
  [string]$Secret = "",
  [string]$LogFile = ""
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$msg) { Write-Host "[INFO] $msg" -ForegroundColor Gray }
function Write-Ok([string]$msg) { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

function Append-Log([string]$line) {
  if ([string]::IsNullOrWhiteSpace($LogFile)) { return }
  try {
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
  } catch {
    Write-Warn "failed to append log file: $($_.Exception.Message)"
  }
}

$startedAt = Get-Date
$startedIso = $startedAt.ToString("s")

Write-Host ""
Write-Host "=== JARVIS Recommendation Pipeline ===" -ForegroundColor Cyan
Write-Host "Base            : $Base"
Write-Host "Mode            : $Mode"
Write-Host "MaxSources      : $MaxSources"
Write-Host "IngestTimeoutMs : $IngestTimeoutMs"
Write-Host "WindowHours     : $WindowHours"
Write-Host "StartedAt       : $startedIso"
if (-not [string]::IsNullOrWhiteSpace($LogFile)) {
  Write-Host "LogFile         : $LogFile"
}
Write-Host ""

$effectiveSecret = $Secret
if (($Mode -eq "scheduled" -or $Mode -eq "auto") -and [string]::IsNullOrWhiteSpace($effectiveSecret)) {
  $effectiveSecret = [Environment]::GetEnvironmentVariable("PIPELINE_SECRET")
}

$headers = @{}
if (($Mode -eq "scheduled" -or $Mode -eq "auto")) {
  if ([string]::IsNullOrWhiteSpace($effectiveSecret)) {
    Write-Warn "PIPELINE_SECRET is empty for scheduled/auto mode. continuing for local dev."
  } else {
    $headers["Authorization"] = "Bearer $effectiveSecret"
    Write-Info "authorization header attached"
  }
}

$url = $Base + "/api/pipeline/recommendations" +
  "?ingest=true" +
  "&refresh=true" +
  "&maxSources=$MaxSources" +
  "&ingestTimeoutMs=$IngestTimeoutMs" +
  "&refreshWindowHours=$WindowHours" +
  "&refreshLimit=50" +
  "&mode=$Mode"

Write-Info "POST $url"
Append-Log "[$startedIso] started mode=$Mode maxSources=$MaxSources ingestTimeoutMs=$IngestTimeoutMs windowHours=$WindowHours"

try {
  $apiStarted = Get-Date
  $result = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -TimeoutSec 120
  $apiFinished = Get-Date
  $durationMs = [math]::Round(($apiFinished - $apiStarted).TotalMilliseconds)
  $finishedIso = $apiFinished.ToString("s")

  $status = [string]$result.status
  if ($status -eq "already_running") {
    Write-Warn "already_running: another pipeline run is active"
    Append-Log "[$finishedIso] status=already_running durationMs=$durationMs"
    exit 0
  }

  $ingestSummary = ""
  $refreshSummary = ""
  $snapshotId = ""

  if ($result.ingest -and $result.ingest.enabled) {
    $ingestSummary = "ingestOk=$($result.ingest.ok); sources=$($result.ingest.sources.successful)ok/$($result.ingest.sources.failed)fail/$($result.ingest.sources.timedOut)timeout; items=+$($result.ingest.items.insertedItems)/~$($result.ingest.items.reusedItems)"
  }
  if ($result.refresh -and $result.refresh.enabled) {
    $refreshSummary = "refreshOk=$($result.refresh.ok); runStatus=$($result.refresh.runStatus); MR=$($result.refresh.stats.mustReadCount); HV=$($result.refresh.stats.highValueCount); OB=$($result.refresh.stats.observeCount)"
    if ($result.refresh.snapshot -and $result.refresh.snapshot.id) {
      $snapshotId = [string]$result.refresh.snapshot.id
    }
  }

  if ($result.ok -eq $true) {
    if ($status -eq "partial_success") {
      Write-Warn "pipeline finished: partial_success"
    } else {
      Write-Ok "pipeline finished: $status"
    }
  } else {
    Write-Fail "pipeline finished: $status"
  }

  Write-Info "durationMs: $durationMs"
  if ($ingestSummary -ne "") { Write-Info $ingestSummary }
  if ($refreshSummary -ne "") { Write-Info $refreshSummary }
  if ($snapshotId -ne "") { Write-Info "snapshotId: $snapshotId" }

  Append-Log "[$finishedIso] status=$status durationMs=$durationMs $ingestSummary $refreshSummary snapshotId=$snapshotId"

  if ($result.ok -eq $true) {
    exit 0
  } else {
    exit 1
  }
} catch {
  $finished = Get-Date
  $finishedIso = $finished.ToString("s")
  $errMsg = $_.Exception.Message
  Write-Fail $errMsg
  Append-Log "[$finishedIso] status=error error=$errMsg"
  exit 1
}
