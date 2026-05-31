param(
  [string]$Base = "http://localhost:3000",
  [string]$Mode = "llm"
)

$ErrorActionPreference = "Stop"

$enabledRaw = $env:LLM_DEEPDIVE_ENABLED
if ($null -eq $enabledRaw) { $enabledRaw = "" }
$enabled = ($enabledRaw.ToLower() -eq "true")
$keySet = -not [string]::IsNullOrWhiteSpace($env:LLM_API_KEY)
$defaultModel = if ([string]::IsNullOrWhiteSpace($env:LLM_MODEL)) { "deepseek-reasoner" } else { [string]$env:LLM_MODEL }
$fastModel = if ([string]::IsNullOrWhiteSpace($env:LLM_FAST_MODEL)) { $defaultModel } else { [string]$env:LLM_FAST_MODEL }
$proModel = if ([string]::IsNullOrWhiteSpace($env:LLM_PRO_MODEL)) { $defaultModel } else { [string]$env:LLM_PRO_MODEL }
$expectGenerated = $enabled -and $keySet -and ($Mode -eq "llm")

function Test-DeepDiveShape($obj, [string]$prefix) {
  if ($null -eq $obj) {
    Write-Host "$prefix deepDive is null" -ForegroundColor Red
    return $false
  }

  $requiredStringFields = @(
    "oneSentence",
    "whatHappened",
    "whyItMatters",
    "userValue",
    "uncertainty"
  )

  foreach ($k in $requiredStringFields) {
    if (-not ($obj.PSObject.Properties.Name -contains $k)) {
      Write-Host "$prefix missing field: $k" -ForegroundColor Red
      return $false
    }
    $v = [string]$obj.$k
    if ([string]::IsNullOrWhiteSpace($v)) {
      Write-Host "$prefix empty field: $k" -ForegroundColor Red
      return $false
    }
  }

  if (-not ($obj.PSObject.Properties.Name -contains "followUp")) {
    Write-Host "$prefix missing field: followUp" -ForegroundColor Red
    return $false
  }

  $followUpCount = 0
  if ($obj.followUp) {
    $followUpCount = @($obj.followUp).Count
  }
  if ($followUpCount -lt 1) {
    Write-Host "$prefix followUp is empty" -ForegroundColor Red
    return $false
  }

  return $true
}

Write-Host ""
Write-Host "=== Test LLM Deep Dive ===" -ForegroundColor Cyan
Write-Host "Base: $Base"
Write-Host "Mode: $Mode"
Write-Host "enabled=$enabled keySet=$keySet fastModel=$fastModel proModel=$proModel"
Write-Host "expectGenerated=$expectGenerated"
Write-Host ""

$url = "$Base/api/recommendations/refresh?deepDive=$Mode"
Write-Host "POST $url"

$res = Invoke-RestMethod -Method Post -Uri $url -TimeoutSec 180

Write-Host ""
if (-not $res.ok) {
  Write-Host "refresh failed: $($res.error)" -ForegroundColor Red
  exit 1
}

