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

Write-Host ""
Write-Host "=== Test LLM Deep Dive ===" -ForegroundColor Cyan
Write-Host "Base: $Base"
Write-Host "Mode: $Mode"
Write-Host "enabled=$enabled keySet=$keySet fastModel=$fastModel proModel=$proModel"
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
  Write-Host "actualDeepDiveModel: $($res.deepDiveStats.model)"
}
if ($res.deepDiveStats) {
  Write-Host ("deepDiveStats: total={0}, generated={1}, fallback={2}, failed={3}, model={4}, provider={5}, mode={6}" -f `
    $res.deepDiveStats.total, $res.deepDiveStats.generated, $res.deepDiveStats.fallback, $res.deepDiveStats.failed, $res.deepDiveStats.model, $res.deepDiveStats.provider, $res.deepDiveStats.mode)

  if ($expectGenerated -and [int]$res.deepDiveStats.generated -le 0) {
    Write-Host "expected generated > 0, but got $($res.deepDiveStats.generated)" -ForegroundColor Red
    exit 1
  }
}

$items = @()
if ($res.items) { $items = @($res.items) }
$final = @($items | Where-Object { $_.recommendationTier -in @("must_read", "high_value") })

Write-Host "finalItems: $($final.Count)"
for ($i = 0; $i -lt [Math]::Min($final.Count, 5); $i++) {
  $it = $final[$i]
  $model = [string]$it.deepDive.model
  $status = [string]$it.deepDive.status
  $summary = [string]$it.deepDive.summary
  $short = if ($summary.Length -gt 80) { $summary.Substring(0, 80) + "..." } else { $summary }
  Write-Host ("  - [{0}] {1} | status={2} | model={3} | {4}" -f $i, [string]$it.title, $status, $model, $short)
}

Write-Host ""
Write-Host "DONE" -ForegroundColor Green
