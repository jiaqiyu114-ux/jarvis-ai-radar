param(
  [string]$Base          = "http://localhost:3000",
  [int]$SnapshotLimit    = 5,
  [int]$ItemLimit        = 30,
  [int]$WindowHours      = 72,
  [switch]$Refresh,               # Explicit opt-in: POST /api/recommendations/refresh
  [string]$DeepDiveMode  = "llm"  # llm | deterministic (only used when -Refresh)
)

$ErrorActionPreference = "Stop"
$script:allOk = $true

function Write-Ok {
  param([string]$Message)
  Write-Host ("[OK]   {0}" -f $Message) -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host ("[WARN] {0}" -f $Message) -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)
  Write-Host ("[FAIL] {0}" -f $Message) -ForegroundColor Red
  $script:allOk = $false
}

function Write-Info {
  param([string]$Message)
  Write-Host ("[INFO] {0}" -f $Message) -ForegroundColor Gray
}

function Test-Garbled {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  return ($Text -match [char]0xFFFD)
}

function Test-DeepDiveFields {
  param($Obj, [string]$Prefix)
  if ($null -eq $Obj) {
    Write-Fail ("{0} deepDive is null" -f $Prefix)
    return $false
  }
  $required = @("oneSentence","whatHappened","whyItMatters","userValue","uncertainty")
  $ok = $true
  foreach ($k in $required) {
    if (-not ($Obj.PSObject.Properties.Name -contains $k)) {
      Write-Fail ("{0} missing field: {1}" -f $Prefix, $k)
      $ok = $false
      continue
    }
    $v = [string]$Obj.$k
    if ([string]::IsNullOrWhiteSpace($v)) {
      Write-Fail ("{0} empty field: {1}" -f $Prefix, $k)
      $ok = $false
    }
    if (Test-Garbled $v) {
      Write-Fail ("{0} garbled field: {1}" -f $Prefix, $k)
      $ok = $false
    }
  }
  if (-not ($Obj.PSObject.Properties.Name -contains "followUp")) {
    Write-Fail ("{0} missing field: followUp" -f $Prefix)
    $ok = $false
  } else {
    $fc = @($Obj.followUp).Count
    if ($fc -lt 1) {
      Write-Fail ("{0} followUp empty" -f $Prefix)
      $ok = $false
    }
  }
  if (-not ($Obj.PSObject.Properties.Name -contains "provider")) {
    Write-Fail ("{0} missing field: provider" -f $Prefix)
    $ok = $false
  }
  if (-not ($Obj.PSObject.Properties.Name -contains "contentStatus")) {
    Write-Warn ("{0} contentStatus field missing (older snapshot)" -f $Prefix)
  }
  return $ok
}

function Test-IsFinalTier {
  param([string]$Tier)
  return ($Tier -eq "must_read" -or $Tier -eq "high_value")
}

# ── env setup ─────────────────────────────────────────────────────────────────

$llmEnabledRaw = $env:LLM_DEEPDIVE_ENABLED
if ($null -eq $llmEnabledRaw) { $llmEnabledRaw = "" }
$llmEnabled  = ($llmEnabledRaw.ToLower() -eq "true")
$llmKeySet   = -not [string]::IsNullOrWhiteSpace($env:LLM_API_KEY)
$expectLlm   = $llmEnabled -and $llmKeySet
$defaultModel = if ([string]::IsNullOrWhiteSpace($env:LLM_MODEL)) { "deepseek-reasoner" } else { [string]$env:LLM_MODEL }
$proModel     = if ([string]::IsNullOrWhiteSpace($env:LLM_PRO_MODEL)) { $defaultModel } else { [string]$env:LLM_PRO_MODEL }
$verifyMode   = if ($Refresh) { "refresh + snapshot check" } else { "read-only snapshot check" }

