param(
  [string]$Base = "http://localhost:3000",
  [int]$SnapshotLimit = 5,
  [int]$ItemLimit = 30,
  [switch]$SkipRefresh
)

$ErrorActionPreference = "Stop"
$allOk = $true

function Ok([string]$m)   { Write-Host "[OK]   $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Fail([string]$m) { Write-Host "[FAIL] $m" -ForegroundColor Red; $script:allOk = $false }

function Test-DeepDiveObject($obj, [string]$prefix) {
  if ($null -eq $obj) { Fail "$prefix deepDive is null"; return }

  $required = @(
    "summary",
    "backgroundContext",
    "whyItMatters",
    "userInsight",
    "riskAndUncertainty",
    "followUpSuggestion",
    "sourceReadingGuide"
  )

  foreach ($k in $required) {
    if (-not ($obj.PSObject.Properties.Name -contains $k)) {
      Fail "$prefix missing field: $k"
      continue
    }
    $v = [string]$obj.$k
    if ([string]::IsNullOrWhiteSpace($v)) {
      Fail "$prefix empty field: $k"
    }
  }
}

Write-Host ""
Write-Host "=== Verify Recommendation Deep Dives ===" -ForegroundColor Cyan
Write-Host "Base: $Base"
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

if ($SkipRefresh) {
  Warn "0) Refresh skipped by -SkipRefresh"
  Write-Host ""
} else {
  $refreshUrl = "$Base/api/recommendations/refresh"
  Write-Host "0) Trigger refresh: $refreshUrl"
  try {
    $refresh = Invoke-RestMethod -Method Post -Uri $refreshUrl -TimeoutSec 120
    if ($refresh.ok) { Ok "refresh ok=true" } else { Fail "refresh ok=false" }
  } catch {
    Fail "refresh request failed: $($_.Exception.Message)"
  }
  Write-Host ""
}

$recUrl = "$Base/api/recommendations?windowHours=72&limit=$ItemLimit"
Write-Host "1) Recommendations: $recUrl"
try {
  $rec = Invoke-RestMethod -Method Get -Uri $recUrl -TimeoutSec 30
  if (-not $rec.ok) {
    Fail "recommendations ok=false"
  } else {
    Ok "recommendations ok=true source=$($rec.source)"
    if (($rec.source -ne "snapshot") -and ($rec.source -ne "live_fallback")) {
      Fail "unexpected source=$($rec.source)"
    }

    $count = if ($rec.items) { $rec.items.Count } else { 0 }
    if ($count -eq 0) {
      Warn "no recommendation items to verify"
    } else {
      Ok "items=$count"
      $checkCount = [Math]::Min($count, 10)
      for ($i = 0; $i -lt $checkCount; $i++) {
        $it = $rec.items[$i]
        Test-DeepDiveObject $it.deepDive "recommendations[$i]"

        $summary80 = ""
        if ($it.deepDive -and $it.deepDive.summary) {
          $s = [string]$it.deepDive.summary
          $summary80 = if ($s.Length -gt 80) { $s.Substring(0, 80) + "..." } else { $s }
        }

        Write-Host ("  - [{0}] {1} | tier={2} | status={3} | model={4} | summary={5}" -f `
          $i, ([string]$it.title), ([string]$it.recommendationTier), ([string]$it.deepDive.status), ([string]$it.deepDive.model), $summary80)
      }
    }
  }
} catch {
  Fail "recommendations request failed: $($_.Exception.Message)"
}
Write-Host ""

$snapUrl = "$Base/api/recommendations/snapshots?limit=$SnapshotLimit&includeItems=true&itemsLimit=10"
Write-Host "2) Snapshots with items: $snapUrl"
try {
  $snaps = Invoke-RestMethod -Method Get -Uri $snapUrl -TimeoutSec 30
  if (-not $snaps.ok) {
    Fail "snapshots ok=false"
  } else {
    Ok "snapshots ok=true count=$($snaps.count)"
    if ($snaps.count -gt 0 -and $snaps.snapshots[0].items -and $snaps.snapshots[0].items.Count -gt 0) {
      $item = $snaps.snapshots[0].items[0]
      Test-DeepDiveObject $item.deepDive "latestSnapshot.items[0]"
      Ok "latest snapshot item has deepDive"
    } else {
      Warn "latest snapshot has no items"
    }
  }
} catch {
  Fail "snapshots request failed: $($_.Exception.Message)"
}
Write-Host ""

Write-Host "=== Summary ==="
if ($allOk) {
  Write-Host "RESULT: PASS" -ForegroundColor Green
  exit 0
}

Write-Host "RESULT: FAIL" -ForegroundColor Red
exit 1

