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
  return [regex]::IsMatch($text, "�|锟")
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

  if (-not ($obj.PSObject.Properties.Name -contains "contentStatus")) {
    Warn "$prefix missing field: contentStatus (older snapshot)"
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
Write-Host "=== Verify Recommendation Deep Dives (LLM v2) ===" -ForegroundColor Cyan
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
      Info "actualProvider:      $($refresh.deepDiveStats.provider)"
      # Verify LLM_PRO_MODEL actually used
      if ($expectLlm -and -not [string]::IsNullOrWhiteSpace($proModel)) {
        $usedModel = [string]$refresh.deepDiveStats.model
        if ($usedModel -eq $proModel) {
          Ok "LLM_PRO_MODEL verified: $usedModel"
        } else {
          Warn "LLM_PRO_MODEL expected=$proModel but used=$usedModel"
        }
      }
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
    $observeItems = @($items | Where-Object { ([string]$_.recommendationTier) -eq "observe" })
    $archiveItems = @($items | Where-Object { ([string]$_.recommendationTier) -eq "archive" })

    Ok "final recommendation items (must_read/high_value): $($finalItems.Count)"
    Info "observe items: $($observeItems.Count)  archive items: $($archiveItems.Count)"

    # FAIL: must_read/high_value must all have deepDive
    $missingDeepDive = @($finalItems | Where-Object { $null -eq $_.deepDive })
    if ($missingDeepDive.Count -gt 0) {
      Fail "must_read/high_value items missing deepDive: $($missingDeepDive.Count)"
    } else {
      Ok "all final items have deepDive"
    }

    # FAIL: observe/archive should NOT have non-skipped deepDive with station content
    $observeWithFullDive = @($observeItems | Where-Object {
      $null -ne $_.deepDive -and ([string]$_.deepDive.status) -ne "skipped"
    })
    if ($observeWithFullDive.Count -gt 0) {
      Warn "observe items with non-skipped deepDive: $($observeWithFullDive.Count) (check pipeline config)"
    }

    $llmModelCount = 0
    $fallbackCount = 0
    $fallbackWithReason = 0
    $observedLlmPath = $false
    $contentStatusCounts = @{}
    $titleLengths = @()
    $summaryLengths = @()
    $fullContentLengths = @()
    $summaryOnlyCount = 0
    $diagMissingCount = 0

    for ($i = 0; $i -lt $finalItems.Count; $i++) {
      $it = $finalItems[$i]
      $prefix = "final[$i] tier=$($it.recommendationTier)"
      $okFields = Test-DeepDiveObject $it.deepDive $prefix
      if (-not $okFields) { continue }

      $model = [string]$it.deepDive.model
      $provider = [string]$it.deepDive.provider
      $status = [string]$it.deepDive.status
      $contentStatus = if ($it.deepDive.PSObject.Properties.Name -contains "contentStatus") { [string]$it.deepDive.contentStatus } else { "unknown" }
      $oneSentenceLen = ([string]$it.deepDive.oneSentence).Length
      $followCount = @($it.deepDive.followUp).Count

      Write-Host ("  [{0}] status={1} | contentStatus={2} | model={3} | provider={4} | oneSentenceLen={5} | followUpCount={6}" -f `
        $i, $status, $contentStatus, $model, $provider, $oneSentenceLen, $followCount)

      # Track contentStatus distribution
      if (-not $contentStatusCounts.ContainsKey($contentStatus)) { $contentStatusCounts[$contentStatus] = 0 }
      $contentStatusCounts[$contentStatus]++
      if ($contentStatus -eq "rss_summary" -or $contentStatus -eq "title_only") { $summaryOnlyCount++ }

      # Track input diagnostics
      if ($it.deepDive.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $it.deepDive.inputDiagnostics) {
        $diag = $it.deepDive.inputDiagnostics
        if ($diag.PSObject.Properties.Name -contains "inputTitleLength") { $titleLengths += [int]$diag.inputTitleLength }
        if ($diag.PSObject.Properties.Name -contains "inputSummaryLength") { $summaryLengths += [int]$diag.inputSummaryLength }
        if ($diag.PSObject.Properties.Name -contains "inputFullContentLength") { $fullContentLengths += [int]$diag.inputFullContentLength }
        $diagInfo = "  inputDiag: contentSource={0} summaryLen={1} fullContentLen={2}" -f `
          $diag.contentSource, $diag.inputSummaryLength, $diag.inputFullContentLength
        Write-Host $diagInfo -ForegroundColor DarkGray
      } else {
        $diagMissingCount++
        Write-Host "  inputDiagnostics: missing (pre-v2 snapshot)" -ForegroundColor DarkGray
      }

      # Check fallback reason
      if ($status -eq "fallback") {
        $fallbackCount++
        $fr = [string]$it.deepDive.fallbackReason
        if (-not [string]::IsNullOrWhiteSpace($fr)) {
          $fallbackWithReason++
          Info "  fallbackReason: $($fr.Substring(0, [Math]::Min(80, $fr.Length)))"
        } else {
          Warn "$prefix fallbackReason missing"
        }
      }

      if ($model -ne "deterministic-v1" -and $status -eq "generated") {
        $llmModelCount++
        $observedLlmPath = $true
      }
    }

    # Print contentStatus distribution
    Write-Host ""
    Write-Host "  --- contentStatus distribution ---"
    foreach ($k in $contentStatusCounts.Keys) {
      $cnt = $contentStatusCounts[$k]
      $color = if ($k -eq "full_article") { "Green" } elseif ($k -eq "unknown") { "Red" } else { "Yellow" }
      Write-Host ("  {0}: {1}" -f $k, $cnt) -ForegroundColor $color
    }

    # FAIL: contentStatus all unknown
    if ($contentStatusCounts.ContainsKey("unknown") -and $contentStatusCounts["unknown"] -eq $finalItems.Count -and $finalItems.Count -gt 0) {
      Fail "All contentStatus are 'unknown' — inputDiagnostics likely not being populated"
    }

    # Print avg input lengths
    if ($summaryLengths.Count -gt 0) {
      $avgSummary = [Math]::Round(($summaryLengths | Measure-Object -Average).Average, 1)
      $avgTitle = if ($titleLengths.Count -gt 0) { [Math]::Round(($titleLengths | Measure-Object -Average).Average, 1) } else { "N/A" }
      $avgFC = if ($fullContentLengths.Count -gt 0) { [Math]::Round(($fullContentLengths | Measure-Object -Average).Average, 1) } else { "N/A" }
      Write-Host ""
      Write-Host "  --- average input lengths ---"
      Write-Host "  avg title:       $avgTitle chars"
      Write-Host "  avg summary:     $avgSummary chars  (RSS capped at ~300 chars)"
      Write-Host "  avg fullContent: $avgFC chars"
      if ($fullContentLengths.Count -gt 0 -and ($fullContentLengths | Measure-Object -Average).Average -lt 50) {
        Warn "avg fullContent very short ($avgFC chars) — LLM only saw RSS summary"
      }
    } elseif ($diagMissingCount -gt 0) {
      Warn "inputDiagnostics missing on $diagMissingCount items — run a fresh snapshot to get diagnostics"
    }

    if ($summaryOnlyCount -gt 0) {
      Info "summary_only items (rss_summary/title_only): $summaryOnlyCount / $($finalItems.Count)"
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
        Ok "fallback path verified with explicit fallbackReason ($fallbackCount items)"
      } else {
        Warn "fallbackReason missing on $($fallbackCount - $fallbackWithReason) / $fallbackCount fallback items"
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
          # Check contentStatus preserved from snapshot
          $cs = if ($item.deepDive.PSObject.Properties.Name -contains "contentStatus") { [string]$item.deepDive.contentStatus } else { "unknown" }
          Info "snapshot contentStatus: $cs"
          if ($item.deepDive.PSObject.Properties.Name -contains "inputDiagnostics" -and $null -ne $item.deepDive.inputDiagnostics) {
            $diag = $item.deepDive.inputDiagnostics
            Info "snapshot inputDiag: summaryLen=$($diag.inputSummaryLength) fullContentLen=$($diag.inputFullContentLength) contentSource=$($diag.contentSource)"
            Ok "inputDiagnostics preserved in snapshot"
          } else {
            Warn "inputDiagnostics not in snapshot (pre-v2 or not encoded)"
          }
          # Check fallbackReason preserved
          if ($item.deepDive.PSObject.Properties.Name -contains "fallbackReason" -and -not [string]::IsNullOrWhiteSpace([string]$item.deepDive.fallbackReason)) {
            Info "fallbackReason in snapshot: $($item.deepDive.fallbackReason)"
          }
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
