param(
  [string]$Base              = "http://localhost:3000",
  [switch]$SkipIngest,
  [int]$MaxSources           = 5,
  [int]$IngestTimeoutMs      = 45000,
  [int]$RefreshWindowHours   = 72
)

$ErrorActionPreference = "Continue"
$allOk    = $true
$warnings = @()

function Mark-Ok([string]$msg)   { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Mark-Warn([string]$msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow; $script:warnings += $msg }
function Mark-Fail([string]$msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:allOk = $false }
function Mark-Info([string]$msg) { Write-Host "[INFO] $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Daily Push Core Verification ===" -ForegroundColor Cyan
Write-Host ("Base:               " + $Base)
Write-Host ("SkipIngest:         " + $SkipIngest)
Write-Host ("MaxSources:         " + $MaxSources)
Write-Host ("IngestTimeoutMs:    " + $IngestTimeoutMs)
Write-Host ("RefreshWindowHours: " + $RefreshWindowHours)
Write-Host ("Time:               " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))

if ($MaxSources -le 5) {
  Write-Host ""
  Write-Host "[SMOKE TEST] MaxSources=$MaxSources -- not full production validation." -ForegroundColor Yellow
  Write-Host "             Use -MaxSources 15 for standard, -MaxSources 30 for full." -ForegroundColor DarkGray
}
Write-Host ""

# Client-side timeout must be larger than server-side IngestTimeoutMs
$clientTimeoutSec = [Math]::Max(120, [Math]::Ceiling($IngestTimeoutMs / 1000) + 90)

# ── 1. Pipeline health check ──────────────────────────────────────────────────

Write-Host "1) Pipeline health + source pool" -ForegroundColor White
$script:sourcesSelected = 0
$script:sourcesHealthy  = 0

$healthUrl = ($Base + "/api/pipeline/recommendations")
try {
  $health = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec 20 -ErrorAction Stop
  if ($health.ok) {
    Mark-Ok "pipeline /GET ok=true"
  } else {
    Mark-Fail "pipeline /GET ok=false"
  }

  if ($health.coverage) {
    $cov = $health.coverage
    $script:sourcesSelected = $cov.totalActive
    $script:sourcesHealthy  = $cov.healthySources
    Mark-Info ("sourcesActive:     " + $cov.totalActive)
    Mark-Info ("sourcesHealthy:    " + $cov.healthySources)
    Mark-Info ("sourcesDegraded:   " + $cov.degradedSources)
    Mark-Info ("sourcesFailing:    " + $cov.failingSources)
    Mark-Info ("sourcesNeverFetch: " + $cov.neverFetchedSources)
    Mark-Info ("sourcesFetched24h: " + $cov.fetchedLast24h)
    if ($cov.totalActive -eq 0) {
      Mark-Warn "No active sources. Add sources via import-healthy-sources.ps1."
    }
  } else {
    Mark-Warn "coverage data missing from health response"
  }

  if ($health.latestSnapshot) {
    $snap = $health.latestSnapshot
    Mark-Info ("latestSnapshot:    MR=" + $snap.mustReadCount + " HV=" + $snap.highValueCount + " OB=" + $snap.observeCount + " age=" + $snap.ageMinutes + "min")
  } else {
    Mark-Info "latestSnapshot:    none"
  }
} catch {
  Mark-Fail ("health request failed: " + $_.Exception.Message)
}
Write-Host ""

# ── 2. Ingest phase ───────────────────────────────────────────────────────────

Write-Host "2) Ingest phase" -ForegroundColor White
$script:rawItemsFetched = 0
$script:itemsInserted   = 0
$script:itemsReused     = 0
$ingResponse = $null

if ($SkipIngest) {
  Mark-Info "Ingest skipped (-SkipIngest)"
} else {
  $ingestUrl = ($Base + "/api/pipeline/recommendations" +
    "?ingest=true&refresh=false" +
    "&maxSources=" + $MaxSources +
    "&ingestTimeoutMs=" + $IngestTimeoutMs +
    "&mode=manual")
  try {
    $ingest = Invoke-RestMethod -Method Post -Uri $ingestUrl -TimeoutSec $clientTimeoutSec -ErrorAction Stop
    $ingResponse = $ingest

    if ($ingest.status -eq "already_running") {
      Mark-Warn "pipeline already_running -- using existing state"
    } elseif ($ingest.ok -or $ingest.status -eq "partial_success") {
      Mark-Ok ("ingest ok status=" + $ingest.status)
    } else {
      Mark-Fail ("ingest failed status=" + $ingest.status)
    }

    if ($ingest.ingest) {
      $ing = $ingest.ingest
      $script:rawItemsFetched = if ($null -ne $ing.items.fetched)        { $ing.items.fetched }        else { 0 }
      $script:itemsInserted   = if ($null -ne $ing.items.insertedItems)  { $ing.items.insertedItems }  else { 0 }
      $script:itemsReused     = if ($null -ne $ing.items.reusedItems)    { $ing.items.reusedItems }    else { 0 }

      Mark-Info ("sourcesTotal:      " + $ing.sources.total)
      Mark-Info ("sourcesSelected:   " + $ing.sources.selected)
      Mark-Info ("sourcesAttempted:  " + $ing.sources.processed)
      Mark-Info ("sourcesSucceeded:  " + $ing.sources.successful)
      Mark-Info ("sourcesFailed:     " + $ing.sources.failed)
      Mark-Info ("sourcesTimedOut:   " + $ing.sources.timedOut)
      Mark-Info ("itemsFetched:      " + $ing.items.fetched)
      Mark-Info ("itemsInserted:     +" + $ing.items.insertedItems)
      Mark-Info ("itemsReused:       ~" + $ing.items.reusedItems)
    }
  } catch {
    Mark-Fail ("ingest request failed: " + $_.Exception.Message)
  }
}
Write-Host ""

# ── 2b. Selected sources table ────────────────────────────────────────────────

Write-Host "2b) Source selection detail" -ForegroundColor White
if ($ingResponse -and $ingResponse.ingest -and $ingResponse.ingest.sourceSelection) {
  $sel = $ingResponse.ingest.sourceSelection

  # Stats
  $stats = $sel.stats
  if ($stats) {
    Mark-Info ("pool.totalActive:    " + $stats.totalActive)
    Mark-Info ("pool.selectedCount:  " + $stats.selectedCount)
    Mark-Info ("pool.deferredCount:  " + $stats.deferredCount)
    Mark-Info ("pool.coolingDown:    " + $stats.skippedCoolingDown)
    Mark-Info ("pool.blocked:        " + $stats.skippedBlocked)
    Mark-Info ("pool.neverFetched:   " + $stats.selectedNeverFetched)
    Mark-Info ("pool.stale24h:       " + $stats.selectedStale24h)
  }
  Write-Host ""

  # Selected sources table
  $selectedSources = @($sel.selectedSources)
  if ($selectedSources.Count -gt 0) {
    Write-Host "   -- Selected for ingest --" -ForegroundColor Green

    # Cross-reference with failed sources for ingest result
    $failedNames = @{}
    if ($ingResponse.ingest.failedSources) {
      foreach ($fs in $ingResponse.ingest.failedSources) {
        $failedNames[$fs.name] = $fs.reason
      }
    }

    $selRows = $selectedSources | ForEach-Object {
      $nameT  = if ($_.name.Length -gt 24) { $_.name.Substring(0,21) + "..." } else { $_.name }
      $hs     = if ($null -ne $_.healthStatus)    { $_.healthStatus }    else { "unknown" }
      $lfs    = if ($null -ne $_.lastFetchStatus) { $_.lastFetchStatus } else { "n/a" }
      $fc     = if ($null -ne $_.failureCount)    { $_.failureCount }    else { 0 }
      $score  = if ($null -ne $_.urgencyScore)    { $_.urgencyScore }    else { "?" }
      $result = if ($failedNames.ContainsKey($_.name)) { "FAIL: " + $failedNames[$_.name].Substring(0,[Math]::Min(25,$failedNames[$_.name].Length)) } else { "ok" }
      $reasonT = if ($_.reason -and $_.reason.Length -gt 30) { $_.reason.Substring(0,27) + "..." } else { $_.reason }
      [PSCustomObject]@{
        Name        = $nameT
        Tier        = $_.tier
        Health      = $hs
        Fail        = $fc
        LastFetch   = $lfs
        Score       = $score
        IngestResult = $result
        Reason      = $reasonT
      }
    }
    $selRows | Format-Table -AutoSize

    # Warn for failed sources that were selected
    foreach ($src in $selectedSources) {
      $hs = if ($null -ne $src.healthStatus) { $src.healthStatus } else { "unknown" }
      if ($hs -eq "failing" -or $hs -eq "failed") {
        Mark-Warn ("  Failed source selected: " + $src.name + " (health=" + $hs + " failures=" + $src.failureCount + ")")
      }
    }
  }

  # Deferred sources sample
  $deferred = @($sel.deferredSample)
  if ($deferred.Count -gt 0) {
    Write-Host ("   -- Deferred (sample, " + $deferred.Count + " shown) --") -ForegroundColor Gray
    $defRows = $deferred | ForEach-Object {
      $nameT  = if ($_.name.Length -gt 24) { $_.name.Substring(0,21) + "..." } else { $_.name }
      $hs     = if ($null -ne $_.healthStatus)    { $_.healthStatus }    else { "unknown" }
      $lfs    = if ($null -ne $_.lastFetchStatus) { $_.lastFetchStatus } else { "n/a" }
      $fc     = if ($null -ne $_.failureCount)    { $_.failureCount }    else { 0 }
      $reasonT = if ($_.reason -and $_.reason.Length -gt 35) { $_.reason.Substring(0,32) + "..." } else { $_.reason }
      [PSCustomObject]@{
        Name      = $nameT
        Tier      = $_.tier
        Health    = $hs
        Fail      = $fc
        LastFetch = $lfs
        DeferReason = $reasonT
      }
    }
    $defRows | Format-Table -AutoSize
  }

  # Failed-during-ingest sources
  if ($ingResponse.ingest.failedSources -and @($ingResponse.ingest.failedSources).Count -gt 0) {
    Write-Host "   -- Failed during ingest --" -ForegroundColor Red
    foreach ($fs in $ingResponse.ingest.failedSources) {
      $reasonShort = if ($fs.reason.Length -gt 60) { $fs.reason.Substring(0,57) + "..." } else { $fs.reason }
      Mark-Warn ("  [" + $fs.stage + "] " + $fs.name + ": " + $reasonShort)
    }
  }

} elseif (-not $SkipIngest) {
  Mark-Warn "sourceSelection data not available in ingest response"
}
Write-Host ""

# ── 3. Recommendation refresh (with daily gate) ────────────────────────────────

Write-Host "3) Recommendation refresh (daily gate + threshold)" -ForegroundColor White
$script:todayRecommendationsCount  = 0
$script:todayMustReadCount         = 0
$script:todayHighValueCount        = 0
$script:observeBacklogCount        = 0
$script:deepDiveReadyCount         = 0
$script:deepDiveQueuedCount        = 0
$script:previousDayInTodayCount    = 0
$script:hiddenDueToLimitCount      = 0
$script:hiddenDueToDeepDiveBudgetCount = 0
$refreshData = $null

$refreshUrl = ($Base + "/api/recommendations/refresh?deepDive=deterministic")
try {
  $refresh    = Invoke-RestMethod -Method Post -Uri $refreshUrl -TimeoutSec 120 -ErrorAction Stop
  $refreshData = $refresh

  if ($refresh.ok) {
    Mark-Ok ("refresh ok=true runStatus=" + $refresh.runStatus)
  } else {
    Mark-Fail ("refresh ok=false error=" + $refresh.error)
  }

  if ($refresh.dailyGate) {
    $gate = $refresh.dailyGate
    $script:todayRecommendationsCount = $gate.todayRecommendationCount
    $script:todayMustReadCount        = $gate.todayMustReadCount
    $script:todayHighValueCount       = $gate.todayHighValueCount
    $script:observeBacklogCount       = $gate.observeBacklogCount

    Mark-Info ("dailyGate.timezone:            " + $gate.timezone)
    Mark-Info ("dailyGate.todayKey:            " + $gate.todayKey)
    Mark-Info ("todayRecommendations:          " + $gate.todayRecommendationCount)
    Mark-Info ("todayMustRead:                 " + $gate.todayMustReadCount)
    Mark-Info ("todayHighValue:                " + $gate.todayHighValueCount)
    Mark-Info ("observeBacklog (demoted):      " + $gate.observeBacklogCount)
    Mark-Info ("suppressedPreviousDay:         " + $gate.suppressedPreviousDayCount)
    Mark-Info ("previousDeliveredExcluded:     " + $gate.previousDeliveredExcludedCount)
    Mark-Info ("recentUnpushedObserve:         " + $gate.recentUnpushedObserveCount)
  } else {
    Mark-Warn "dailyGate stats missing from refresh response"
  }

  if ($refresh.stats) {
    $stats = $refresh.stats
    Mark-Info ("capturedTotal:                 " + $stats.capturedTotal)
    Mark-Info ("recommendationCandidates:      " + $stats.recommendationCandidates)
    Mark-Info ("mustRead (raw engine):         " + $stats.mustReadCount)
    Mark-Info ("highValue (raw engine):        " + $stats.highValueCount)
    Mark-Info ("observe (raw engine):          " + $stats.observeCount)
    Mark-Info ("archive (raw engine):          " + $stats.archiveCount)
  }

  $script:deepDiveReadyCount             = if ($null -ne $refresh.deepDiveReadyCount)        { $refresh.deepDiveReadyCount }        else { 0 }
  $script:hiddenDueToDeepDiveBudgetCount = if ($null -ne $refresh.hiddenDueToDeepDiveBudget) { $refresh.hiddenDueToDeepDiveBudget } else { 0 }
  $script:deepDiveQueuedCount            = if ($null -ne $refresh.deepDiveStats.total)        { $refresh.deepDiveStats.total }        else { 0 }

  Mark-Info ("deepDiveReady:                 " + $script:deepDiveReadyCount)
  Mark-Info ("hiddenDueToDeepDiveBudget:     " + $script:hiddenDueToDeepDiveBudgetCount)
  Mark-Info ("deepDiveGenerated:             " + $script:deepDiveQueuedCount)

} catch {
  Mark-Fail ("refresh request failed: " + $_.Exception.Message)
}
Write-Host ""

# ── 3b. Daily recommendation diagnosis ────────────────────────────────────────

Write-Host "3b) Daily recommendation diagnosis" -ForegroundColor White
$diagReason = "unknown"

if ($refreshData) {
  $capTotal    = if ($refreshData.stats) { $refreshData.stats.capturedTotal }           else { 0 }
  $candTotal   = if ($refreshData.stats) { $refreshData.stats.recommendationCandidates } else { 0 }
  $rawMR       = if ($refreshData.stats) { $refreshData.stats.mustReadCount }           else { 0 }
  $rawHV       = if ($refreshData.stats) { $refreshData.stats.highValueCount }          else { 0 }
  $rawOB       = if ($refreshData.stats) { $refreshData.stats.observeCount }            else { 0 }
  $gateBlocked = 0
  $prevDay     = 0
  $prevDel     = 0
  if ($refreshData.dailyGate) {
    $prevDay = if ($null -ne $refreshData.dailyGate.suppressedPreviousDayCount)     { $refreshData.dailyGate.suppressedPreviousDayCount }     else { 0 }
    $prevDel = if ($null -ne $refreshData.dailyGate.previousDeliveredExcludedCount) { $refreshData.dailyGate.previousDeliveredExcludedCount } else { 0 }
    $gateBlocked = $prevDay + $prevDel
  }

  $belowThreshold = $capTotal - $candTotal
  $todayCount     = $script:todayRecommendationsCount
  $noDeepDive     = ($rawMR + $rawHV) - $script:deepDiveReadyCount

  Write-Host ("  todayCandidateCount:    " + ($todayCount + $script:observeBacklogCount))
  Write-Host ("  todayRecommendations:  " + $todayCount)
  Write-Host ("  belowThresholdCount:   " + [Math]::Max(0, $belowThreshold))
  Write-Host ("  dailyGateBlocked:      " + $gateBlocked + " (prevDay=" + $prevDay + " prevDel=" + $prevDel + ")")
  Write-Host ("  noDeepDiveCount:       " + [Math]::Max(0, $noDeepDive))
  Write-Host ("  observeBacklogCount:   " + $script:observeBacklogCount)
  Write-Host ""

  if ($todayCount -ge 3) {
    Mark-Ok ("Today has " + $todayCount + " recommendation(s) -- healthy production state")
    $diagReason = "healthy"
  } elseif ($todayCount -ge 1) {
    $diagReason = "few_sources_succeeded"
    if ($capTotal -eq 0) {
      $diagReason = "no_items_captured"
      Mark-Warn "todayRecommendations=" + $todayCount + " -- reason: no_items_captured (capturedTotal=0, check sources)"
    } elseif ($candTotal -eq 0) {
      $diagReason = "all_below_threshold"
      Mark-Warn ("todayRecommendations=" + $todayCount + " -- reason: all_below_threshold (" + $capTotal + " captured, 0 passed engine filter)")
    } elseif ($gateBlocked -gt 0 -and $rawMR + $rawHV -le $gateBlocked) {
      $diagReason = "daily_gate_blocked"
      Mark-Warn ("todayRecommendations=" + $todayCount + " -- reason: daily_gate_blocked (" + $gateBlocked + " gated out)")
    } else {
      $diagReason = "score_below_threshold"
      Mark-Warn ("todayRecommendations=" + $todayCount + " -- reason: score_below_threshold (only " + $todayCount + "/" + $candTotal + " candidates reached must_read/high_value)")
    }
  } else {
    if ($capTotal -eq 0) {
      $diagReason = "no_items_captured"
      Mark-Warn "0 today recommendations -- reason: no_items_captured (check sources and ingest)"
    } elseif ($candTotal -eq 0) {
      $diagReason = "all_below_threshold"
      Mark-Warn ("0 today recommendations -- reason: all_below_threshold (" + $capTotal + " captured, none passed score filters)")
    } elseif ($script:observeBacklogCount -gt 0 -and $rawMR + $rawHV -le $script:observeBacklogCount) {
      $diagReason = "all_demoted_to_observe"
      Mark-Warn ("0 today recommendations -- reason: all_demoted_to_observe (gate demoted " + $script:observeBacklogCount + " items)")
    } elseif ($rawOB -gt 0 -and $rawMR + $rawHV -eq 0) {
      $diagReason = "below_must_read_threshold"
      Mark-Warn ("0 today recommendations -- reason: below_must_read_threshold (all " + $rawOB + " in observe only)")
    } elseif ($noDeepDive -gt 0) {
      $diagReason = "deepdive_missing"
      Mark-Warn ("0 today recommendations -- reason: deepdive_missing (" + $noDeepDive + " items missing deepDive)")
    } else {
      $diagReason = "unknown"
      Mark-Warn "0 today recommendations -- reason: unknown (check scoring, daily gate, and sources)"
    }
  }
} else {
  Mark-Warn "Refresh data not available for diagnosis"
}
Write-Host ""

# ── 4. Verify today recommendations ──────────────────────────────────────────

Write-Host "4) Verify today recommendations" -ForegroundColor White
$recUrl = ($Base + "/api/recommendations?windowHours=72&limit=50")
$script:finalTodayItems   = @()
$script:finalObserveItems = @()

try {
  $rec = Invoke-RestMethod -Method Get -Uri $recUrl -TimeoutSec 30 -ErrorAction Stop

  if ($rec.ok) {
    Mark-Ok ("recommendations ok=true source=" + $rec.source)
  } else {
    Mark-Fail "recommendations ok=false"
  }

  $items = @()
  if ($rec.items) { $items = @($rec.items) }

  $script:finalTodayItems = @($items | Where-Object {
    ($_.recommendationTier -eq "must_read" -or $_.recommendationTier -eq "high_value") -and
    ($_.recommendationBucket -eq "today_recommendation" -or $null -eq $_.recommendationBucket)
  })
  $script:finalObserveItems  = @($items | Where-Object { $_.recommendationTier -eq "observe" })
  $observeBacklogFromItems   = @($items | Where-Object { $_.recommendationBucket -eq "observe_backlog" })
  $finalTierItems            = @($items | Where-Object { $_.recommendationTier -eq "must_read" -or $_.recommendationTier -eq "high_value" })

  Mark-Info ("items total in snapshot:   " + $items.Count)
  Mark-Info ("today_recommendation:      " + $script:finalTodayItems.Count)
  Mark-Info ("observe total:             " + $script:finalObserveItems.Count)
  Mark-Info ("observe_backlog:           " + $observeBacklogFromItems.Count)
  Mark-Info ("must_read+high_value:      " + $finalTierItems.Count)

  # Top-5 check
  if ($finalTierItems.Count -gt 5) {
    Mark-Ok ("More than 5 final-tier items (" + $finalTierItems.Count + ") -- no fixed top-5 limit confirmed")
  } elseif ($finalTierItems.Count -gt 0) {
    Mark-Ok ("Today final-tier items: " + $finalTierItems.Count + " (threshold-based, not artificially capped)")
  } else {
    Mark-Warn ("0 today recommendations -- diagReason=" + $diagReason)
  }

  # Previous-day check
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $prevDayInToday = @($script:finalTodayItems | Where-Object {
    $_.dailyGate -and
    ($null -ne $_.dailyGate.capturedDateKey) -and
    $_.dailyGate.capturedDateKey -ne $today
  })
  $script:previousDayInTodayCount = $prevDayInToday.Count
  if ($prevDayInToday.Count -eq 0) {
    Mark-Ok "No previous-day items in today recommendations"
  } else {
    Mark-Fail ("Found " + $prevDayInToday.Count + " previous-day item(s) in today recommendations")
    $prevDayInToday | Select-Object -First 3 | ForEach-Object {
      Mark-Info ("  Title: " + $_.title.Substring(0,[Math]::Min(60,$_.title.Length)))
      Mark-Info ("  capturedDateKey: " + $_.dailyGate.capturedDateKey)
    }
  }

  # DeepDive budget check
  if ($script:hiddenDueToDeepDiveBudgetCount -eq 0) {
    Mark-Ok "DeepDive budget=0 (no recommendations hidden)"
  } else {
    Mark-Fail ("DeepDive budget hiding " + $script:hiddenDueToDeepDiveBudgetCount + " recommendations")
  }

  # Required fields check
  if ($finalTierItems.Count -gt 0) {
    $missingTitle = @($finalTierItems | Where-Object { [string]::IsNullOrWhiteSpace($_.title) }).Count
    $missingUrl   = @($finalTierItems | Where-Object { [string]::IsNullOrWhiteSpace($_.originalUrl) }).Count
    $missingScore = @($finalTierItems | Where-Object { $null -eq $_.finalScore }).Count

    if ($missingTitle -eq 0) { Mark-Ok "All today items have titles" } else { Mark-Fail ($missingTitle + " today items missing title") }
    if ($missingUrl   -eq 0) { Mark-Ok "All today items have URLs"   } else { Mark-Fail ($missingUrl + " today items missing URL") }
    if ($missingScore -eq 0) { Mark-Ok "All today items have final_score" } else { Mark-Fail ($missingScore + " today items missing final_score") }
  }

} catch {
  Mark-Fail ("recommendations request failed: " + $_.Exception.Message)
}
Write-Host ""

# ── 5. Verify observeBacklog ──────────────────────────────────────────────────

Write-Host "5) Verify observeBacklog coverage" -ForegroundColor White
if ($script:finalObserveItems.Count -gt 0) {
  Mark-Ok ("observeBacklog has " + $script:finalObserveItems.Count + " items -- near-miss signals captured")
  $withReason = @($script:finalObserveItems | Where-Object { $_.observeReason -or $_.recommendationBucket -eq "observe_backlog" }).Count
  Mark-Info ("  items with reason/bucket: " + $withReason)
} else {
  Mark-Info "observeBacklog empty (0 items) -- ok if no recent high-score items outside today gate"
}
Write-Host ""

# ── 6. Snapshot freshness ─────────────────────────────────────────────────────

Write-Host "6) Snapshot freshness" -ForegroundColor White
try {
  $ps2 = Invoke-RestMethod -Method Get -Uri ($Base + "/api/pipeline/recommendations") -TimeoutSec 20 -ErrorAction Stop
  if ($ps2.freshness) {
    $fresh = $ps2.freshness
    if ($fresh.severity -eq "ok" -or $fresh.severity -eq "warning") {
      Mark-Ok ("freshness severity=" + $fresh.severity + " age=" + $fresh.ageMinutes + "min")
    } else {
      Mark-Warn ("freshness severity=" + $fresh.severity + ": " + $fresh.message)
    }
  }
  if ($ps2.latestSnapshot) {
    $snap = $ps2.latestSnapshot
    Mark-Info ("snapshot: MR=" + $snap.mustReadCount + " HV=" + $snap.highValueCount + " OB=" + $snap.observeCount)
  }
} catch {
  Mark-Warn ("freshness check failed: " + $_.Exception.Message)
}
Write-Host ""

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "── Summary ───────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ("sourcesSelected:              " + $script:sourcesSelected)
Write-Host ("sourcesHealthy:               " + $script:sourcesHealthy)
Write-Host ("rawItemsFetched:              " + $script:rawItemsFetched)
Write-Host ("itemsInserted:                " + $script:itemsInserted)
Write-Host ("itemsReused:                  " + $script:itemsReused)
Write-Host ("todayRecommendationsCount:    " + $script:todayRecommendationsCount)
Write-Host ("todayMustReadCount:           " + $script:todayMustReadCount)
Write-Host ("todayHighValueCount:          " + $script:todayHighValueCount)
Write-Host ("observeBacklogCount:          " + $script:observeBacklogCount)
Write-Host ("deepDiveReadyCount:           " + $script:deepDiveReadyCount)
Write-Host ("deepDiveQueuedCount:          " + $script:deepDiveQueuedCount)
Write-Host ("previousDayInTodayCount:      " + $script:previousDayInTodayCount)
Write-Host ("hiddenDueToLimitCount:        " + $script:hiddenDueToLimitCount)
Write-Host ("hiddenDueToDeepDiveBudget:    " + $script:hiddenDueToDeepDiveBudgetCount)
Write-Host ("diagReason:                   " + $diagReason)
Write-Host ""

if ($MaxSources -le 5) {
  Write-Host "[SMOKE TEST] Results above are for MaxSources=$MaxSources only." -ForegroundColor Yellow
  Write-Host "             Recommended: -MaxSources 15 -IngestTimeoutMs 90000  (standard)" -ForegroundColor DarkGray
  Write-Host "             Full:        -MaxSources 30 -IngestTimeoutMs 180000 (full)" -ForegroundColor DarkGray
  Write-Host ""
}

if ($warnings.Count -gt 0) {
  Write-Host "── Warnings ──────────────────────────────────────────────────────────" -ForegroundColor Yellow
  $warnings | ForEach-Object { Write-Host ("  * " + $_) -ForegroundColor Yellow }
  Write-Host ""
}

Write-Host "=== RESULT ===" -ForegroundColor Cyan
if ($allOk -and $warnings.Count -eq 0) {
  Write-Host "RESULT: PASS" -ForegroundColor Green
  exit 0
} elseif ($allOk) {
  Write-Host ("RESULT: WARN (" + $warnings.Count + " warning(s) -- diagReason=" + $diagReason + ")") -ForegroundColor Yellow
  exit 0
} else {
  Write-Host "RESULT: FAIL" -ForegroundColor Red
  exit 1
}
