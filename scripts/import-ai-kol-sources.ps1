param(
  [string]$Base       = "http://localhost:3000",
  [string]$BundleFile = "config\source-bundles\ai-kol-sources-v1.json",
  [switch]$Apply
)

$ErrorActionPreference = "Continue"
$PackName = "ai-kol-sources-v1"
$CategoryName = -join @([char]0x41, [char]0x49, [char]0x6280, [char]0x672F)

function Normalize-Url {
  param([string]$u)
  if (-not $u) { return "" }
  return (($u.Trim().ToLower() -replace "^https?://", "").TrimEnd("/"))
}

function Build-Note {
  param($Src)
  $official = if ($Src.official -eq $true) { "true" } else { "false" }
  $note = "sourcePack:$PackName | company:$($Src.company) | role:$($Src.role) | official:$official | notes:$($Src.notes)"
  if ($note.Length -gt 500) { return $note.Substring(0, 497) + "..." }
  return $note
}

function New-SourceBody {
  param(
    $Src,
    [bool]$IsBlocked,
    [int]$Priority,
    [string]$Note,
    [bool]$IncludeUrl
  )

  $body = @{
    name                 = $Src.name
    platform             = $Src.platform
    source_tier          = $Src.tier
    category             = $CategoryName
    is_official          = ($Src.official -eq $true)
    is_blocked           = $IsBlocked
    is_user_curated      = $true
    user_source_label    = "AI KOL"
    user_source_note     = $Note
    user_source_priority = $Priority
    source_badge_variant = "user_curated"
    data_origin          = "real"
  }

  if ($IncludeUrl) { $body.url = $Src.url }
  return ($body | ConvertTo-Json -Compress)
}

$bundlePath = Join-Path (Get-Location) $BundleFile
if (-not (Test-Path $bundlePath)) {
  $bundlePath = Join-Path $PSScriptRoot ("..\$BundleFile")
}
if (-not (Test-Path $bundlePath)) {
  Write-Host "[FAIL] Bundle not found: $BundleFile" -ForegroundColor Red
  exit 1
}

$parsedSources = [System.IO.File]::ReadAllText($bundlePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$sources = @($parsedSources)
if ($sources.Count -eq 1 -and $sources[0] -is [System.Array]) {
  $sources = @($sources[0] | ForEach-Object { $_ })
}
Write-Host ""
Write-Host "=== J.A.R.V.I.S. Import AI KOL Sources ===" -ForegroundColor Cyan
Write-Host "Base:       $Base"
Write-Host "BundleFile: $BundleFile"
Write-Host "Apply:      $Apply"
if (-not $Apply) { Write-Host "[DRY-RUN] Pass -Apply to write changes." -ForegroundColor Yellow }
Write-Host "Sources:    $($sources.Count)"
Write-Host ""

$resp = $null
try {
  $resp = Invoke-RestMethod -Method Get -Uri ($Base + "/api/sources") -TimeoutSec 15 -ErrorAction Stop
} catch {
  Write-Host "[FAIL] Server not reachable: $($_.Exception.Message)" -ForegroundColor Red
  if ($Apply) { exit 1 }
}

$existingByUrl = @{}
if ($resp -and $resp.sources) {
  foreach ($s in @($resp.sources)) {
    $key = Normalize-Url $s.url
    if ($key) { $existingByUrl[$key] = $s }
  }
}

$inserted = 0
$updated = 0
$failed = 0

foreach ($src in $sources) {
  $key = Normalize-Url $src.url
  $existing = if ($existingByUrl.ContainsKey($key)) { $existingByUrl[$key] } else { $null }
  $priorityMap = @{ 1 = 18; 2 = 14; 3 = 10; 4 = 6 }
  $priority = if ($priorityMap.ContainsKey([int]$src.priority)) { $priorityMap[[int]$src.priority] } else { 10 }
  $isBlocked = -not ($src.enabled -eq $true)
  $note = Build-Note $src

  if (-not $Apply) {
    $action = if ($existing) { "would_update" } else { "would_insert" }
    Write-Host ("  [{0}] {1} | {2} | {3}" -f $action.PadRight(12), $src.tier, $src.role, $src.name) -ForegroundColor Gray
    continue
  }

  try {
    if ($existing) {
      $body = New-SourceBody -Src $src -IsBlocked $isBlocked -Priority $priority -Note $note -IncludeUrl $false
      $out = Invoke-RestMethod -Method Patch -Uri ($Base + "/api/sources/" + $existing.id) -Body $body -ContentType "application/json" -TimeoutSec 15 -ErrorAction Stop
      if ($out.ok) { $updated++; Write-Host "  [updated] $($src.name)" -ForegroundColor Cyan } else { $failed++; Write-Host "  [failed]  $($src.name)" -ForegroundColor Red }
    } else {
      $body = New-SourceBody -Src $src -IsBlocked $isBlocked -Priority $priority -Note $note -IncludeUrl $true
      $out = Invoke-RestMethod -Method Post -Uri ($Base + "/api/sources") -Body $body -ContentType "application/json" -TimeoutSec 15 -ErrorAction Stop
      if ($out.ok) { $inserted++; Write-Host "  [inserted] $($src.name)" -ForegroundColor Green } else { $failed++; Write-Host "  [failed]   $($src.name)" -ForegroundColor Red }
    }
  } catch {
    $failed++
    Write-Host "  [failed]   $($src.name): $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "RESULT: inserted=$inserted updated=$updated failed=$failed" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
exit 0
