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
function Info([string]$m) { Write-Host "[INFO] $m" -ForegroundColor Gray }

function Looks-Garbled([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  return [regex]::IsMatch($text, "\uFFFD|\u951F")
}

function Test-DeepDiveObject($obj, [string]$prefix) {
  if ($null -eq $obj) { Fail "$prefix deepDive is null"; return $false }

  $requiredText = @(
    "oneSentence",
    "whatHappened",
    "whyItMatters",
    "userValue",
    "uncertainty"
  )

  $ok = $true
  foreach ($k in $requiredText) {
    if (-not ($obj.PSObject.Properties.Name -contains $k)) {
      Fail "$prefix missing field: $k"
      $ok = $false
      continue
    }
    $v = [string]$obj.$k
    if ([string]::IsNullOrWhiteSpace($v)) {
      Fail "$prefix empty field: $k"
      $ok = $false
    }
    if (Looks-Garbled $v) {
      Fail "$prefix garbled field: $k"
      $ok = $false
    }
  }

  if (-not ($obj.PSObject.Properties.Name -contains "followUp")) {
    Fail "$prefix missing field: followUp"
    $ok = $false
  } else {
    $followCount = @($obj.followUp).Count
    if ($followCount -lt 1) {
      Fail "$prefix followUp empty"
      $ok = $false
    }
  }

  if (-not ($obj.PSObject.Properties.Name -contains "provider")) {
    Fail "$prefix missing field: provider"
    $ok = $false
  }

  return $ok
}

function Is-FinalTier([string]$tier) {
  return $tier -eq "must_read" -or $tier -eq "high_value"
}

$llmEnabledRaw = $env:LLM_DEEPDIVE_ENABLED
if ($null -eq $llmEnabledRaw) { $llmEnabledRaw = "" }
$llmEnabled = ($llmEnabledRaw.ToLower() -eq "true")
$llmKeySet = -not [string]::IsNullOrWhiteSpace($env:LLM_API_KEY)
$expectLlm = $llmEnabled -and $llmKeySet
$defaultModel = if ([string]::IsNullOrWhiteSpace($env:LLM_MODEL)) { "deepseek-reasoner" } else { [string]$env:LLM_MODEL }
$fastModel = if ([string]::IsNullOrWhiteSpace($env:LLM_FAST_MODEL)) { $defaultModel } else { [string]$env:LLM_FAST_MODEL }
$proModel = if ([string]::IsNullOrWhiteSpace($env:LLM_PRO_MODEL)) { $defaultModel } else { [string]$env:LLM_PRO_MODEL }

Write-Host ""
Write-Host "=== Verify Recommendation Deep Dives (LLM v1) ===" -ForegroundColor Cyan
Write-Host "Base: $Base"
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "enabled=$llmEnabled keySet=$llmKeySet fastModel=$fastModel proModel=$proModel"
Write-Host "LLM expected: $expectLlm"
Write-Host ""

$refresh = $null
if ($SkipRefresh) {
  Warn "0) Refresh skipped by -SkipRefresh"
} else {
  $refreshUrl = "$Base/api/recommendations/refresh?deepDive=llm"
  Write-Host "0) Trigger refresh: $refreshUrl"
  try {
    $refresh = Invoke-RestMethod -Method Post -Uri $refreshUrl -TimeoutSec 180
    if ($refresh.ok) { Ok "refresh ok=true" } else { Fail "refresh ok=false" }
    if ($refresh.deepDiveStats) {
      Info ("deepDiveStats: total={0} generated={1} fallback={2} failed={3} model={4} provider={5}" -f `
        $refresh.deepDiveStats.total, $refresh.deepDiveStats.generated, $refresh.deepDiveStats.fallback, $refresh.deepDiveStats.failed, $refresh.deepDiveStats.model, $refresh.deepDiveStats.provider)
      Info "actualDeepDiveModel: $($refresh.deepDiveStats.model)"
      Info "actualProvider: $($refresh.deepDiveStats.provider)"
    } else {
      Warn "refresh response missing deepDiveStats"
    }
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

    $items = @()
    if ($rec.items) { $items = @($rec.items) }
    $finalItems = @($items | Where-Object { Is-FinalTier ([string]$_.recommendationTier) })
    Ok "final recommendation items count=$($finalItems.Count)"

    $llmModelCount = 0
    $fallbackCount = 0
    $fallbackWithReason = 0
    $observedLlmPath = $false

    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $it = $finalItems[$i]
      $prefix = "final[$i] tier=$($it.recommendationTier)"
      $okFields = Test-DeepDiveObject $it.deepDive $prefix
      if (-not $okFields) { continue }

      $model = [string]$it.deepDive.model
      $provider = [string]$it.deepDive.provider
      $status = [string]$it.deepDive.status
      $oneSentenceLen = ([string]$it.deepDive.oneSentence).Length
      $followCount = @($it.deepDive.followUp).Count
      Write-Host ("  - [{0}] status={1} | model={2} | provider={3} | oneSentenceLen={4} | followUpCount={5}" -f `
        $i, $status, $model, $provider, $oneSentenceLen, $followCount)

      if ($model -ne "deterministic-v1" -and $status -eq "generated") {
        $llmModelCount++
        $observedLlmPath = $true
      }
      if ($status -eq "fallback") {
        $fallbackCount++
        if (-not [string]::IsNullOrWhiteSpace([string]$it.deepDive.fallbackReason)) {
          $fallbackWithReason++
        }
      }
    }

    if ($expectLlm) {
      if ($refresh.deepDiveStats -and [int]$refresh.deepDiveStats.generated -le 0) {
        Fail "LLM expected but refresh.deepDiveStats.generated <= 0"
      }
      if ($finalItems.Count -gt 0 -and $llmModelCount -lt 1) {
        Fail "LLM expected but no final item used non-deterministic model"
      } else {
        Ok "LLM path verified (non-deterministic generated items: $llmModelCount)"
      }
    } else {
      if ($fallbackCount -eq 0) {
        Info "no fallback items in final recommendations."
      } elseif ($fallbackWithReason -eq $fallbackCount) {
        Ok "fallback path verified with explicit fallbackReason"
      } else {
        Warn "fallbackReason not present on all fallback items (non-blocking)"
      }
      if ($observedLlmPath) {
        Info "runtime used LLM path (service env differs from current shell env)."
      }
    }
  }
} catch {
  Fail "recommendations request failed: $($_.Exception.Message)"
}
Write-Host ""

$snapUrl = "$Base/api/recommendations/snapshots?limit=$SnapshotLimit&includeItems=true&itemsLimit=20"
Write-Host "2) Snapshots with items: $snapUrl"
try {
  $snaps = Invoke-RestMethod -Method Get -Uri $snapUrl -TimeoutSec 30
  if (-not $snaps.ok) {
    Fail "snapshots ok=false"
  } else {
    Ok "snapshots ok=true count=$($snaps.count)"
    if ($snaps.count -gt 0 -and $snaps.snapshots[0].items) {
      $latestItems = @($snaps.snapshots[0].items)
      $latestFinal = @($latestItems | Where-Object { Is-FinalTier ([string]$_.recommendationTier) })
      if ($latestFinal.Count -gt 0) {
        $item = $latestFinal[0]
        $okFields = Test-DeepDiveObject $item.deepDive "latestSnapshot.final[0]"
        if ($okFields) {
          Ok "latest snapshot final item has complete deepDive"
        }
      } else {
        Warn "latest snapshot has no must_read/high_value items"
      }
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
