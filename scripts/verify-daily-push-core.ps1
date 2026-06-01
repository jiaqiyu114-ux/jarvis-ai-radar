param(
  [string]$Base = "http://localhost:3000",
  [switch]$SkipIngest,
  [int]$MaxSources = 5,
  [int]$IngestTimeoutMs = 45000,
  [int]$RefreshWindowHours = 72
)

$ErrorActionPreference = "Continue"
$allOk = $true
$warnings = @()

function Mark-Ok([string]$msg)   { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Mark-Warn([string]$msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow; $script:warnings += $msg }
function Mark-Fail([string]$msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:allOk = $false }
function Mark-Info([string]$msg) { Write-Host "[INFO] $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Daily Push Core Verification ===" -ForegroundColor Cyan
Write-Host "Base:              $Base"
Write-Host "SkipIngest:        $SkipIngest"
Write-Host "MaxSources:        $MaxSources"
Write-Host "IngestTimeoutMs:   $IngestTimeoutMs"
Write-Host "RefreshWindowHours: $RefreshWindowHours"
Write-Host "Time:              $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# ── 1. Pipeline health check ──────────────────────────────────────────────────

Write-Host "1) Pipeline health check"
$healthUrl = "$Base/api/pipeline/recommendations"
try {
  $health = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec 20 -ErrorAction Stop
  if ($health.ok) {
    Mark-Ok "pipeline /GET ok=true"
  } else {
    Mark-Fail "pipeline /GET ok=false"
  }

  if ($health.coverage) {
    $cov = $health.coverage
    Mark-Info "sourcesActive:     $($cov.totalActive)"
    Mark-Info "sourcesFetched24h: $($cov.fetchedLast24h)"
    Mark-Info "sourcesNeverFetch: $($cov.neverFetchedSources)"
    $script:sourcesSelected = $cov.totalActive
    $script:sourcesHealthy  = $cov.healthySources
    if ($cov.totalActive -eq 0) {
      Mark-Warn "No active sources. Add sources via /sources or the sources table."
    }
  } else {
    Mark-Warn "coverage data missing from health response"
    $script:sourcesSelected = 0
    $script:sourcesHealthy  = 0
  }

  if ($health.latestSnapshot) {
    $snap = $health.latestSnapshot
    Mark-Info "latestSnapshot:    MR=$($snap.mustReadCount) HV=$($snap.highValueCount) OB=$($snap.observeCount) age=$($snap.ageMinutes)min"
  } else {
    Mark-Info "latestSnapshot:    none"
  }
} catch {
  Mark-Fail "health request failed: $($_.Exception.Message)"
  $script:sourcesSelected = 0
  $script:sourcesHealthy  = 0
}
Write-Host ""

# ── 2. Ingest phase ───────────────────────────────────────────────────────────

Write-Host "2) Ingest phase"
$script:rawItemsFetched = 0
$script:itemsInserted = 0
$script:itemsReused = 0

if ($SkipIngest) {
  Mark-Info "Ingest skipped (-SkipIngest)"
} else {
  $ingestUrl = "$Base/api/pipeline/recommendations" +
    "?ingest=true&refresh=false" +
    "&maxSources=$MaxSources" +
    "&ingestTimeoutMs=$IngestTimeoutMs" +
    "&mode=manual"
  try {
    $ingest = Invoke-RestMethod -Method Post -Uri $ingestUrl -TimeoutSec 120 -ErrorAction Stop

    if ($ingest.status -eq "already_running") {
      Mark-Warn "pipeline already_running — using existing state"
    } elseif ($ingest.ok -or $ingest.status -eq "partial_success") {
      Mark-Ok "ingest ok status=$($ingest.status)"
    } else {
      Mark-Fail "ingest failed status=$($ingest.status)"
    }

    if ($ingest.ingest) {
      $ing = $ingest.ingest
      $script:rawItemsFetched = if ($null -ne $ing.items.parsedItems)   { $ing.items.parsedItems }   else { 0 }
      $script:itemsInserted   = if ($null -ne $ing.items.insertedItems) { $ing.items.insertedItems } else { 0 }
      $script:itemsReused     = if ($null -ne $ing.items.reusedItems)   { $ing.items.reusedItems }   else { 0 }
      Mark-Info "sourcesAttempted:  $($ing.sources.attempted)"
      Mark-Info "sourcesSucceeded:  $($ing.sources.successful)"
      Mark-Info "itemsParsed:       $($ing.items.parsedItems)"
      Mark-Info "itemsInserted:     +$($ing.items.insertedItems)"
      Mark-Info "itemsReused:       ~$($ing.items.reusedItems)"
      if ($ing.sources.successful -eq 0) {
        Mark-Warn "No sources succeeded. Check source configuration and network."
      }
    }
  } catch {
    Mark-Fail "ingest request failed: $($_.Exception.Message)"
  }
}
Write-Host ""

# ── 3. Recommendation refresh (with daily gate) ────────────────────────────────

Write-Host "3) Recommendation refresh (daily gate + threshold)"
$refreshUrl = "$Base/api/recommendations/refresh?deepDive=deterministic"
$script:todayRecommendationsCount = 0
$script:todayMustReadCount = 0
$script:todayHighValueCount = 0
$script:observeBacklogCount = 0
$script:deepDiveReadyCount = 0
$script:deepDiveQueuedCount = 0
$script:previousDayInTodayCount = 0
$script:hiddenDueToLimitCount = 0
$script:hiddenDueToDeepDiveBudgetCount = 0

try {
  $refresh = Invoke-RestMethod -Method Post -Uri $refreshUrl -TimeoutSec 120 -ErrorAction Stop

  if ($refresh.ok) {
    Mark-Ok "refresh ok=true runStatus=$($refresh.runStatus)"
  } else {
    Mark-Fail "refresh ok=false error=$($refresh.error)"
  }

  if ($refresh.dailyGate) {
    $gate = $refresh.dailyGate
    $script:todayRecommendationsCount = $gate.todayRecommendationCount
    $script:todayMustReadCount        = $gate.todayMustReadCount
    $script:todayHighValueCount       = $gate.todayHighValueCount
    $script:observeBacklogCount       = $gate.observeBacklogCount

    Mark-Info "dailyGate.timezone:           $($gate.timezone)"
    Mark-Info "dailyGate.todayKey:           $($gate.todayKey)"
    Mark-Info "todayRecommendations:         $($gate.todayRecommendationCount)"
    Mark-Info "todayMustRead:                $($gate.todayMustReadCount)"
    Mark-Info "todayHighValue:               $($gate.todayHighValueCount)"
    Mark-Info "observeBacklog (demoted):     $($gate.observeBacklogCount)"
    Mark-Info "suppressedPreviousDay:        $($gate.suppressedPreviousDayCount)"
    Mark-Info "previousDeliveredExcluded:    $($gate.previousDeliveredExcludedCount)"
    Mark-Info "updateCandidates:             $($gate.updateCandidateCount)"
    Mark-Info "recentUnpushedObserve:        $($gate.recentUnpushedObserveCount)"
  } else {
    Mark-Warn "dailyGate stats missing from refresh response"
  }

  if ($refresh.stats) {
    $stats = $refresh.stats
    Mark-Info "capturedTotal:                $($stats.capturedTotal)"
    Mark-Info "recommendationCandidates:     $($stats.recommendationCandidates)"
    Mark-Info "mustReadCount (raw engine):   $($stats.mustReadCount)"
    Mark-Info "highValueCount (raw engine):  $($stats.highValueCount)"
    Mark-Info "observeCount (raw engine):    $($stats.observeCount)"
  }

  $script:deepDiveReadyCount             = if ($null -ne $refresh.deepDiveReadyCount)      { $refresh.deepDiveReadyCount }      else { 0 }
  $script:hiddenDueToDeepDiveBudgetCount = if ($null -ne $refresh.hiddenDueToDeepDiveBudget) { $refresh.hiddenDueToDeepDiveBudget } else { 0 }
  $script:deepDiveQueuedCount            = if ($null -ne $refresh.deepDiveStats.total)      { $refresh.deepDiveStats.total }      else { 0 }

  Mark-Info "deepDiveReady:                $($script:deepDiveReadyCount)"
  Mark-Info "hiddenDueToDeepDiveBudget:    $($script:hiddenDueToDeepDiveBudgetCount)"
  Mark-Info "deepDiveTotal:                $($script:deepDiveQueuedCount)"

} catch {
  Mark-Fail "refresh request failed: $($_.Exception.Message)"
}
Write-Host ""

# ── 4. Verify today recommendations ──────────────────────────────────────────

Write-Host "4) Verify today recommendations"
$recUrl = "$Base/api/recommendations?windowHours=72&limit=50"
$script:finalTodayItems = @()
$script:finalObserveItems = @()

try {
  $rec = Invoke-RestMethod -Method Get -Uri $recUrl -TimeoutSec 30 -ErrorAction Stop

  if ($rec.ok) {
    Mark-Ok "recommendations ok=true source=$($rec.source)"
  } else {
    Mark-Fail "recommendations ok=false"
  }

  $items = @()
  if ($rec.items) { $items = @($rec.items) }

  $script:finalTodayItems = @($items | Where-Object {
    ($_.recommendationTier -eq "must_read" -or $_.recommendationTier -eq "high_value") -and
    ($_.recommendationBucket -eq "today_recommendation" -or $null -eq $_.recommendationBucket)
  })
  $script:finalObserveItems = @($items | Where-Object { $_.recommendationTier -eq "observe" })
  $observeBacklogFromItems = @($items | Where-Object { $_.recommendationBucket -eq "observe_backlog" })

  Mark-Info "items total in snapshot:      $($items.Count)"
  Mark-Info "today_recommendation (final): $($script:finalTodayItems.Count)"
  Mark-Info "observe items total:          $($script:finalObserveItems.Count)"
  Mark-Info "observe_backlog items:        $($observeBacklogFromItems.Count)"

  # Check: no fixed Top 5 limit (should allow variable count)
  $finalTierItems = @($items | Where-Object { $_.recommendationTier -eq "must_read" -or $_.recommendationTier -eq "high_value" })
  if ($finalTierItems.Count -gt 5) {
    Mark-Ok "More than 5 recommendations found ($($finalTierItems.Count)) — no fixed top-5 limit"
  } elseif ($finalTierItems.Count -gt 0) {
    Mark-Ok "Today recommendations: $($finalTierItems.Count) (within threshold, not artificially capped)"
  } else {
    Mark-Warn "0 today recommendations — check sources and scoring thresholds"
  }

  # Check: no previous-day items in today recommendations
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $prevDayInToday = @($script:finalTodayItems | Where-Object {
    $_.dailyGate -and $_.dailyGate.capturedDateKey -ne $today -and $_.dailyGate.capturedDateKey -ne $null
  })
  $script:previousDayInTodayCount = $prevDayInToday.Count
  if ($prevDayInToday.Count -eq 0) {
    Mark-Ok "No previous-day items in today recommendations"
  } else {
    Mark-Fail "Found $($prevDayInToday.Count) previous-day item(s) in today recommendations"
    $prevDayInToday | Select-Object -First 3 | ForEach-Object {
      Mark-Info "  Title: $($_.title.Substring(0,[Math]::Min(60,$_.title.Length)))"
      Mark-Info "  capturedDateKey: $($_.dailyGate.capturedDateKey)"
    }
  }

  # Check: DeepDive not hiding recommendations
  if ($script:hiddenDueToDeepDiveBudgetCount -eq 0) {
    Mark-Ok "DeepDive budget does not hide recommendations (hiddenDueToDeepDiveBudget=0)"
  } else {
    Mark-Fail "DeepDive budget hiding $($script:hiddenDueToDeepDiveBudgetCount) recommendations"
  }

  # Check: items have required fields
  if ($finalTierItems.Count -gt 0) {
    $missingTitle  = @($finalTierItems | Where-Object { [string]::IsNullOrWhiteSpace($_.title) }).Count
    $missingUrl    = @($finalTierItems | Where-Object { [string]::IsNullOrWhiteSpace($_.originalUrl) }).Count
    $missingScore  = @($finalTierItems | Where-Object { $null -eq $_.finalScore }).Count

    if ($missingTitle -eq 0)  { Mark-Ok "All today items have titles" }
    else                      { Mark-Fail "$missingTitle today items missing title" }
    if ($missingUrl -eq 0)    { Mark-Ok "All today items have URLs" }
    else                      { Mark-Fail "$missingUrl today items missing URL" }
    if ($missingScore -eq 0)  { Mark-Ok "All today items have final_score" }
    else                      { Mark-Fail "$missingScore today items missing final_score" }
  }

} catch {
  Mark-Fail "recommendations request failed: $($_.Exception.Message)"
}
Write-Host ""

# ── 5. Verify observeBacklog承接 ──────────────────────────────────────────────

Write-Host "5) Verify observeBacklog coverage"
if ($script:finalObserveItems.Count -gt 0) {
  Mark-Ok "observeBacklog has $($script:finalObserveItems.Count) items — near-miss signals captured"
  $observeWithReason = @($script:finalObserveItems | Where-Object { $_.observeReason -or $_.recommendationBucket -eq "observe_backlog" })
  Mark-Info "observeBacklog items with reason/bucket: $($observeWithReason.Count)"
} else {
  Mark-Info "observeBacklog empty (0 items) — may be ok if no recent high-score items"
}
Write-Host ""

# ── 6. Snapshot freshness cross-check ────────────────────────────────────────

Write-Host "6) Snapshot freshness"
try {
  $pipelineStatus = Invoke-RestMethod -Method Get -Uri "$Base/api/pipeline/recommendations" -TimeoutSec 20 -ErrorAction Stop
  if ($pipelineStatus.freshness) {
    $fresh = $pipelineStatus.freshness
    if ($fresh.severity -eq "ok" -or $fresh.severity -eq "warning") {
      Mark-Ok "freshness severity=$($fresh.severity) age=$($fresh.ageMinutes)min"
    } else {
      Mark-Warn "freshness severity=$($fresh.severity): $($fresh.message)"
    }
  }
  if ($pipelineStatus.latestSnapshot) {
    $snap = $pipelineStatus.latestSnapshot
    Mark-Info "snapshot MR=$($snap.mustReadCount) HV=$($snap.highValueCount) OB=$($snap.observeCount)"
  }
} catch {
  Mark-Warn "freshness check failed: $($_.Exception.Message)"
}
Write-Host ""

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "── Summary ──────────────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host "sourcesSelected:              $($script:sourcesSelected)"
Write-Host "sourcesHealthy:               $($script:sourcesHealthy)"
Write-Host "rawItemsFetched:              $($script:rawItemsFetched)"
Write-Host "itemsInserted:                $($script:itemsInserted)"
Write-Host "itemsReused:                  $($script:itemsReused)"
Write-Host "todayRecommendationsCount:    $($script:todayRecommendationsCount)"
Write-Host "todayMustReadCount:           $($script:todayMustReadCount)"
Write-Host "todayHighValueCount:          $($script:todayHighValueCount)"
Write-Host "observeBacklogCount:          $($script:observeBacklogCount)"
Write-Host "deepDiveReadyCount:           $($script:deepDiveReadyCount)"
Write-Host "deepDiveQueuedCount:          $($script:deepDiveQueuedCount)"
Write-Host "previousDayInTodayCount:      $($script:previousDayInTodayCount)"
Write-Host "hiddenDueToLimitCount:        $($script:hiddenDueToLimitCount)"
Write-Host "hiddenDueToDeepDiveBudget:    $($script:hiddenDueToDeepDiveBudgetCount)"
Write-Host ""

if ($warnings.Count -gt 0) {
  Write-Host "── Warnings ─────────────────────────────────────────────────────────────────" -ForegroundColor Yellow
  $warnings | ForEach-Object { Write-Host "  * $_" -ForegroundColor Yellow }
  Write-Host ""
}

Write-Host "=== RESULT ===" -ForegroundColor Cyan
if ($allOk -and $warnings.Count -eq 0) {
  Write-Host "RESULT: PASS" -ForegroundColor Green
  exit 0
} elseif ($allOk) {
  Write-Host "RESULT: WARN ($($warnings.Count) warning(s))" -ForegroundColor Yellow
  exit 0
} else {
  Write-Host "RESULT: FAIL" -ForegroundColor Red
  exit 1
}
