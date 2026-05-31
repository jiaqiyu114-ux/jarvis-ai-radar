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

$url = ("{0}/api/recommendations/refresh?deepDive={1}" -f $Base.TrimEnd('/'), $Mode)
Write-Host ("POST {0}" -f $url)

$res = Invoke-RestMethod -Method Post -Uri $url -TimeoutSec 180

Write-Host ""
if (-not $res.ok) {
  Write-Host ("[FAIL] refresh failed: {0}" -f $res.error) -ForegroundColor Red
  exit 1
}

Write-Host ("runStatus: {0}" -f $res.runStatus)

# ── Article fetch stats (from ingest phase of pipeline, if available) ──────────
if ($res.PSObject.Properties.Name -contains "ingest" -and $null -ne $res.ingest -and
    $res.ingest.PSObject.Properties.Name -contains "articleFetch") {
  $af = $res.ingest.articleFetch
  Write-Host ("articleFetch: enabled={0} attempted={1} succeeded={2} failed={3} skipped={4} avgLen={5}" -f `
    $af.enabled, $af.attempted, $af.succeeded, $af.failed, $af.skipped, $af.averageContentLength)
}

if ($res.deepDiveStats) {
  $ds = $res.deepDiveStats
  Write-Host ("deepDiveStats: total={0}, generated={1}, fallback={2}, failed={3}, model={4}, provider={5}, mode={6}" -f `
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

  # WARN/FAIL: full_article with empty fullContent
  if ($cs -eq "full_article" -and $fcLen -lt 500) {
    Write-Host ("[WARN] item[{0}] contentStatus=full_article but inputFullContentLength={1} -- likely incorrect" -f $i, $fcLen) -ForegroundColor Yellow
  }
  # WARN: fetched_article contentSource but fullContent empty
  if ($cSrc -eq "fetched_article" -and $fcLen -lt 400) {
    Write-Host ("[WARN] item[{0}] contentSource=fetched_article but inputFullContentLength={1}" -f $i, $fcLen) -ForegroundColor Yellow
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
foreach ($k in ($csDistrib.Keys | Sort-Object)) {
  $cnt   = $csDistrib[$k]
  $color = if ($k -eq "full_article") { "Green" } elseif ($k -eq "unknown" -or $k -eq "missing") { "Red" } else { "Yellow" }
  Write-Host ("  {0}: {1}" -f $k, $cnt) -ForegroundColor $color
}

if ($srcDistrib.Count -gt 0) {
  Write-Host "--- Content Source Distribution ---"
  foreach ($k in ($srcDistrib.Keys | Sort-Object)) {
    Write-Host ("  {0}: {1}" -f $k, $srcDistrib[$k])
  }
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
  Write-Host ("  avg summary:     {0} chars" -f $avgS)
  Write-Host ("  avg fullContent: {0} chars" -f $avgFC)
  if ($avgFC -lt 50) {
    Write-Host ("  [WARN] avg fullContent very short ({0} chars). Model likely only saw RSS summary." -f $avgFC) -ForegroundColor Yellow
  }
} else {
  Write-Host "  [WARN] inputDiagnostics not present on any item -- run a fresh snapshot" -ForegroundColor Yellow
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

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