Write-Host ""
Write-Host "=== Verify Recommendation Deep Dives ===" -ForegroundColor Cyan
Write-Host ("Base:         {0}" -f $Base)
Write-Host ("Time:         {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ("Verify mode:  {0}" -f $verifyMode) -ForegroundColor $(if ($Refresh) { "Yellow" } else { "Cyan" })
Write-Host ("enabled={0}  keySet={1}  proModel={2}" -f $llmEnabled, $llmKeySet, $proModel)
Write-Host ""

# ── 0) Optional LLM refresh (only when -Refresh is passed) ────────────────────

$refreshResult = $null
if ($Refresh) {
  $ddMode = if ($DeepDiveMode -eq "deterministic") { "deterministic" } else { "llm" }
  $refreshUrl = ("{0}/api/recommendations/refresh?deepDive={1}" -f $Base.TrimEnd('/'), $ddMode)
  Write-Host ("0) POST {0}  [deepDiveMode={1}]" -f $refreshUrl, $ddMode)
  try {
    $refreshResult = Invoke-RestMethod -Method Post -Uri $refreshUrl -TimeoutSec 180
    if ($refreshResult.ok) { Write-Ok "refresh ok=true" } else { Write-Fail "refresh ok=false" }

    # Timing breakdown
    if ($refreshResult.PSObject.Properties.Name -contains "timing" -and $null -ne $refreshResult.timing) {
      $t = $refreshResult.timing
      Write-Info ("timing: total={0}ms  query={1}ms  deepDive={2}ms" -f $t.totalMs, $t.queryMs, $t.deepDiveMs)
    } elseif ($refreshResult.PSObject.Properties.Name -contains "durationMs") {
      Write-Info ("timing: total={0}ms" -f $refreshResult.durationMs)
    }

    # Article fetch stats (from ingest phase, if available)
    if ($refreshResult.PSObject.Properties.Name -contains "ingest" -and $null -ne $refreshResult.ingest -and
        $refreshResult.ingest.PSObject.Properties.Name -contains "articleFetch") {
      $af = $refreshResult.ingest.articleFetch
      Write-Info ("articleFetch: enabled={0} attempted={1} succeeded={2} failed={3} skipped={4} avgLen={5}" -f `
        $af.enabled, $af.attempted, $af.succeeded, $af.failed, $af.skipped, $af.averageContentLength)
      if ($af.enabled -and [int]$af.attempted -eq 0) {
        Write-Warn "articleFetch enabled but attempted=0 (check ARTICLE_FETCH_ENABLED)"
      }
    }

    # DeepDive stats from refresh response
    if ($refreshResult.deepDiveStats) {
      $ds = $refreshResult.deepDiveStats
      Write-Info ("deepDiveStats: total={0}  generated={1}  fallback={2}  failed={3}  model={4}  provider={5}" -f `
        $ds.total, $ds.generated, $ds.fallback, $ds.failed, $ds.model, $ds.provider)
      Write-Info ("actualDeepDiveModel: {0}" -f $ds.model)
      Write-Info ("actualProvider:      {0}" -f $ds.provider)

      if ($expectLlm -and -not [string]::IsNullOrWhiteSpace($proModel)) {
        $usedModel = [string]$ds.model
        if ($usedModel -eq $proModel) {
          Write-Ok ("LLM_PRO_MODEL verified: {0}" -f $usedModel)
        } else {
          Write-Warn ("LLM_PRO_MODEL: expected={0} used={1}" -f $proModel, $usedModel)
        }
      }

      # In -Refresh mode: fallbacks are due to fresh LLM run, just WARN, not FAIL
      if ([int]$ds.fallback -gt 0) {
        Write-Warn ("-Refresh: {0} fallback(s) in this generation run (LLM non-deterministic)" -f $ds.fallback)
      }
    } else {
      Write-Warn "refresh response missing deepDiveStats"
    }

    # relatedSignals stats from refresh (if available)
    if ($refreshResult.PSObject.Properties.Name -contains "relatedSignals" -and $null -ne $refreshResult.relatedSignals) {
      $rs = $refreshResult.relatedSignals
      Write-Info ("relatedSignals: ms={0}ms  pool={1}  itemsWithSignals={2}  avgSignals={3}" -f `
        $rs.ms, $rs.candidatePoolSize, $rs.itemsWithSignals, $rs.avgSignals)
    }
    # Daily gate stats from refresh
    if ($refreshResult.PSObject.Properties.Name -contains "dailyGate" -and $null -ne $refreshResult.dailyGate) {
      $dg = $refreshResult.dailyGate
      Write-Info ("dailyGate: tz={0}  today={1}  todayRec={2}  observeBacklog={3}  prevDay={4}  prevDelivered={5}  updateCandidate={6}" -f `
        $dg.timezone, $dg.todayKey, $dg.todayRecommendationCount,
        $dg.observeBacklogCount, $dg.suppressedPreviousDayCount,
        $dg.previousDeliveredExcludedCount, $dg.updateCandidateCount)
      if ([int]$dg.todayRecommendationCount -eq 0) {
        Write-Warn "dailyGate: todayRecommendationCount=0 (no items captured today in configured timezone)"
      }
    }
  } catch {
    Write-Fail ("refresh request failed: {0}" -f $_.Exception.Message)
  }
  Write-Host ""
} else {
  Write-Info "Read-only mode: skipping POST refresh. Use -Refresh to trigger a new LLM generation."
  Write-Host ""
}

# ── 1) Recommendations (always runs — reads current snapshot) ─────────────────

$recUrl = ("{0}/api/recommendations?windowHours={1}&limit={2}" -f $Base.TrimEnd('/'), $WindowHours, $ItemLimit)
Write-Host ("1) GET {0}" -f $recUrl)
try {
  $rec = Invoke-RestMethod -Method Get -Uri $recUrl -TimeoutSec 30
  if (-not $rec.ok) {
    Write-Fail "recommendations ok=false"
  } else {
    Write-Ok ("recommendations ok=true  source={0}" -f $rec.source)

    $items        = @(); if ($rec.items) { $items = @($rec.items) }
    $finalItems   = @($items | Where-Object { Test-IsFinalTier ([string]$_.recommendationTier) })
    $observeItems = @($items | Where-Object { ([string]$_.recommendationTier) -eq "observe" })

    Write-Ok ("final items (must_read/high_value): {0}" -f $finalItems.Count)
    Write-Info ("observe={0}" -f $observeItems.Count)

    # ── Cross-check generated/fallback/failed from snapshot-decoded items ─────
    $snapGenerated = 0; $snapFallback = 0; $snapFailed = 0
    foreach ($it in $finalItems) {
      if ($null -eq $it.deepDive) { continue }
      $st = [string]$it.deepDive.status
      if ($st -eq "generated") { $snapGenerated++ }
      elseif ($st -eq "fallback") { $snapFallback++ }
      elseif ($st -eq "error") { $snapFailed++ }
    }
    Write-Info ("snapshot decoded: generated={0}  fallback={1}  failed={2}" -f $snapGenerated, $snapFallback, $snapFailed)

    # Compare with refresh stats (only meaningful when -Refresh was used)
    if ($null -ne $refreshResult -and $null -ne $refreshResult.deepDiveStats) {
      $rds  = $refreshResult.deepDiveStats
      $rGen = [int]$rds.generated; $rFb = [int]$rds.fallback; $rFail = [int]$rds.failed
      Write-Info ("refresh stats:          generated={0}  fallback={1}  failed={2}" -f $rGen, $rFb, $rFail)
      if ($snapGenerated -ne $rGen -or $snapFallback -ne $rFb) {
        Write-Warn ("Stats mismatch: refresh(gen={0} fb={1}) vs snapshot(gen={2} fb={3}) - may be stale snapshot or race" -f `
          $rGen, $rFb, $snapGenerated, $snapFallback)
      } else {
        Write-Ok "refresh vs snapshot stats consistent"
      }
    }

    # FAIL: must_read/high_value must all have deepDive
    $missingDD = @($finalItems | Where-Object { $null -eq $_.deepDive })
    if ($missingDD.Count -gt 0) {
      Write-Fail ("must_read/high_value items missing deepDive: {0}" -f $missingDD.Count)
    } else {
      Write-Ok "all final items have deepDive"
    }

    # WARN: observe should NOT have non-skipped deepDive
    $observeWithDive = @($observeItems | Where-Object {
      $null -ne $_.deepDive -and ([string]$_.deepDive.status) -ne "skipped"
    })
    if ($observeWithDive.Count -gt 0) {
      Write-Warn ("observe items with non-skipped deepDive: {0}" -f $observeWithDive.Count)
    }

    # ── per-item stats ────────────────────────────────────────────────────────
    $llmModelCount   = 0
    $fallbackCount   = 0
    $fbWithReason    = 0
    $seenLlmPath     = $false
    $csDistrib       = @{}
    $srcDistrib      = @{}
    $titleLens       = @()
    $summaryLens     = @()
    $fullContentLens = @()
    $summaryOnlyN    = 0
    $diagMissing     = 0

    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $it     = $finalItems[$i]
      $dd     = $it.deepDive
      $pfx    = ("final[{0}] tier={1}" -f $i, $it.recommendationTier)
      $ok     = Test-DeepDiveFields $dd $pfx
      if (-not $ok) { continue }

      $model    = [string]$dd.model
      $provider = [string]$dd.provider
      $status   = [string]$dd.status
      $cs       = if ($dd.PSObject.Properties.Name -contains "contentStatus") { [string]$dd.contentStatus } else { "unknown" }
      $osLen    = ([string]$dd.oneSentence).Length
      $fuCount  = @($dd.followUp).Count

      Write-Host ("  [{0}] status={1} | contentStatus={2} | model={3} | provider={4} | oneSentLen={5} | followUps={6}" -f `
        $i, $status, $cs, $model, $provider, $osLen, $fuCount)

      # FAIL: generated status must have null fallbackReason
      if ($status -eq "generated" -and $dd.PSObject.Properties.Name -contains "fallbackReason") {
        $fr = [string]$dd.fallbackReason
        if (-not [string]::IsNullOrWhiteSpace($fr)) {
          Write-Fail ("{0} status=generated but fallbackReason non-null: {1}" -f $pfx, $fr.Substring(0, [Math]::Min(80, $fr.Length)))
        }
      }
      # FAIL: fallback status must have a fallbackReason
      if ($status -eq "fallback") {
        $fr = [string]$dd.fallbackReason
        if ([string]::IsNullOrWhiteSpace($fr)) {
          Write-Fail ("{0} status=fallback but fallbackReason is null/empty" -f $pfx)
        } else {
          Write-Info ("{0} fallbackReason: {1}" -f $pfx, $fr.Substring(0, [Math]::Min(80, $fr.Length)))
        }
      }

      # contentStatus distribution
      if (-not $csDistrib.ContainsKey($cs)) { $csDistrib[$cs] = 0 }
      $csDistrib[$cs]++
      if ($cs -eq "rss_summary" -or $cs -eq "title_only" -or $cs -eq "partial" -or $cs -eq "missing") {
        $summaryOnlyN++
      }

      # FAIL: full_article / extracted_article with empty fullContent
      if ($dd.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $dd.inputDiagnostics) {
        $diag  = $dd.inputDiagnostics
        $fcLen = 0; $sumLen = 0; $titLen = 0; $cSrc = "unknown"
        if ($diag.PSObject.Properties.Name -contains "inputTitleLength")       { $titLen = [int]$diag.inputTitleLength }
        if ($diag.PSObject.Properties.Name -contains "inputSummaryLength")     { $sumLen = [int]$diag.inputSummaryLength }
        if ($diag.PSObject.Properties.Name -contains "inputFullContentLength") { $fcLen  = [int]$diag.inputFullContentLength }
        if ($diag.PSObject.Properties.Name -contains "contentSource")          { $cSrc   = [string]$diag.contentSource }

        $titleLens       += $titLen
        $summaryLens     += $sumLen
        $fullContentLens += $fcLen

        if (-not $srcDistrib.ContainsKey($cSrc)) { $srcDistrib[$cSrc] = 0 }
        $srcDistrib[$cSrc]++

        # FAIL: full_article / extracted_article but no content
        if (($cs -eq "full_article" -or $cs -eq "extracted_article") -and $fcLen -lt 500) {
          Write-Fail ("{0} contentStatus={1} but inputFullContentLength={2}" -f $pfx, $cs, $fcLen)
        }
        # WARN: content fetch source but fullContent suspiciously short
        if (($cSrc -eq "fetched_article" -or $cSrc -eq "rss_content") -and $fcLen -lt 400) {
          Write-Warn ("{0} contentSource={1} but inputFullContentLength={2}" -f $pfx, $cSrc, $fcLen)
        }

        $rawMCS = ""
        if ($diag.PSObject.Properties.Name -contains "rawModelContentStatus") {
          $rawMCS = [string]$diag.rawModelContentStatus
        }
        $qw = ""
        if ($diag.PSObject.Properties.Name -contains "qualityWarnings") {
          $qw = ($diag.qualityWarnings -join "; ")
        }
        $diagLine = ("    diag: src={0} titleLen={1} sumLen={2} fcLen={3}" -f $cSrc, $titLen, $sumLen, $fcLen)
        if ($rawMCS -ne "" -and $rawMCS -ne $cs) {
          $diagLine += (" [model claimed {0} -> system overrode to {1}]" -f $rawMCS, $cs)
        }
        if ($qw -ne "") { $diagLine += ("  warns=[{0}]" -f $qw) }
        Write-Host $diagLine -ForegroundColor DarkGray
      } else {
        $diagMissing++
        Write-Host "    inputDiagnostics: missing (pre-v2 snapshot)" -ForegroundColor DarkGray
      }

      # fallback tracking
      if ($status -eq "fallback") {
        $fallbackCount++
        $fr = [string]$dd.fallbackReason
        if (-not [string]::IsNullOrWhiteSpace($fr)) { $fbWithReason++ }
      }
      if ($model -ne "deterministic-v1" -and $status -eq "generated") {
        $llmModelCount++
        $seenLlmPath = $true
      }
    }

    # ── contentStatus distribution ────────────────────────────────────────────
    Write-Host ""
    Write-Host "  --- contentStatus distribution ---"
    Write-Info "(full_article=confirmed-full  extracted_article=long-partial  partial=partial  rss_summary=rss-only)"
    foreach ($k in ($csDistrib.Keys | Sort-Object)) {
      $cnt   = $csDistrib[$k]
      $color = if ($k -eq "full_article") { "Green" } `
               elseif ($k -eq "extracted_article") { "Cyan" } `
               elseif ($k -eq "partial") { "Yellow" } `
               elseif ($k -eq "unknown" -or $k -eq "missing") { "Red" } `
               else { "Gray" }
      Write-Host ("  {0}: {1}" -f $k, $cnt) -ForegroundColor $color
    }
    if ($csDistrib.Count -eq 1 -and $csDistrib.ContainsKey("partial") -and $finalItems.Count -gt 0) {
      Write-Warn "All items contentStatus=partial — check inferContentStatus raw length fix"
    }

    # ── contentSource distribution ────────────────────────────────────────────
    Write-Host "  --- contentSource distribution ---"
    Write-Info "(rss_content=rss-full-text  fetched_article=fetched-article  rss_summary=rss-summary)"
    if ($srcDistrib.Count -gt 0) {
      foreach ($k in ($srcDistrib.Keys | Sort-Object)) {
        $color = if ($k -eq "rss_content" -or $k -eq "fetched_article") { "Cyan" } else { "Gray" }
        Write-Host ("  {0}: {1}" -f $k, $srcDistrib[$k]) -ForegroundColor $color
      }
    } else {
      Write-Host "  (none - inputDiagnostics may be missing)" -ForegroundColor Gray
    }

    # FAIL: all contentStatus are unknown
    if ($csDistrib.ContainsKey("unknown") -and $csDistrib["unknown"] -eq $finalItems.Count -and $finalItems.Count -gt 0) {
      Write-Fail "All contentStatus are 'unknown' — inputDiagnostics not being populated"
    }

    # ── average input lengths ─────────────────────────────────────────────────
    if ($summaryLens.Count -gt 0) {
      $avgT  = [Math]::Round(($titleLens       | Measure-Object -Average).Average, 1)
      $avgS  = [Math]::Round(($summaryLens     | Measure-Object -Average).Average, 1)
      $avgFC = [Math]::Round(($fullContentLens | Measure-Object -Average).Average, 1)
      Write-Host ""
      Write-Host "  --- average input lengths ---"
      Write-Host ("  avg title:       {0} chars" -f $avgT)
      Write-Host ("  avg summary:     {0} chars  (RSS capped ~300 chars)" -f $avgS)
      Write-Host ("  avg fullContent: {0} chars  (target: >2000 chars)" -f $avgFC)

      $allSameFcLen = ($fullContentLens | Select-Object -Unique).Count -eq 1 -and $fullContentLens.Count -gt 1
      if ($allSameFcLen) {
        Write-Warn ("All items have identical fcLen={0} — likely pre-fix diagnostic cap" -f $fullContentLens[0])
      }

      if ($avgFC -lt 50) {
        Write-Warn ("avg fullContent very short ({0} chars) — LLM saw only RSS summary" -f $avgFC)
      } elseif ($avgFC -lt 500) {
        Write-Warn ("avg fullContent {0} chars — check ARTICLE_FETCH_ENABLED or RSS content:encoded field" -f $avgFC)
      } elseif ($avgFC -ge 2000) {
        Write-Ok ("avg fullContent {0} chars - good content depth" -f $avgFC)
      } else {
        Write-Info ("avg fullContent {0} chars — partial content depth" -f $avgFC)
      }
    } elseif ($diagMissing -gt 0) {
      Write-Warn ("inputDiagnostics missing on {0} items — run fresh snapshot first" -f $diagMissing)
    }

    # ── fallbackReason distribution (fallback items only) ─────────────────────
    $fallbackReasons = @{}
    $invalidJsonCount = 0
    $generatedWithFr  = 0
    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $dd = $finalItems[$i].deepDive
      if ($null -eq $dd) { continue }
      $status = [string]$dd.status
      $fr     = if ($dd.PSObject.Properties.Name -contains "fallbackReason") { [string]$dd.fallbackReason } else { "" }

      if ($status -eq "generated" -and -not [string]::IsNullOrWhiteSpace($fr)) {
        $generatedWithFr++
      }
      if ($status -eq "fallback") {
        if ([string]::IsNullOrWhiteSpace($fr)) { $fr = "(no reason)" }
        $cat = if ($fr -match "not valid JSON|invalid_json") { "invalid_json" }
               elseif ($fr -match "retry_failed")            { "retry_failed" }
               elseif ($fr -match "quality|vague|garbled")   { "quality_issue" }
               elseif ($fr -match "parse|required_field|missing") { "parse_error" }
               elseif ($fr -match "LLM disabled|missing API|llm_disabled") { "llm_disabled" }
               elseif ($fr -match "timeout|abort")           { "timeout" }
               elseif ($fr -match "llm_error")               { "llm_error" }
               else                                           { "other" }
        if ($cat -eq "invalid_json") { $invalidJsonCount++ }
        if (-not $fallbackReasons.ContainsKey($cat)) { $fallbackReasons[$cat] = 0 }
        $fallbackReasons[$cat]++
      }
    }
    Write-Host ""
    Write-Host "  --- fallbackReason distribution (fallback items only) ---"
    if ($fallbackReasons.Count -eq 0) {
      Write-Ok "(no fallback items - all generated)"
    } else {
      foreach ($k in ($fallbackReasons.Keys | Sort-Object)) {
        $color = if ($k -eq "invalid_json" -or $k -eq "retry_failed") { "Yellow" } else { "Gray" }
        Write-Host ("  {0}: {1}" -f $k, $fallbackReasons[$k]) -ForegroundColor $color
      }
    }
    if ($invalidJsonCount -gt 0) {
      # In read-only mode this is a pre-existing snapshot issue; in -Refresh mode it's a fresh LLM issue
      Write-Warn ("invalid JSON fallbacks: {0}{1}" -f $invalidJsonCount, $(if (-not $Refresh) { " (from stored snapshot)" } else { " (from this generation run)" }))
    } else {
      Write-Ok "invalid JSON fallbacks: 0"
    }
    if ($generatedWithFr -gt 0) {
      Write-Fail ("{0} generated item(s) still have non-null fallbackReason — metadata fix not applied?" -f $generatedWithFr)
    } else {
      Write-Ok "generated items: fallbackReason is null for all"
    }

    if ($summaryOnlyN -gt 0) {
      Write-Info ("summary-limited items (rss_summary/title_only/partial/missing): {0}/{1}" -f $summaryOnlyN, $finalItems.Count)
    }

    # ── image stats ───────────────────────────────────────────────────────────
    $coverCount = 0; $mediaCount = 0
    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $it = $finalItems[$i]
      if (-not [string]::IsNullOrWhiteSpace([string]$it.coverImageUrl)) { $coverCount++ }
      if ($it.PSObject.Properties.Name -contains "mediaUrls" -and $null -ne $it.mediaUrls -and @($it.mediaUrls).Count -gt 0) { $mediaCount++ }
    }
    Write-Info ("itemsWithCoverImage: {0}/{1}" -f $coverCount, $finalItems.Count)
    Write-Info ("itemsWithMediaUrls:  {0}/{1}" -f $mediaCount, $finalItems.Count)

    # ── Related Signals checks ────────────────────────────────────────────────
    $rsWithSignals   = 0; $rsTotalCount = 0; $rsMaxCount = 0
    $rsNoReason      = 0; $rsEmptyTypes = 0; $rsSameSourceOnly = 0
    $rsTopReasons    = @()
    $rsRelTypeDist   = @{}
    $rsCoDistrib     = @{}

    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $it = $finalItems[$i]
      if (-not ($it.PSObject.Properties.Name -contains "relatedSignals")) { continue }
      $sigs = @($it.relatedSignals)
      if ($sigs.Count -eq 0) { continue }
      $rsWithSignals++
      $rsTotalCount += $sigs.Count
      if ($sigs.Count -gt $rsMaxCount) { $rsMaxCount = $sigs.Count }

      # FAIL: relatedSignals exceeds 5
      if ($sigs.Count -gt 5) {
        Write-Fail ("final[{0}] relatedSignals.Count={1} exceeds max of 5" -f $i, $sigs.Count)
      }

      foreach ($sig in $sigs) {
        # FAIL: signal contains self (same URL)
        if (-not [string]::IsNullOrWhiteSpace([string]$sig.url) -and [string]$sig.url -eq [string]$it.originalUrl) {
          Write-Fail ("final[{0}] relatedSignal url={1} matches item's own url" -f $i, $sig.url)
        }
        # FAIL: signal contains self (same id)
        if (-not [string]::IsNullOrWhiteSpace([string]$sig.id) -and [string]$sig.id -eq [string]$it.id) {
          Write-Fail ("final[{0}] relatedSignal id matches item's own id" -f $i)
        }
        # WARN: reason is empty
        $sigReason = [string]$sig.reason
        if ([string]::IsNullOrWhiteSpace($sigReason)) {
          $rsNoReason++
        } else {
          $rsTopReasons += $sigReason.Substring(0, [Math]::Min(60, $sigReason.Length))
        }
        # Check relationTypes
        if ($sig.PSObject.Properties.Name -contains "relationTypes") {
          $rtArr = @($sig.relationTypes)
          if ($rtArr.Count -eq 0) {
            $rsEmptyTypes++
          }
          foreach ($rt in $rtArr) {
            $rtStr = [string]$rt
            if (-not $rsRelTypeDist.ContainsKey($rtStr)) { $rsRelTypeDist[$rtStr] = 0 }
            $rsRelTypeDist[$rtStr]++
            # WARN: same_source is the only relation type (weak semantic match)
            if ($rtArr.Count -eq 1 -and $rtStr -eq "same_source") {
              $rsSameSourceOnly++
            }
          }
        }
        # Track matched companies
        if ($sig.PSObject.Properties.Name -contains "matchedCompanies") {
          foreach ($co in @($sig.matchedCompanies)) {
            $coStr = [string]$co
            if (-not $rsCoDistrib.ContainsKey($coStr)) { $rsCoDistrib[$coStr] = 0 }
            $rsCoDistrib[$coStr]++
          }
        }
      }
      Write-Info ("  final[{0}] relatedSignals: {1}" -f $i, $sigs.Count)
    }

    $avgRS = if ($finalItems.Count -gt 0) { [Math]::Round($rsTotalCount / $finalItems.Count, 1) } else { 0 }
    Write-Host ""
    Write-Host "  --- relatedSignals stats ---"
    Write-Info ("itemsWithRelatedSignals: {0}/{1}" -f $rsWithSignals, $finalItems.Count)
    Write-Info ("avgRelatedSignals:       {0}" -f $avgRS)
    Write-Info ("maxRelatedSignals:       {0}" -f $rsMaxCount)
    if ($rsWithSignals -eq 0 -and $finalItems.Count -gt 0) {
      Write-Warn "No items have relatedSignals (expected after -Refresh or with existing snapshot)"
    } else {
      Write-Ok ("relatedSignals present on {0}/{1} items" -f $rsWithSignals, $finalItems.Count)
    }
    if ($rsNoReason -gt 0) {
      Write-Warn ("{0} relatedSignal(s) have empty reason" -f $rsNoReason)
    }
    if ($rsEmptyTypes -gt 0) {
      Write-Warn ("{0} relatedSignal(s) have empty relationTypes" -f $rsEmptyTypes)
    }
    if ($rsSameSourceOnly -gt 0) {
      Write-Warn ("{0} relatedSignal(s) have same_source as only relation type (weak semantic match)" -f $rsSameSourceOnly)
    }
    # relationTypes distribution
    if ($rsRelTypeDist.Count -gt 0) {
      Write-Host "  --- relatedSignals relationTypes distribution ---"
      foreach ($k in ($rsRelTypeDist.Keys | Sort-Object)) {
        Write-Info ("  {0}: {1}" -f $k, $rsRelTypeDist[$k])
      }
    }
    # Top matched companies
    if ($rsCoDistrib.Count -gt 0) {
      Write-Host "  --- top matchedCompanies ---"
      $topCos = $rsCoDistrib.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5
      foreach ($entry in $topCos) {
        Write-Info ("  {0}: {1}" -f $entry.Key, $entry.Value)
      }
    }
    # Sample reasons (up to 3)
    if ($rsTopReasons.Count -gt 0) {
      Write-Host "  --- sample relation reasons ---"
      $rsTopReasons | Select-Object -First 3 | ForEach-Object {
        Write-Info ("  reason: {0}" -f $_)
      }
    }

    # ── Daily gate checks ────────────────────────────────────────────────────
    $dgTodayCount         = 0
    $dgObserveCount       = 0
    $oldInTodayRec        = 0   # FAIL: non-today item in must_read/high_value
    $prevDelivInFinal     = 0   # FAIL: previously_delivered in must_read/high_value
    $recentUnpushedObs    = 0

    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $it   = $finalItems[$i]
      $tier = [string]$it.recommendationTier

      # Check dailyGate metadata (only present on post-gate snapshots)
      if ($it.PSObject.Properties.Name -contains "dailyGate" -and $null -ne $it.dailyGate) {
        $dg = $it.dailyGate
        $eligible = $false
        if ($dg.PSObject.Properties.Name -contains "eligibleForToday") {
          $eligible = [bool]$dg.eligibleForToday
        }
        $reason = if ($dg.PSObject.Properties.Name -contains "reason") { [string]$dg.reason } else { "" }

        if ($eligible -and ($tier -eq "must_read" -or $tier -eq "high_value")) {
          $dgTodayCount++
        }
        if (-not $eligible -and ($tier -eq "must_read" -or $tier -eq "high_value")) {
          $oldInTodayRec++
          Write-Fail ("final[{0}] tier={1} but dailyGate.eligibleForToday=false (reason={2})" -f $i, $tier, $reason)
        }
        if ($reason -eq "previously_delivered" -and ($tier -eq "must_read" -or $tier -eq "high_value")) {
          $prevDelivInFinal++
          Write-Fail ("final[{0}] previously_delivered item in must_read/high_value (no update_candidate bypass)" -f $i)
        }
      }
      # Check deliveryStatus
      if ($it.PSObject.Properties.Name -contains "deliveryStatus") {
        $ds = [string]$it.deliveryStatus
        if ($ds -eq "recent_unpushed") { $recentUnpushedObs++ }
      }
    }

    Write-Host ""
    Write-Host "  --- daily gate stats ---"
    Write-Info ("todayRecommendationCount: {0}/{1}" -f $dgTodayCount, $finalItems.Count)
    if ($oldInTodayRec -gt 0) {
      Write-Fail ("{0} non-today item(s) in must_read/high_value" -f $oldInTodayRec)
    } else {
      Write-Ok "all must_read/high_value items passed daily gate"
    }
    if ($prevDelivInFinal -gt 0) {
      Write-Fail ("{0} previously_delivered item(s) in must_read/high_value without update_candidate" -f $prevDelivInFinal)
    }
    if ($dgTodayCount -lt 5 -and $dgTodayCount -ge 0) {
      Write-Info ("today recommendation count = {0} (< 5 is OK - no stale content used)" -f $dgTodayCount)
    }
    # Check for items without dailyGate (pre-gate snapshot)
    $withGate = @($finalItems | Where-Object { $_.PSObject.Properties.Name -contains "dailyGate" -and $null -ne $_.dailyGate })
    if ($withGate.Count -eq 0 -and $finalItems.Count -gt 0) {
      Write-Warn "No items have dailyGate metadata (snapshot predates daily gate - run -Refresh)"
    }

    # ── LLM path verification ─────────────────────────────────────────────────
    if ($expectLlm) {
      if ($finalItems.Count -gt 0 -and $llmModelCount -lt 1) {
        Write-Fail "LLM expected but no final item used a non-deterministic model"
      } else {
        Write-Ok ("LLM path verified: {0} item(s) used non-deterministic model" -f $llmModelCount)
      }
      if (-not $seenLlmPath) {
        Write-Warn "No LLM model seen in items — snapshot may predate LLM enablement"
      }
    } else {
      if ($fallbackCount -eq 0) {
        Write-Info "no fallback items in final recommendations"
      } elseif ($fbWithReason -eq $fallbackCount) {
        Write-Ok ("fallback path: {0} item(s) with fallbackReason" -f $fallbackCount)
      } else {
        Write-Warn ("fallbackReason missing on {0}/{1} fallback items" -f ($fallbackCount - $fbWithReason), $fallbackCount)
      }
      if ($seenLlmPath) {
        Write-Info "runtime used LLM path (service env differs from shell env)"
      }
    }
  }
} catch {
  Write-Fail ("recommendations request failed: {0}" -f $_.Exception.Message)
}
Write-Host ""

