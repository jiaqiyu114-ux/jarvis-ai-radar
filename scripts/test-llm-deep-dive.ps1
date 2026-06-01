param(
  [string]$Base = "http://localhost:3000",
  [string]$Mode = "llm"
)

$ErrorActionPreference = "Stop"

$enabledRaw  = $env:LLM_DEEPDIVE_ENABLED
if ($null -eq $enabledRaw) { $enabledRaw = "" }
$enabled     = ($enabledRaw.ToLower() -eq "true")
$keySet      = -not [string]::IsNullOrWhiteSpace($env:LLM_API_KEY)
$defaultModel = if ([string]::IsNullOrWhiteSpace($env:LLM_MODEL)) { "deepseek-reasoner" } else { [string]$env:LLM_MODEL }
$fastModel   = if ([string]::IsNullOrWhiteSpace($env:LLM_FAST_MODEL)) { $defaultModel } else { [string]$env:LLM_FAST_MODEL }
$proModel    = if ([string]::IsNullOrWhiteSpace($env:LLM_PRO_MODEL)) { $defaultModel } else { [string]$env:LLM_PRO_MODEL }
$expectGenerated = $enabled -and $keySet -and ($Mode -eq "llm")

function Test-DeepDiveShape {
  param($Obj, [string]$Prefix)
  if ($null -eq $Obj) {
    Write-Host ("[FAIL] {0} deepDive is null" -f $Prefix) -ForegroundColor Red
    return $false
  }
  $required = @("oneSentence","whatHappened","whyItMatters","userValue","uncertainty")
  foreach ($k in $required) {
    if (-not ($Obj.PSObject.Properties.Name -contains $k)) {
      Write-Host ("[FAIL] {0} missing field: {1}" -f $Prefix, $k) -ForegroundColor Red
      return $false
    }
    $v = [string]$Obj.$k
    if ([string]::IsNullOrWhiteSpace($v)) {
      Write-Host ("[FAIL] {0} empty field: {1}" -f $Prefix, $k) -ForegroundColor Red
      return $false
    }
  }
  if (-not ($Obj.PSObject.Properties.Name -contains "followUp")) {
    Write-Host ("[FAIL] {0} missing field: followUp" -f $Prefix) -ForegroundColor Red
    return $false
  }
  $fuCount = @($Obj.followUp).Count
  if ($fuCount -lt 1) {
    Write-Host ("[FAIL] {0} followUp is empty" -f $Prefix) -ForegroundColor Red
    return $false
  }
  return $true
}

Write-Host ""
Write-Host "=== Test LLM Deep Dive ===" -ForegroundColor Cyan
Write-Host ("Base:             {0}" -f $Base)
Write-Host ("Mode:             {0}" -f $Mode)
Write-Host ("enabled={0}  keySet={1}  fastModel={2}  proModel={3}" -f $enabled, $keySet, $fastModel, $proModel)
Write-Host ("expectGenerated:  {0}" -f $expectGenerated)
Write-Host ""
Write-Host "NOTE: This script triggers a new LLM refresh (POST /api/recommendations/refresh)." -ForegroundColor Yellow
Write-Host "      Use verify-deep-dives.ps1 (read-only by default) for stable snapshot checks." -ForegroundColor DarkGray
Write-Host ""

$url = ("{0}/api/recommendations/refresh?deepDive={1}" -f $Base.TrimEnd('/'), $Mode)
Write-Host ("POST {0}" -f $url)

$res = Invoke-RestMethod -Method Post -Uri $url -TimeoutSec 180

Write-Host ""
if (-not $res.ok) {
  Write-Host ("[FAIL] refresh failed: {0}" -f $res.error) -ForegroundColor Red
  exit 1
}

Write-Host ("runStatus: {0}" -f $res.runStatus)

