param(
  [string]$Base = "http://localhost:3000"
)

$ErrorActionPreference = "Continue"
$PackOrigin        = "official-ai-company-pack-v1"
$RequiredCompanies = @("OpenAI", "Anthropic", "Google DeepMind", "Meta", "Mistral", "xAI", "Microsoft", "NVIDIA")

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Verify Official AI Company Sources ===" -ForegroundColor Cyan
Write-Host ("Base: " + $Base)
Write-Host ("Time: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ""

# ── Helper: parse key:value pairs from user_source_note ──────────────────────

function Get-NoteField {
  param([string]$Note, [string]$Key)
  if (-not $Note) { return $null }
  if ($Note -match ("(?:^| \| )" + [regex]::Escape($Key) + ":([^|]+?)(?= \| |\s*$)")) {
    return $Matches[1].Trim()
  }
  return $null
}

# ── GET all sources ───────────────────────────────────────────────────────────

$allSources = @()
try {
  $resp = Invoke-RestMethod -Method Get -Uri ($Base + "/api/sources") -TimeoutSec 20 -ErrorAction Stop
  $allSources = @($resp.sources)
  Write-Host ("[OK] Retrieved " + $allSources.Count + " total sources") -ForegroundColor Green
} catch {
  Write-Host ("[FAIL] Cannot retrieve sources: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
Write-Host ""

# ── Filter pack sources ───────────────────────────────────────────────────────

$packSources = @($allSources | Where-Object {
  $_.userSourceNote -and $_.userSourceNote.Contains($PackOrigin)
})

Write-Host ("Pack sources (" + $PackOrigin + "): " + $packSources.Count)

if ($packSources.Count -eq 0) {
  Write-Host "[WARN] No pack sources found." -ForegroundColor Yellow
  Write-Host "       Run: powershell -ExecutionPolicy Bypass -File scripts\import-official-ai-company-sources.ps1 -Apply" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "RESULT: WARN" -ForegroundColor Yellow
  exit 0
}
Write-Host ""

# ── Index by company ──────────────────────────────────────────────────────────

$byCompany = @{}
foreach ($s in $packSources) {
  $company  = Get-NoteField $s.userSourceNote "company"
  $role     = Get-NoteField $s.userSourceNote "role"
  $official = Get-NoteField $s.userSourceNote "official"
  if (-not $company) { $company = "unknown" }
  if (-not $role)    { $role    = "unknown" }

  if (-not $byCompany.ContainsKey($company)) {
    $byCompany[$company] = @()
  }
  $byCompany[$company] += [PSCustomObject]@{
    Name       = $s.name
    Role       = $role
    Official   = $official
    DbOfficial = $s.isOfficial
    Tier       = $s.tier
    Priority   = $s.userSourcePriority
    Url        = $s.url
  }
}

# ── Per-company output ────────────────────────────────────────────────────────

Write-Host "-- Sources by Company ---------------------------------------------------" -ForegroundColor Cyan
$sortedCompanies = $byCompany.Keys | Sort-Object
foreach ($company in $sortedCompanies) {
  Write-Host ($company + ":") -ForegroundColor White
  $entries   = $byCompany[$company]
  $roleCounts = @{}
  foreach ($e in $entries) {
    $r = $e.Role
    if (-not $roleCounts.ContainsKey($r)) { $roleCounts[$r] = 0 }
    $roleCounts[$r]++
  }
  foreach ($role in ($roleCounts.Keys | Sort-Object)) {
    Write-Host ("  " + $role + ": " + $roleCounts[$role]) -ForegroundColor Gray
  }
}
Write-Host ""

# ── Check 1: required companies have >= 1 official source ────────────────────

$warnings = @()
$failures = @()

Write-Host "-- Check 1: Required companies have >= 1 official source ----------------" -ForegroundColor Cyan
foreach ($company in $RequiredCompanies) {
  $entries = @()
  if ($byCompany.ContainsKey($company)) {
    $entries = @($byCompany[$company])
  }
  # Google DeepMind may import as "Google DeepMind" or be covered by "Google"
  if ($company -eq "Google DeepMind" -and $entries.Count -eq 0 -and $byCompany.ContainsKey("Google")) {
    $entries = @($byCompany["Google"])
  }

  $officialEntries = @($entries | Where-Object { $_.Official -eq "true" })
  if ($officialEntries.Count -ge 1) {
    Write-Host ("[OK]   " + $company + ": " + $officialEntries.Count + " official source(s)") -ForegroundColor Green
  } elseif ($entries.Count -gt 0) {
    Write-Host ("[WARN] " + $company + ": " + $entries.Count + " source(s) found but none official") -ForegroundColor Yellow
    $warnings += ($company + " has sources but no official ones")
  } else {
    Write-Host ("[FAIL] " + $company + ": no sources in pack") -ForegroundColor Red
    $failures += ($company + " has no sources in pack")
  }
}
Write-Host ""

# ── Check 2: sourceRole present in user_source_note ──────────────────────────

Write-Host "-- Check 2: sourceRole present in user_source_note ----------------------" -ForegroundColor Cyan
$noRole = @($packSources | Where-Object {
  -not ($_.userSourceNote -match "role:[a-z_]+")
})
if ($noRole.Count -eq 0) {
  Write-Host ("[OK]   All " + $packSources.Count + " pack sources have role in note") -ForegroundColor Green
} else {
  $noRoleNames = ($noRole | Select-Object -First 5 | ForEach-Object { $_.name }) -join ", "
  Write-Host ("[FAIL] " + $noRole.Count + " source(s) missing role in note: " + $noRoleNames) -ForegroundColor Red
  $failures += ($noRole.Count.ToString() + " sources missing role in note")
}
Write-Host ""

# ── Check 3: key_person must NOT be official ──────────────────────────────────

Write-Host "-- Check 3: key_person sources are not official -------------------------" -ForegroundColor Cyan
$badPersons = @($packSources | Where-Object {
  $_.userSourceNote -match "role:key_person" -and (
    $_.isOfficial -eq $true -or
    ($_.userSourceNote -match "official:true")
  )
})
if ($badPersons.Count -eq 0) {
  Write-Host "[OK]   No key_person sources marked as official" -ForegroundColor Green
} else {
  $badNames = ($badPersons | ForEach-Object { $_.name }) -join ", "
  Write-Host ("[FAIL] " + $badPersons.Count + " key_person source(s) incorrectly marked official: " + $badNames) -ForegroundColor Red
  $failures += ($badPersons.Count.ToString() + " key_person sources are official (must be false)")
}
Write-Host ""

# ── Check 4: official sources have higher priority than key_person ────────────

Write-Host "-- Check 4: official priority higher than key_person --------------------" -ForegroundColor Cyan
$priorityOk = $true
foreach ($company in $byCompany.Keys) {
  $entries   = @($byCompany[$company])
  $officials = @($entries | Where-Object { $_.Role -ne "key_person" -and $_.Official -eq "true" })
  $persons   = @($entries | Where-Object { $_.Role -eq "key_person" })

  if ($officials.Count -gt 0 -and $persons.Count -gt 0) {
    $minOffPri = ($officials | Measure-Object -Property Priority -Minimum).Minimum
    $minPerPri = ($persons   | Measure-Object -Property Priority -Minimum).Minimum
    if ($null -ne $minOffPri -and $null -ne $minPerPri) {
      if ($minOffPri -lt $minPerPri) {
        Write-Host ("[OK]   " + $company + ": official.pri=" + $minOffPri + " < person.pri=" + $minPerPri) -ForegroundColor Green
      } else {
        Write-Host ("[WARN] " + $company + ": official.pri=" + $minOffPri + " >= person.pri=" + $minPerPri) -ForegroundColor Yellow
        $warnings += ($company + " official priority not strictly higher than key_person")
        $priorityOk = $false
      }
    }
  }
}
if ($priorityOk) {
  Write-Host "[OK]   All companies: official priority < key_person priority" -ForegroundColor Green
}
Write-Host ""

# ── Full sources table ────────────────────────────────────────────────────────

Write-Host "-- Full Pack Sources Table ----------------------------------------------" -ForegroundColor Cyan
$tableRows = @()
foreach ($s in $packSources) {
  $company  = Get-NoteField $s.userSourceNote "company"
  $role     = Get-NoteField $s.userSourceNote "role"
  $official = Get-NoteField $s.userSourceNote "official"
  $nameTrunc = if ($s.name.Length -gt 28) { $s.name.Substring(0,25) + "..." } else { $s.name }
  $tableRows += [PSCustomObject]@{
    Company  = $company
    Name     = $nameTrunc
    Role     = $role
    Tier     = $s.tier
    Official = $official
    Priority = $s.userSourcePriority
    Platform = $s.platform
  }
}
$tableRows | Sort-Object Company, Role | Format-Table -AutoSize

# ── Result ────────────────────────────────────────────────────────────────────

Write-Host "=== RESULT ===" -ForegroundColor Cyan
if ($failures.Count -gt 0) {
  Write-Host ("RESULT: FAIL (" + $failures.Count + " failure(s), " + $warnings.Count + " warning(s))") -ForegroundColor Red
  $failures | ForEach-Object { Write-Host ("  FAIL: " + $_) -ForegroundColor Red }
  if ($warnings.Count -gt 0) {
    $warnings | ForEach-Object { Write-Host ("  WARN: " + $_) -ForegroundColor Yellow }
  }
  exit 1
} elseif ($warnings.Count -gt 0) {
  Write-Host ("RESULT: WARN (" + $warnings.Count + " warning(s), all hard checks passed)") -ForegroundColor Yellow
  $warnings | ForEach-Object { Write-Host ("  WARN: " + $_) -ForegroundColor Yellow }
  exit 0
} else {
  Write-Host ("RESULT: PASS (" + $packSources.Count + " pack sources verified, all checks passed)") -ForegroundColor Green
  exit 0
}