# ── 2) Snapshots ──────────────────────────────────────────────────────────────

$snapUrl = ("{0}/api/recommendations/snapshots?limit={1}&includeItems=true&itemsLimit=20" -f $Base.TrimEnd('/'), $SnapshotLimit)
Write-Host ("2) GET {0}" -f $snapUrl)
try {
  $snaps = Invoke-RestMethod -Method Get -Uri $snapUrl -TimeoutSec 30
  if (-not $snaps.ok) {
    Write-Fail "snapshots ok=false"
  } else {
    Write-Ok ("snapshots ok=true  count={0}" -f $snaps.count)
    if ($snaps.count -gt 0 -and $null -ne $snaps.snapshots[0].items) {
      $latestItems = @($snaps.snapshots[0].items)
      $latestFinal = @($latestItems | Where-Object { Test-IsFinalTier ([string]$_.recommendationTier) })
      if ($latestFinal.Count -gt 0) {
        $item   = $latestFinal[0]
        $okSnap = Test-DeepDiveFields $item.deepDive "latestSnapshot.final[0]"
        if ($okSnap) {
          Write-Ok "latest snapshot final item has complete deepDive"
          $scs = if ($item.deepDive.PSObject.Properties.Name -contains "contentStatus") { [string]$item.deepDive.contentStatus } else { "unknown" }
          Write-Info ("snapshot contentStatus: {0}" -f $scs)

          if ($item.deepDive.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $item.deepDive.inputDiagnostics) {
            $d = $item.deepDive.inputDiagnostics
            Write-Info ("snapshot inputDiag: sumLen={0} fcLen={1} src={2}" -f $d.inputSummaryLength, $d.inputFullContentLength, $d.contentSource)
            Write-Ok "inputDiagnostics preserved in snapshot"
            $sfc = if ($d.PSObject.Properties.Name -contains "inputFullContentLength") { [int]$d.inputFullContentLength } else { 0 }
            if (($scs -eq "full_article" -or $scs -eq "extracted_article") -and $sfc -lt 500) {
              Write-Fail ("snapshot contentStatus={0} but inputFullContentLength={1}" -f $scs, $sfc)
            }
          } else {
            Write-Warn "inputDiagnostics not in snapshot (pre-v2 or not encoded)"
          }

          # fallbackReason in snapshot: should be null for generated, non-null for fallback
          $snapStatus = [string]$item.deepDive.status
          $snapFr     = if ($item.deepDive.PSObject.Properties.Name -contains "fallbackReason") { [string]$item.deepDive.fallbackReason } else { "" }
          if ($snapStatus -eq "generated" -and -not [string]::IsNullOrWhiteSpace($snapFr)) {
            Write-Fail ("snapshot item status=generated but fallbackReason non-null: {0}" -f $snapFr.Substring(0, [Math]::Min(60, $snapFr.Length)))
          } elseif ($snapStatus -eq "fallback" -and -not [string]::IsNullOrWhiteSpace($snapFr)) {
            Write-Info ("snapshot fallbackReason: {0}" -f $snapFr.Substring(0, [Math]::Min(60, $snapFr.Length)))
          }
        }
      } else {
        Write-Warn "latest snapshot has no must_read/high_value items"
      }
    } else {
      Write-Warn "latest snapshot has no items"
    }
  }
} catch {
  Write-Fail ("snapshots request failed: {0}" -f $_.Exception.Message)
}
Write-Host ""