# ── Timing breakdown ──────────────────────────────────────────────────────────
if ($res.PSObject.Properties.Name -contains "timing" -and $null -ne $res.timing) {
  $t = $res.timing
  $relMs = if ($t.PSObject.Properties.Name -contains "relatedSignalsMs") { $t.relatedSignalsMs } else { "n/a" }
  Write-Host ("timing: total={0}ms  query={1}ms  deepDive={2}ms  relatedSignals={3}ms" -f $t.totalMs, $t.queryMs, $t.deepDiveMs, $relMs)
} elseif ($res.PSObject.Properties.Name -contains "durationMs") {
  Write-Host ("timing: total={0}ms" -f $res.durationMs)
}

# ── Related Signals stats ──────────────────────────────────────────────────────
if ($res.PSObject.Properties.Name -contains "relatedSignals" -and $null -ne $res.relatedSignals) {
  $rs = $res.relatedSignals
  Write-Host ("relatedSignals: ms={0}ms  pool={1}  itemsWithSignals={2}  avgSignals={3}" -f `
    $rs.ms, $rs.candidatePoolSize, $rs.itemsWithSignals, $rs.avgSignals)
}

# ── Article fetch stats (from ingest phase of pipeline, if available) ──────────
if ($res.PSObject.Properties.Name -contains "ingest" -and $null -ne $res.ingest -and
    $res.ingest.PSObject.Properties.Name -contains "articleFetch") {
  $af = $res.ingest.articleFetch
  Write-Host ("articleFetch: enabled={0} attempted={1} succeeded={2} failed={3} skipped={4} avgLen={5}" -f `
    $af.enabled, $af.attempted, $af.succeeded, $af.failed, $af.skipped, $af.averageContentLength)
}

if ($res.deepDiveStats) {
  $ds = $res.deepDiveStats
  Write-Host ("deepDiveStats: total={0}  generated={1}  fallback={2}  failed={3}  model={4}  provider={5}  mode={6}" -f `
    $ds.total, $ds.generated, $ds.fallback, $ds.failed, $ds.model, $ds.provider, $ds.mode)
  Write-Host ("actualDeepDiveModel: {0}" -f $ds.model)
  Write-Host ("actualProvider:      {0}" -f $ds.provider)

  if ($expectGenerated -and [int]$ds.generated -le 0) {
    Write-Host ("[FAIL] expected generated > 0, but got {0}" -f $ds.generated) -ForegroundColor Red
    exit 1
  }
}

$items = @(); if ($res.items) { $items = @($res.items) }
$final = @($items | Where-Object { $_.recommendationTier -in @("must_read","high_value") })

Write-Host ("finalItems (must_read/high_value): {0}" -f $final.Count)

# ── Cross-check generated/fallback/failed from item-level stats ───────────────
$itemGenerated = 0; $itemFallback = 0; $itemFailed = 0
foreach ($it in $final) {
  if ($null -eq $it.deepDive) { continue }
  $st = [string]$it.deepDive.status
  if ($st -eq "generated") { $itemGenerated++ }
  elseif ($st -eq "fallback") { $itemFallback++ }
  elseif ($st -eq "error") { $itemFailed++ }
}
Write-Host ("item-level: generated={0}  fallback={1}  failed={2}" -f $itemGenerated, $itemFallback, $itemFailed)
if ($res.deepDiveStats) {
  $rGen = [int]$res.deepDiveStats.generated
  $rFb  = [int]$res.deepDiveStats.fallback
  if ($itemGenerated -ne $rGen -or $itemFallback -ne $rFb) {
    Write-Host ("[WARN] Stats mismatch: API stats(gen={0} fb={1}) vs items(gen={2} fb={3})" -f `
      $rGen, $rFb, $itemGenerated, $itemFallback) -ForegroundColor Yellow
  } else {
    Write-Host "[OK]   item-level stats match API deepDiveStats" -ForegroundColor Green
  }
}

# ── per-item stats ─────────────────────────────────────────────────────────────

