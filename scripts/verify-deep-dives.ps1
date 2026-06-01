param(
  [string]$Base = "http://localhost:3000",
  [int]$SnapshotLimit = 5,
  [int]$ItemLimit = 30,
  [switch]$SkipRefresh
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

Write-Host ""
Write-Host "=== Verify Recommendation Deep Dives ===" -ForegroundColor Cyan
Write-Host ("Base:        {0}" -f $Base)
Write-Host ("Time:        {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ("enabled={0}  keySet={1}  proModel={2}" -f $llmEnabled, $llmKeySet, $proModel)
Write-Host ("LLM expected: {0}" -f $expectLlm)
Write-Host ""

# ── 0) Refresh ────────────────────────────────────────────────────────────────

$refresh = $null
if ($SkipRefresh) {
  Write-Warn "Refresh skipped by -SkipRefresh flag"
} else {
  $refreshUrl = ("{0}/api/recommendations/refresh?deepDive=llm" -f $Base.TrimEnd('/'))
  Write-Host ("0) POST {0}" -f $refreshUrl)
  try {
    $refresh = Invoke-RestMethod -Method Post -Uri $refreshUrl -TimeoutSec 180
    if ($refresh.ok) { Write-Ok "refresh ok=true" } else { Write-Fail "refresh ok=false" }
    # Timing breakdown
    if ($refresh.PSObject.Properties.Name -contains "timing" -and $null -ne $refresh.timing) {
      $t = $refresh.timing
      Write-Info ("timing: total={0}ms  query={1}ms  deepDive={2}ms" -f $t.totalMs, $t.queryMs, $t.deepDiveMs)
    } elseif ($refresh.PSObject.Properties.Name -contains "durationMs") {
      Write-Info ("timing: total={0}ms" -f $refresh.durationMs)
    }
    # Article fetch stats (from ingest phase)
    if ($refresh.PSObject.Properties.Name -contains "ingest" -and $null -ne $refresh.ingest -and
        $refresh.ingest.PSObject.Properties.Name -contains "articleFetch") {
      $af = $refresh.ingest.articleFetch
      Write-Info ("articleFetch: enabled={0} attempted={1} succeeded={2} failed={3} skipped={4} avgLen={5}" -f `
        $af.enabled, $af.attempted, $af.succeeded, $af.failed, $af.skipped, $af.averageContentLength)
      if ($af.enabled -and [int]$af.attempted -eq 0) {
        Write-Warn "articleFetch enabled but attempted=0 (check ARTICLE_FETCH_ENABLED env and ingest phase)"
      }
      if ($af.enabled -and [int]$af.attempted -gt 0 -and [int]$af.succeeded -eq 0) {
        Write-Warn ("articleFetch attempted={0} but succeeded=0 (sites may be blocking)" -f $af.attempted)
      }
    }
    if ($refresh.deepDiveStats) {
      $ds = $refresh.deepDiveStats
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
    } else {
      Write-Warn "refresh response missing deepDiveStats"
    }
  } catch {
    Write-Fail ("refresh request failed: {0}" -f $_.Exception.Message)
  }
  Write-Host ""
}

# ── 1) Recommendations ────────────────────────────────────────────────────────

$recUrl = ("{0}/api/recommendations?windowHours=72&limit={1}" -f $Base.TrimEnd('/'), $ItemLimit)
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
    $archiveItems = @($items | Where-Object { ([string]$_.recommendationTier) -eq "archive" })

    Write-Ok ("final items (must_read/high_value): {0}" -f $finalItems.Count)
    Write-Info ("observe={0}  archive={1}" -f $observeItems.Count, $archiveItems.Count)

    # ── Cross-check generated/fallback/failed stats ───────────────────────────
    # Count from the GET response items (snapshot-decoded values)
    $snapGenerated = 0; $snapFallback = 0; $snapFailed = 0
    foreach ($it in $finalItems) {
      if ($null -eq $it.deepDive) { continue }
      $st = [string]$it.deepDive.status
      if ($st -eq "generated") { $snapGenerated++ }
      elseif ($st -eq "fallback") { $snapFallback++ }
      elseif ($st -eq "error") { $snapFailed++ }
    }
    Write-Info ("snapshot decoded: generated={0}  fallback={1}  failed={2}" -f $snapGenerated, $snapFallback, $snapFailed)

    # Compare with refresh stats (if available)
    if ($null -ne $refresh -and $null -ne $refresh.deepDiveStats) {
      $rds = $refresh.deepDiveStats
      $rGen = [int]$rds.generated; $rFb = [int]$rds.fallback; $rFail = [int]$rds.failed
      Write-Info ("refresh stats:          generated={0}  fallback={1}  failed={2}" -f $rGen, $rFb, $rFail)
      if ($snapGenerated -ne $rGen -or $snapFallback -ne $rFb) {
        Write-Warn ("Stats mismatch: refresh(gen={0} fb={1}) vs snapshot(gen={2} fb={3}) — may be stale snapshot or race" -f $rGen, $rFb, $snapGenerated, $snapFallback)
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

      $model     = [string]$dd.model
      $provider  = [string]$dd.provider
      $status    = [string]$dd.status
      $cs        = if ($dd.PSObject.Properties.Name -contains "contentStatus") { [string]$dd.contentStatus } else { "unknown" }
      $osLen     = ([string]$dd.oneSentence).Length
      $fuCount   = @($dd.followUp).Count

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

      # FAIL: full_article or extracted_article with empty fullContent
      if ($dd.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $dd.inputDiagnostics) {
        $diag    = $dd.inputDiagnostics
        $fcLen   = 0
        $sumLen  = 0
        $titLen  = 0
        $cSrc    = "unknown"
        if ($diag.PSObject.Properties.Name -contains "inputTitleLength")       { $titLen = [int]$diag.inputTitleLength }
        if ($diag.PSObject.Properties.Name -contains "inputSummaryLength")     { $sumLen = [int]$diag.inputSummaryLength }
        if ($diag.PSObject.Properties.Name -contains "inputFullContentLength") { $fcLen  = [int]$diag.inputFullContentLength }
        if ($diag.PSObject.Properties.Name -contains "contentSource")          { $cSrc   = [string]$diag.contentSource }

        $titleLens       += $titLen
        $summaryLens     += $sumLen
        $fullContentLens += $fcLen

        if (-not $srcDistrib.ContainsKey($cSrc)) { $srcDistrib[$cSrc] = 0 }
        $srcDistrib[$cSrc]++

        # FAIL: full_article / extracted_article contentStatus but fullContent is empty
        if (($cs -eq "full_article" -or $cs -eq "extracted_article") -and $fcLen -lt 500) {
          Write-Fail ("{0} contentStatus={1} but inputFullContentLength={2}" -f $pfx, $cs, $fcLen)
        }
        # WARN: content fetch source but fullContent is empty
        if (($cSrc -eq "fetched_article" -or $cSrc -eq "rss_content") -and $fcLen -lt 400) {
          Write-Warn ("{0} contentSource={1} but inputFullContentLength={2}" -f $pfx, $cSrc, $fcLen)
        }
        # rawModelContentStatus audit
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

      # fallback reason check
      if ($status -eq "fallback") {
        $fallbackCount++
        $fr = [string]$dd.fallbackReason
        if (-not [string]::IsNullOrWhiteSpace($fr)) {
          $fbWithReason++
          Write-Info ("  fallbackReason: {0}" -f $fr.Substring(0, [Math]::Min(80, $fr.Length)))
        } else {
          Write-Warn ("{0} fallbackReason missing" -f $pfx)
        }
      }
      if ($model -ne "deterministic-v1" -and $status -eq "generated") {
        $llmModelCount++
        $seenLlmPath = $true
      }
    }

    # contentStatus distribution
    Write-Host ""
    Write-Host "  --- contentStatus distribution ---"
    Write-Info "(full_article=确认全文  extracted_article=较长正文  partial=部分  rss_summary=摘要)"
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
      Write-Warn "All items still 'partial' — check inferContentStatus raw length fix"
    }

    # contentSource distribution
    Write-Host "  --- contentSource distribution ---"
    Write-Info "(rss_content=RSS全文  fetched_article=抓取正文  rss_summary=RSS摘要)"
    if ($srcDistrib.Count -gt 0) {
      foreach ($k in ($srcDistrib.Keys | Sort-Object)) {
        $color = if ($k -eq "rss_content" -or $k -eq "fetched_article") { "Cyan" } else { "Gray" }
        Write-Host ("  {0}: {1}" -f $k, $srcDistrib[$k]) -ForegroundColor $color
      }
    } else {
      Write-Host "  (none)" -ForegroundColor Gray
    }

    # FAIL: all contentStatus are unknown
    if ($csDistrib.ContainsKey("unknown") -and $csDistrib["unknown"] -eq $finalItems.Count -and $finalItems.Count -gt 0) {
      Write-Fail "All contentStatus are 'unknown' — inputDiagnostics not being populated"
    }

    # Average input lengths
    if ($summaryLens.Count -gt 0) {
      $avgT  = [Math]::Round(($titleLens       | Measure-Object -Average).Average, 1)
      $avgS  = [Math]::Round(($summaryLens     | Measure-Object -Average).Average, 1)
      $avgFC = [Math]::Round(($fullContentLens | Measure-Object -Average).Average, 1)
      Write-Host ""
      Write-Host "  --- average input lengths ---"
      Write-Host ("  avg title:       {0} chars" -f $avgT)
      Write-Host ("  avg summary:     {0} chars  (RSS capped ~300)" -f $avgS)
      Write-Host ("  avg fullContent: {0} chars  (target: >2000)" -f $avgFC)

      # WARN if all items have identical fcLen (diagnostic cap bug)
      $allSameFcLen = ($fullContentLens | Select-Object -Unique).Count -eq 1 -and $fullContentLens.Count -gt 1
      if ($allSameFcLen) {
        Write-Warn ("All items have IDENTICAL fcLen={0} — likely pre-fix diagnostic (should now be fixed)" -f $fullContentLens[0])
      }

      if ($avgFC -lt 50) {
        Write-Warn ("avg fullContent very short ({0} chars). LLM only saw RSS summary." -f $avgFC)
      } elseif ($avgFC -lt 500) {
        Write-Warn ("avg fullContent {0} chars — partial; check ARTICLE_FETCH_ENABLED or RSS content:encoded" -f $avgFC)
      } elseif ($avgFC -ge 2000) {
        Write-Ok ("avg fullContent {0} chars — good content depth" -f $avgFC)
      } else {
        Write-Info ("avg fullContent {0} chars — partial content" -f $avgFC)
      }
    } elseif ($diagMissing -gt 0) {
      Write-Warn ("inputDiagnostics missing on {0} items -- run fresh snapshot first" -f $diagMissing)
    }

    # fallbackReason distribution (only for fallback status items)
    $fallbackReasons = @{}
    $invalidJsonCount = 0
    $generatedWithFr = 0   # track generated items that (incorrectly) have fallbackReason
    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $dd = $finalItems[$i].deepDive
      if ($null -eq $dd) { continue }
      $status = [string]$dd.status
      $fr = if ($dd.PSObject.Properties.Name -contains "fallbackReason") { [string]$dd.fallbackReason } else { "" }

      # Track generated items that still have fallbackReason (should be fixed by now)
      if ($status -eq "generated" -and -not [string]::IsNullOrWhiteSpace($fr)) {
        $generatedWithFr++
      }

      if ($status -eq "fallback") {
        if ([string]::IsNullOrWhiteSpace($fr)) { $fr = "(no reason)" }
        # Categorize without exposing raw garbled text
        $cat = if ($fr -match "not valid JSON|invalid_json") { "invalid_json" }
               elseif ($fr -match "retry_failed") { "retry_failed" }
               elseif ($fr -match "quality|vague|garbled") { "quality_issue" }
               elseif ($fr -match "parse|required_field|missing") { "parse_error" }
               elseif ($fr -match "LLM disabled|missing API|llm_disabled") { "llm_disabled" }
               elseif ($fr -match "timeout|abort") { "timeout" }
               elseif ($fr -match "llm_error") { "llm_error" }
               else { "other" }
        if ($cat -eq "invalid_json") { $invalidJsonCount++ }
        if (-not $fallbackReasons.ContainsKey($cat)) { $fallbackReasons[$cat] = 0 }
        $fallbackReasons[$cat]++
      }
    }
    Write-Host ""
    Write-Host "  --- fallbackReason distribution (fallback items only) ---"
    if ($fallbackReasons.Count -eq 0) {
      Write-Ok "(no fallback items — all generated)"
    } else {
      foreach ($k in ($fallbackReasons.Keys | Sort-Object)) {
        $color = if ($k -eq "invalid_json" -or $k -eq "retry_failed") { "Yellow" } else { "Gray" }
        Write-Host ("  {0}: {1}" -f $k, $fallbackReasons[$k]) -ForegroundColor $color
      }
    }
    if ($invalidJsonCount -gt 0) {
      Write-Warn ("invalid JSON fallbacks: {0}" -f $invalidJsonCount)
    } else {
      Write-Ok "invalid JSON fallbacks: 0"
    }
    if ($generatedWithFr -gt 0) {
      Write-Fail ("{0} generated item(s) still have non-null fallbackReason — fix not applied?" -f $generatedWithFr)
    } else {
      Write-Ok "generated items: fallbackReason is null for all"
    }

    if ($summaryOnlyN -gt 0) {
      Write-Info ("summary-limited items (rss_summary/title_only/partial/missing): {0}/{1}" -f $summaryOnlyN, $finalItems.Count)
    }

    # Image stats
    $coverCount = 0
    $mediaCount = 0
    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $it = $finalItems[$i]
      if (-not [string]::IsNullOrWhiteSpace([string]$it.coverImageUrl)) { $coverCount++ }
      if ($it.PSObject.Properties.Name -contains "mediaUrls" -and $null -ne $it.mediaUrls -and @($it.mediaUrls).Count -gt 0) { $mediaCount++ }
    }
    Write-Info ("itemsWithCoverImage: {0}/{1}" -f $coverCount, $finalItems.Count)
    Write-Info ("itemsWithMediaUrls:  {0}/{1}" -f $mediaCount, $finalItems.Count)

    # LLM path verification
    if ($expectLlm) {
      if ($null -ne $refresh -and $refresh.deepDiveStats -and [int]$refresh.deepDiveStats.generated -le 0) {
        Write-Fail "LLM expected but refresh.deepDiveStats.generated <= 0"
      }
      if ($finalItems.Count -gt 0 -and $llmModelCount -lt 1) {
        Write-Fail "LLM expected but no final item used non-deterministic model"
      } else {
        Write-Ok ("LLM path verified (generated items: {0})" -f $llmModelCount)
      }
    } else {
      if ($fallbackCount -eq 0) {
        Write-Info "no fallback items in final recommendations"
      } elseif ($fbWithReason -eq $fallbackCount) {
        Write-Ok ("fallback path verified with fallbackReason ({0} items)" -f $fallbackCount)
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
        $item    = $latestFinal[0]
        $okSnap  = Test-DeepDiveFields $item.deepDive "latestSnapshot.final[0]"
        if ($okSnap) {
          Write-Ok "latest snapshot final item has complete deepDive"
          $scs = if ($item.deepDive.PSObject.Properties.Name -contains "contentStatus") { [string]$item.deepDive.contentStatus } else { "unknown" }
          Write-Info ("snapshot contentStatus: {0}" -f $scs)
          if ($item.deepDive.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $item.deepDive.inputDiagnostics) {
            $d = $item.deepDive.inputDiagnostics
            Write-Info ("snapshot inputDiag: sumLen={0} fcLen={1} src={2}" -f $d.inputSummaryLength, $d.inputFullContentLength, $d.contentSource)
            Write-Ok "inputDiagnostics preserved in snapshot"
            # FAIL: snapshot shows full_article but fullContent is empty
            $sfc = if ($d.PSObject.Properties.Name -contains "inputFullContentLength") { [int]$d.inputFullContentLength } else { 0 }
            if ($scs -eq "full_article" -and $sfc -lt 500) {
              Write-Fail ("snapshot contentStatus=full_article but inputFullContentLength={0}" -f $sfc)
            }
          } else {
            Write-Warn "inputDiagnostics not in snapshot (pre-v2 or not encoded)"
          }
          if ($item.deepDive.PSObject.Properties.Name -contains "fallbackReason" -and -not [string]::IsNullOrWhiteSpace([string]$item.deepDive.fallbackReason)) {
            Write-Info ("snapshot fallbackReason: {0}" -f [string]$item.deepDive.fallbackReason)
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

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "=== Summary ==="
if ($script:allOk) {
  Write-Host "RESULT: PASS" -ForegroundColor Green
  exit 0
}
Write-Host "RESULT: FAIL" -ForegroundColor Red
exit 1