# ── 3) Cross-snapshot repeat recommendation check ─────────────────────────────
# Detects items that appear in must_read/high_value across multiple recent snapshots.
# Root cause: high final_score keeps an item in must_read for the full 72h window.
# Fix: freshness decay in computeRecommendationScore + getPreviouslyRecommendedItemIds suppression.

Write-Host "3) Cross-snapshot repeat recommendation check"
try {
  $snapUrl3 = ("{0}/api/recommendations/snapshots?limit=5&includeItems=true&itemsLimit=30" -f $Base.TrimEnd('/'))
  $snaps3 = Invoke-RestMethod -Method Get -Uri $snapUrl3 -TimeoutSec 30

  if ($snaps3.ok -and $snaps3.count -ge 2) {
    $allSnaps3 = @($snaps3.snapshots)
    $seenInFinal = @{}
    $seenTitle   = @{}
    $oldInFinal  = @()

    for ($sIdx = 0; $sIdx -lt $allSnaps3.Count; $sIdx++) {
      $snap3 = $allSnaps3[$sIdx]
      $snapItems3 = if ($snap3.PSObject.Properties.Name -contains "items" -and $null -ne $snap3.items) {
        @($snap3.items)
      } else { @() }

      foreach ($it3 in $snapItems3) {
        $tier3 = [string]$it3.recommendationTier
        if ($tier3 -ne "must_read" -and $tier3 -ne "high_value") { continue }

        # Key by item_id (prefer) or url
        $iid3 = if (-not [string]::IsNullOrWhiteSpace([string]$it3.id)) { [string]$it3.id } else { "" }
        if (-not [string]::IsNullOrWhiteSpace($iid3)) {
          if (-not $seenInFinal.ContainsKey($iid3)) { $seenInFinal[$iid3] = [System.Collections.Generic.List[int]]::new() }
          $seenInFinal[$iid3].Add($sIdx)
        }

        # Key by normalized title
        $rawTitle3 = [string]$it3.title
        if (-not [string]::IsNullOrWhiteSpace($rawTitle3)) {
          $normTitle3 = $rawTitle3.ToLower().Trim() -replace '[^\w\s]','' -replace '\s+',' '
          if (-not $seenTitle.ContainsKey($normTitle3)) { $seenTitle[$normTitle3] = [System.Collections.Generic.List[int]]::new() }
          $seenTitle[$normTitle3].Add($sIdx)
        }

        # Check published age for items in latest snapshot (sIdx=0)
        if ($sIdx -eq 0) {
          $pubAt3 = [string]$it3.publishedAt
          if (-not [string]::IsNullOrWhiteSpace($pubAt3)) {
            try {
              $pubAge3 = [Math]::Round((([datetime]::UtcNow) - ([datetime]$pubAt3)).TotalHours, 1)
              if ($pubAge3 -gt 48) {
                $titleSnip = if ($rawTitle3.Length -gt 60) { $rawTitle3.Substring(0,60) } else { $rawTitle3 }
                $oldInFinal += ("{0}h old [{1}]: {2}" -f $pubAge3, $tier3, $titleSnip)
              }
            } catch {}
          }
        }
      }
    }

    $repeatCount = ($seenInFinal.Values | Where-Object { $_.Count -ge 2 } | Measure-Object).Count
    $repeatTitleCount = ($seenTitle.Values | Where-Object { $_.Count -ge 2 } | Measure-Object).Count

    if ($repeatCount -eq 0 -and $repeatTitleCount -eq 0) {
      Write-Ok ("No repeated items in must_read/high_value across last {0} snapshots" -f $allSnaps3.Count)
    } else {
      Write-Warn ("Repeated must_read/high_value items detected: {0} by id, {1} by title" -f $repeatCount, $repeatTitleCount)
      Write-Warn "  Cause: high final_score + no daily gate on old snapshot"
      Write-Info "  Fix: run -Refresh to rebuild snapshot with daily hard gate applied"
      # Show examples
      $examples = $seenInFinal.GetEnumerator() | Where-Object { $_.Value.Count -ge 2 } | Select-Object -First 3
      foreach ($ex in $examples) {
        $exKey = if ($ex.Key.Length -gt 60) { $ex.Key.Substring(0,60) } else { $ex.Key }
        Write-Info ("  repeated id: [{0}] in snapshot indices [{1}]" -f $exKey, ($ex.Value -join ","))
      }
    }

    if ($oldInFinal.Count -gt 0) {
      Write-Warn ("{0} item(s) older than 48h still in must_read/high_value in latest snapshot:" -f $oldInFinal.Count)
      $oldInFinal | Select-Object -First 3 | ForEach-Object { Write-Info ("  {0}" -f $_) }
    } else {
      Write-Ok "No items older than 48h in must_read/high_value of latest snapshot"
    }

  } elseif ($snaps3.ok -and $snaps3.count -eq 1) {
    Write-Info "Only 1 snapshot available - need 2+ to check for repeats (run -Refresh twice)"
  } elseif ($snaps3.ok -and $snaps3.count -eq 0) {
    Write-Warn "No snapshots available for repeat check"
  } else {
    Write-Warn "Could not load snapshots for repeat check"
  }
} catch {
  Write-Warn ("Cross-snapshot repeat check failed: {0}" -f $_.Exception.Message)
}
Write-Host ""

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "=== Summary ==="
Write-Host ("Verify mode: {0}" -f $verifyMode)
if ($script:allOk) {
  Write-Host "RESULT: PASS" -ForegroundColor Green
  exit 0
}
Write-Host "RESULT: FAIL" -ForegroundColor Red
exit 1