$csDistrib       = @{}
$srcDistrib      = @{}
$titleLens       = @()
$summaryLens     = @()
$fullContentLens = @()
$badShape        = $false
$csInconsistencies = 0

for ($i = 0; $i -lt $final.Count; $i++) {
  $it     = $final[$i]
  $dd     = $it.deepDive
  $model  = [string]$dd.model
  $prov   = [string]$dd.provider
  $status = [string]$dd.status
  $cs     = if ($dd.PSObject.Properties.Name -contains "contentStatus") { [string]$dd.contentStatus } else { "unknown" }
  $osLen  = ([string]$dd.oneSentence).Length
  $fuCnt  = @($dd.followUp).Count

  if (-not $csDistrib.ContainsKey($cs)) { $csDistrib[$cs] = 0 }
  $csDistrib[$cs]++

  $fcLen   = 0
  $sumLen  = 0
  $titLen  = 0
  $cSrc    = "unknown"
  $rawMCS  = ""
  $diagLine = "inputDiagnostics=missing"

  if ($dd.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $dd.inputDiagnostics) {
    $diag = $dd.inputDiagnostics
    if ($diag.PSObject.Properties.Name -contains "inputTitleLength")       { $titLen = [int]$diag.inputTitleLength }
    if ($diag.PSObject.Properties.Name -contains "inputSummaryLength")     { $sumLen = [int]$diag.inputSummaryLength }
    if ($diag.PSObject.Properties.Name -contains "inputFullContentLength") { $fcLen  = [int]$diag.inputFullContentLength }
    if ($diag.PSObject.Properties.Name -contains "contentSource")          { $cSrc   = [string]$diag.contentSource }
    if ($diag.PSObject.Properties.Name -contains "rawModelContentStatus")  { $rawMCS = [string]$diag.rawModelContentStatus }

    $titleLens       += $titLen
    $summaryLens     += $sumLen
    $fullContentLens += $fcLen

    if (-not $srcDistrib.ContainsKey($cSrc)) { $srcDistrib[$cSrc] = 0 }
    $srcDistrib[$cSrc]++

    $diagLine = ("src={0} titleLen={1} sumLen={2} fcLen={3}" -f $cSrc, $titLen, $sumLen, $fcLen)
    if ($rawMCS -ne "" -and $rawMCS -ne $cs) {
      $diagLine += (" [model={0} -> sys={1}]" -f $rawMCS, $cs)
      $csInconsistencies++
    }
  }

  Write-Host ("  [{0}] status={1} | cs={2} | model={3} | provider={4} | osLen={5} | fu={6}" -f `
    $i, $status, $cs, $model, $prov, $osLen, $fuCnt)
  Write-Host ("       {0}" -f $diagLine)

  # WARN: generated status but non-null fallbackReason
  # FAIL: generated must have null fallbackReason
  if ($status -eq "generated" -and $dd.PSObject.Properties.Name -contains "fallbackReason") {
    $fr = [string]$dd.fallbackReason
    if (-not [string]::IsNullOrWhiteSpace($fr)) {
      Write-Host ("[FAIL] item[{0}] status=generated but fallbackReason non-null: {1}" -f $i, $fr.Substring(0, [Math]::Min(80, $fr.Length))) -ForegroundColor Red
    }
  }
  # FAIL: fallback must have non-null fallbackReason
  if ($status -eq "fallback") {
    $fr = [string]$dd.fallbackReason
    if ([string]::IsNullOrWhiteSpace($fr)) {
      Write-Host ("[FAIL] item[{0}] status=fallback but fallbackReason is null/empty" -f $i) -ForegroundColor Red
    } else {
      Write-Host ("       fallbackReason: {0}" -f $fr.Substring(0, [Math]::Min(80, $fr.Length))) -ForegroundColor Gray
    }
  }
  # WARN/FAIL: full_article with empty fullContent
  if (($cs -eq "full_article" -or $cs -eq "extracted_article") -and $fcLen -lt 500) {
    Write-Host ("[WARN] item[{0}] contentStatus={1} but inputFullContentLength={2} -- likely incorrect" -f $i, $cs, $fcLen) -ForegroundColor Yellow
  }
  # WARN: fetched_article / rss_content source but fullContent empty
  if (($cSrc -eq "fetched_article" -or $cSrc -eq "rss_content") -and $fcLen -lt 400) {
    Write-Host ("[WARN] item[{0}] contentSource={1} but inputFullContentLength={2}" -f $i, $cSrc, $fcLen) -ForegroundColor Yellow
  }

  if (-not (Test-DeepDiveShape $dd ("final[{0}]" -f $i))) {
    $badShape = $true
  }
}

if ($badShape) {
  Write-Host "[FAIL] deepDive shape check failed" -ForegroundColor Red
  exit 1
}

# --- Image / cover stats ---
$itemsWithCover  = 0
$itemsWithMedia  = 0
for ($i = 0; $i -lt $final.Count; $i++) {
  $it = $final[$i]
  if (-not [string]::IsNullOrWhiteSpace([string]$it.coverImageUrl)) { $itemsWithCover++ }
  if ($it.PSObject.Properties.Name -contains "mediaUrls" -and $null -ne $it.mediaUrls -and @($it.mediaUrls).Count -gt 0) { $itemsWithMedia++ }
}
Write-Host ("itemsWithCoverImage: {0}/{1}" -f $itemsWithCover, $final.Count)
Write-Host ("itemsWithMediaUrls:  {0}/{1}" -f $itemsWithMedia, $final.Count)

# --- full_article + fullContent=0 consistency check ---
$fullArtBadCount = 0
for ($i = 0; $i -lt $final.Count; $i++) {
  $it = $final[$i]
  $cs = if ($it.deepDive.PSObject.Properties.Name -contains "contentStatus") { [string]$it.deepDive.contentStatus } else { "" }
  $fcLen = 0
  if ($it.deepDive.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $it.deepDive.inputDiagnostics) {
    if ($it.deepDive.inputDiagnostics.PSObject.Properties.Name -contains "inputFullContentLength") {
      $fcLen = [int]$it.deepDive.inputDiagnostics.inputFullContentLength
    }
  }
  if ($cs -eq "full_article" -and $fcLen -lt 500) {
    $fullArtBadCount++
    Write-Host ("[WARN] item[{0}] contentStatus=full_article but fcLen={1}" -f $i, $fcLen) -ForegroundColor Yellow
  }
}
if ($fullArtBadCount -eq 0 -and $final.Count -gt 0) {
  Write-Host "full_article+empty-fcLen check: OK" -ForegroundColor Green
}

# ── Content Status Distribution ──────────────────────────────────────────────

Write-Host ""
Write-Host "--- Content Status Distribution ---"
Write-Host "  (full_article=确认全文  extracted_article=较长正文  partial=部分  rss_summary=摘要)" -ForegroundColor DarkGray
foreach ($k in ($csDistrib.Keys | Sort-Object)) {
  $cnt   = $csDistrib[$k]
  $color = if ($k -eq "full_article") { "Green" } `
           elseif ($k -eq "extracted_article") { "Cyan" } `
           elseif ($k -eq "partial") { "Yellow" } `
           elseif ($k -eq "unknown" -or $k -eq "missing") { "Red" } `
           else { "Gray" }
  Write-Host ("  {0}: {1}" -f $k, $cnt) -ForegroundColor $color
}
if ($csDistrib.Count -eq 1 -and $csDistrib.ContainsKey("partial") -and $final.Count -gt 0) {
  Write-Host "  [WARN] All items still 'partial' — check inferContentStatus raw length fix" -ForegroundColor Yellow
}

Write-Host "--- Content Source Distribution ---"
Write-Host "  (rss_content=RSS全文  fetched_article=抓取正文  rss_summary=RSS摘要)" -ForegroundColor DarkGray
if ($srcDistrib.Count -gt 0) {
  foreach ($k in ($srcDistrib.Keys | Sort-Object)) {
    $color = if ($k -eq "rss_content" -or $k -eq "fetched_article") { "Cyan" } else { "Gray" }
    Write-Host ("  {0}: {1}" -f $k, $srcDistrib[$k]) -ForegroundColor $color
  }
} else {
  Write-Host "  (none)" -ForegroundColor Gray
}

if ($csInconsistencies -gt 0) {
  Write-Host ("Model vs system contentStatus overrides: {0}" -f $csInconsistencies) -ForegroundColor Yellow
}

# ── Average Input Lengths ────────────────────────────────────────────────────

Write-Host "--- Average Input Lengths ---"
if ($titleLens.Count -gt 0) {
  $avgT  = [Math]::Round(($titleLens       | Measure-Object -Average).Average, 1)
  $avgS  = [Math]::Round(($summaryLens     | Measure-Object -Average).Average, 1)
  $avgFC = [Math]::Round(($fullContentLens | Measure-Object -Average).Average, 1)
  Write-Host ("  avg title:       {0} chars" -f $avgT)
  Write-Host ("  avg summary:     {0} chars  (RSS summary capped at ~300)" -f $avgS)
  Write-Host ("  avg fullContent: {0} chars  (target: >2000 = partial, >5000 = good)" -f $avgFC)

  # Warn if all items have same fcLen (typical of the 803-bug era)
  $allSameFcLen = ($fullContentLens | Select-Object -Unique).Count -eq 1 -and $fullContentLens.Count -gt 1
  if ($allSameFcLen) {
    Write-Host ("  [WARN] All items have IDENTICAL inputFullContentLength={0} — possible diagnostic cap bug" -f $fullContentLens[0]) -ForegroundColor Yellow
  }

  if ($avgFC -lt 50) {
    Write-Host ("  [WARN] avg fullContent very short ({0} chars). No full text — LLM only saw RSS summary." -f $avgFC) -ForegroundColor Yellow
  } elseif ($avgFC -lt 500) {
    Write-Host ("  [WARN] avg fullContent {0} chars — partial content, check article fetch / RSS content:encoded" -f $avgFC) -ForegroundColor Yellow
  } elseif ($avgFC -lt 2000) {
    Write-Host ("  [INFO] avg fullContent {0} chars — partial, consider enabling ARTICLE_FETCH_ENABLED" -f $avgFC) -ForegroundColor Gray
  } else {
    Write-Host ("  [OK]   avg fullContent {0} chars — good content depth" -f $avgFC) -ForegroundColor Green
  }
} else {
  Write-Host "  [WARN] inputDiagnostics not present on any item -- run a fresh snapshot" -ForegroundColor Yellow
}

# ── fallbackReason distribution ────────────────────────────────────────────────
Write-Host ""
Write-Host "--- fallbackReason Distribution ---"
$fallbackReasons = @{}
$invalidJsonCount = 0
for ($i = 0; $i -lt $final.Count; $i++) {
  $dd = $final[$i].deepDive
  if ($null -eq $dd) { continue }
  $status = [string]$dd.status
  if ($status -eq "fallback") {
    $fr = if ($dd.PSObject.Properties.Name -contains "fallbackReason") { [string]$dd.fallbackReason } else { "" }
    if ([string]::IsNullOrWhiteSpace($fr)) { $fr = "(no reason)" }
    # Categorize
    $cat = if ($fr -match "not valid JSON|invalid_json") { "invalid_json" }
           elseif ($fr -match "retry_failed") { "retry_failed" }
           elseif ($fr -match "quality") { "quality_issue" }
           elseif ($fr -match "parse|required_field") { "parse_error" }
           elseif ($fr -match "LLM disabled|missing API") { "llm_disabled" }
           else { "other" }
    if ($cat -eq "invalid_json") { $invalidJsonCount++ }
    if (-not $fallbackReasons.ContainsKey($cat)) { $fallbackReasons[$cat] = 0 }
    $fallbackReasons[$cat]++
  }
}
if ($fallbackReasons.Count -eq 0) {
  Write-Host "  (no fallback items)" -ForegroundColor Gray
} else {
  foreach ($k in ($fallbackReasons.Keys | Sort-Object)) {
    $color = if ($k -eq "invalid_json" -or $k -eq "retry_failed") { "Yellow" } else { "Gray" }
    Write-Host ("  {0}: {1}" -f $k, $fallbackReasons[$k]) -ForegroundColor $color
  }
  if ($invalidJsonCount -gt 0) {
    Write-Host ("  [WARN] invalid_json fallbacks: {0} (model outputting non-JSON)" -f $invalidJsonCount) -ForegroundColor Yellow
  } else {
    Write-Host "  invalid_json fallbacks: 0  [OK]" -ForegroundColor Green
  }
}

# ── Model Verification ───────────────────────────────────────────────────────

Write-Host ""
Write-Host "--- Model Verification ---"
if ($res.deepDiveStats -and -not [string]::IsNullOrWhiteSpace([string]$res.deepDiveStats.model)) {
  $usedModel = [string]$res.deepDiveStats.model
  Write-Host ("  used model: {0}" -f $usedModel)
  if ($Mode -eq "llm" -and $usedModel -eq $proModel) {
    Write-Host "  LLM_PRO_MODEL match: YES" -ForegroundColor Green
  } elseif ($Mode -eq "llm") {
    Write-Host ("  LLM_PRO_MODEL: expected={0} actual={1}" -f $proModel, $usedModel) -ForegroundColor Yellow
  }
}

# ── Related Signals per-item check ──────────────────────────────────────────

Write-Host ""
Write-Host "--- Related Signals ---"
$rsWithSig = 0; $rsTotal = 0; $rsBad = 0
for ($i = 0; $i -lt $final.Count; $i++) {
  $it = $final[$i]
  if (-not ($it.PSObject.Properties.Name -contains "relatedSignals")) { continue }
  $sigs = @($it.relatedSignals)
  if ($sigs.Count -eq 0) { continue }
  $rsWithSig++
  $rsTotal += $sigs.Count
  Write-Host ("  final[{0}] relatedSignals: {1}" -f $i, $sigs.Count) -ForegroundColor Cyan

  # FAIL checks
  if ($sigs.Count -gt 5) {
    Write-Host ("[FAIL] final[{0}] relatedSignals.Count={1} > 5" -f $i, $sigs.Count) -ForegroundColor Red
    $rsBad++
  }
  foreach ($sig in $sigs) {
    if (-not [string]::IsNullOrWhiteSpace([string]$sig.url) -and [string]$sig.url -eq [string]$it.originalUrl) {
      Write-Host ("[FAIL] final[{0}] relatedSignal url matches self" -f $i) -ForegroundColor Red
      $rsBad++
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$sig.id) -and [string]$sig.id -eq [string]$it.id) {
      Write-Host ("[FAIL] final[{0}] relatedSignal id matches self" -f $i) -ForegroundColor Red
      $rsBad++
    }
  }
}

$avgRS2 = if ($final.Count -gt 0) { [Math]::Round($rsTotal / $final.Count, 1) } else { 0 }
Write-Host ("  itemsWithRelatedSignals: {0}/{1}" -f $rsWithSig, $final.Count)
Write-Host ("  avgRelatedSignals:       {0}" -f $avgRS2)
if ($rsBad -eq 0 -and $final.Count -gt 0) {
  Write-Host "  relatedSignals integrity: OK" -ForegroundColor Green
}
if ($rsWithSig -eq 0 -and $final.Count -gt 0) {
  Write-Host "  [WARN] No items have relatedSignals — run -Refresh to compute" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