Write-Host "runStatus: $($res.runStatus)"
if ($res.deepDiveStats) {
  Write-Host ("deepDiveStats: total={0}, generated={1}, fallback={2}, failed={3}, model={4}, provider={5}, mode={6}" -f `
    $res.deepDiveStats.total, $res.deepDiveStats.generated, $res.deepDiveStats.fallback, $res.deepDiveStats.failed, $res.deepDiveStats.model, $res.deepDiveStats.provider, $res.deepDiveStats.mode)
  Write-Host "actualDeepDiveModel: $($res.deepDiveStats.model)"
  Write-Host "actualProvider:      $($res.deepDiveStats.provider)"

  if ($expectGenerated -and [int]$res.deepDiveStats.generated -le 0) {
    Write-Host "FAIL: expected generated > 0, but got $($res.deepDiveStats.generated)" -ForegroundColor Red
    exit 1
  }
}

$items = @()
if ($res.items) { $items = @($res.items) }
$final = @($items | Where-Object { $_.recommendationTier -in @("must_read", "high_value") })

Write-Host "finalItems (must_read/high_value): $($final.Count)"

# --- Content status distribution ---
$contentStatusCounts = @{}
$titleLengths = @()
$summaryLengths = @()
$fullContentLengths = @()

$badShape = $false
for ($i = 0; $i -lt $final.Count; $i++) {
  $it = $final[$i]
  $dd = $it.deepDive
  $model = [string]$dd.model
  $provider = [string]$dd.provider
  $status = [string]$dd.status
  $contentStatus = if ($dd.PSObject.Properties.Name -contains "contentStatus") { [string]$dd.contentStatus } else { "unknown" }
  $oneSentenceLen = ([string]$dd.oneSentence).Length
  $followUpCount = @($dd.followUp).Count

  # Collect contentStatus distribution
  if (-not $contentStatusCounts.ContainsKey($contentStatus)) { $contentStatusCounts[$contentStatus] = 0 }
  $contentStatusCounts[$contentStatus]++

  # Collect input diagnostics
  if ($dd.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $dd.inputDiagnostics) {
    $diag = $dd.inputDiagnostics
    if ($diag.PSObject.Properties.Name -contains "inputTitleLength") {
      $titleLengths += [int]$diag.inputTitleLength
    }
    if ($diag.PSObject.Properties.Name -contains "inputSummaryLength") {
      $summaryLengths += [int]$diag.inputSummaryLength
    }
    if ($diag.PSObject.Properties.Name -contains "inputFullContentLength") {
      $fullContentLengths += [int]$diag.inputFullContentLength
    }
    $diagLine = "contentSource={0} summaryLen={1} fullContentLen={2}" -f `
      $diag.contentSource, $diag.inputSummaryLength, $diag.inputFullContentLength
  } else {
    $diagLine = "inputDiagnostics=missing"
  }

  Write-Host ("  [{0}] status={1} | contentStatus={2} | model={3} | provider={4} | oneSentenceLen={5} | followUpCount={6}" -f `
    $i, $status, $contentStatus, $model, $provider, $oneSentenceLen, $followUpCount)
  Write-Host ("       $diagLine")

  if (-not (Test-DeepDiveShape $dd "final[$i]")) {
    $badShape = $true
  }
}

if ($badShape) {
  Write-Host "deepDive shape check FAILED" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "--- Content Status Distribution ---"
foreach ($k in $contentStatusCounts.Keys) {
  Write-Host ("  {0}: {1}" -f $k, $contentStatusCounts[$k])
}

if ($titleLengths.Count -gt 0) {
  $avgTitle = [Math]::Round(($titleLengths | Measure-Object -Average).Average, 1)
  $avgSummary = if ($summaryLengths.Count -gt 0) { [Math]::Round(($summaryLengths | Measure-Object -Average).Average, 1) } else { "N/A" }
  $avgFullContent = if ($fullContentLengths.Count -gt 0) { [Math]::Round(($fullContentLengths | Measure-Object -Average).Average, 1) } else { "N/A" }
  Write-Host "--- Average Input Lengths ---"
  Write-Host "  avg title:       $avgTitle chars"
  Write-Host "  avg summary:     $avgSummary chars"
  Write-Host "  avg fullContent: $avgFullContent chars"
  if ($fullContentLengths.Count -gt 0) {
    $avgFC = ($fullContentLengths | Measure-Object -Average).Average
    if ($avgFC -lt 50) {
      Write-Host "  WARN: average fullContent very short ($avgFC chars) — model likely only saw RSS summary" -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "  WARN: inputDiagnostics not present on any item — run a fresh snapshot" -ForegroundColor Yellow
}

# --- Pro model verification ---
Write-Host ""
Write-Host "--- Model Verification ---"
if ($res.deepDiveStats -and -not [string]::IsNullOrWhiteSpace([string]$res.deepDiveStats.model)) {
  $usedModel = [string]$res.deepDiveStats.model
  Write-Host "  used model: $usedModel"
  if ($Mode -eq "llm" -and $usedModel -eq $proModel) {
    Write-Host "  LLM_PRO_MODEL match: YES" -ForegroundColor Green
  } elseif ($Mode -eq "llm") {
    Write-Host "  LLM_PRO_MODEL expected=$proModel actual=$usedModel" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
