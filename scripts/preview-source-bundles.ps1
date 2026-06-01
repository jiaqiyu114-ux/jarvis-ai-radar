param(
  [string]$BundleFile = "config\source-bundles\ai-radar-sources.json",
  [string]$ExternalAiRadar = "external\ai-news-radar",
  [string]$ExternalTrendRadar = "external\TrendRadar",
  [switch]$RecommendedOnly
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Source Bundle Preview ===" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# ── Load primary bundle JSON ───────────────────────────────────────────────────

$bundlePath = Join-Path $PSScriptRoot "..\$BundleFile"
if (-not (Test-Path $bundlePath)) {
  $bundlePath = Join-Path (Get-Location) $BundleFile
}

$bundleSources = @()
if (Test-Path $bundlePath) {
  $rawJson = [System.IO.File]::ReadAllText($bundlePath, [System.Text.Encoding]::UTF8)
  $bundle = $rawJson | ConvertFrom-Json
  $bundleSources = @($bundle.sources)
  Write-Host "[OK]  Loaded: $bundlePath (v$($bundle.version), $($bundleSources.Count) sources)" -ForegroundColor Green
} else {
  Write-Host "[WARN] Bundle not found: $bundlePath" -ForegroundColor Yellow
}

# ── Scan external repos for additional RSS URLs ────────────────────────────────

function Get-RssUrlsFromDir {
  param([string]$DirPath, [string]$Origin)
  $found = @()
  if (-not (Test-Path $DirPath)) { return $found }

  $exts = @(".opml", ".xml", ".json", ".yaml", ".yml", ".md", ".txt")
  $files = Get-ChildItem -Path $DirPath -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $exts -contains $_.Extension -and $_.Length -lt 2MB }

  $idx = 0
  foreach ($f in $files) {
    $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    $rexMatches = [regex]::Matches($content, "https?://[^\s`"'<>]{5,280}(?:\.xml|/rss|/feed|/atom)[^\s`"'<>]*")
    foreach ($m in $rexMatches) {
      $url = $m.Value.TrimEnd(".,)")
      if ($url -notmatch "github\.com" -and $url.Length -lt 300) {
        $host = ""
        try { $host = ([Uri]$url).Host } catch { $host = $url.Substring(0, [Math]::Min(30, $url.Length)) }
        $found += [PSCustomObject]@{
          id            = "scan-${Origin}-${idx}"
          name          = $host
          url           = $url
          type          = "rss"
          origin        = $Origin
          category      = "tech-news"
          tier          = "C"
          priority      = 4
          official      = $false
          userCurated   = $false
          candidateOnly = $true
          notes         = "auto-scanned from $($f.Name)"
          importedFrom  = $Origin
          riskNotes     = "needs manual verification"
        }
        $idx++
      }
    }
  }
  return $found
}

$aiRadarPath   = Join-Path (Get-Location) $ExternalAiRadar
$trendRadarPath = Join-Path (Get-Location) $ExternalTrendRadar

if (Test-Path $aiRadarPath) {
  $scanned = Get-RssUrlsFromDir -DirPath $aiRadarPath -Origin "ai_news_radar"
  Write-Host "[SCAN] ai-news-radar: $($scanned.Count) URL(s) found" -ForegroundColor Gray
  $bundleSources += $scanned
} else {
  Write-Host "[INFO] external/ai-news-radar not present -- bundled list only" -ForegroundColor Gray
}

if (Test-Path $trendRadarPath) {
  $scanned2 = Get-RssUrlsFromDir -DirPath $trendRadarPath -Origin "trendradar"
  Write-Host "[SCAN] TrendRadar (GPL config ref only): $($scanned2.Count) URL(s) found" -ForegroundColor Gray
  $bundleSources += $scanned2
} else {
  Write-Host "[INFO] external/TrendRadar not present -- bundled list only" -ForegroundColor Gray
}

# ── Dedup by normalised URL ────────────────────────────────────────────────────

$seen = @{}
$unique = [System.Collections.Generic.List[object]]::new()
$duplicateCount = 0

foreach ($s in $bundleSources) {
  $norm = $s.url.Trim().TrimEnd("/").ToLower()
  if ($seen.ContainsKey($norm)) {
    $duplicateCount++
  } else {
    $seen[$norm] = $s.id
    $unique.Add($s) | Out-Null
  }
}

$invalidCount = @($unique | Where-Object { $_.url -notmatch "^https?://" -or $_.url -match "github\.com/.*/blob/" }).Count

$recToEnable = @($unique | Where-Object {
  $_.candidateOnly -eq $true -and
  ($_.type -eq "rss" -or $_.type -eq "atom") -and
  ($_.tier -eq "S" -or $_.tier -eq "A" -or $_.tier -eq "B") -and
  $_.priority -le 3 -and
  $_.riskNotes -notmatch "paywall"
})

$displayed = if ($RecommendedOnly) { $recToEnable } else { @($unique) }

# ── Table ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "── Candidate Sources ─────────────────────────────────────────────────" -ForegroundColor Cyan

$rows = $displayed | ForEach-Object {
  $nameT = if ($_.name.Length -gt 26) { $_.name.Substring(0,23) + "..." } else { $_.name }
  $urlT  = if ($_.url.Length  -gt 52) { $_.url.Substring(0,49)  + "..." } else { $_.url  }
  $notesT = if ($_.notes.Length -gt 28) { $_.notes.Substring(0,25) + "..." } else { $_.notes }
  $originShort = switch ($_.origin) {
    "ai_news_radar" { "aiRadar" }
    "trendradar"    { "trendR"  }
    "official"      { "official"}
    "manual"        { "manual"  }
    "aihot"         { "aihot"   }
    default         { $_.origin }
  }
  [PSCustomObject]@{
    Name   = $nameT
    URL    = $urlT
    Type   = $_.type
    Origin = $originShort
    Tier   = $_.tier
    P      = $_.priority
    Cand   = if ($_.candidateOnly) { "Y" } else { "N" }
    Notes  = $notesT
  }
}

$rows | Format-Table -AutoSize

# ── Stats ──────────────────────────────────────────────────────────────────────

$aiCount   = @($unique | Where-Object { $_.origin -eq "ai_news_radar" }).Count
$trCount   = @($unique | Where-Object { $_.origin -eq "trendradar" }).Count
$manCount  = @($unique | Where-Object { $_.origin -ne "ai_news_radar" -and $_.origin -ne "trendradar" }).Count
$rssCount  = @($unique | Where-Object { $_.type -eq "rss" }).Count
$atomCount = @($unique | Where-Object { $_.type -eq "atom" }).Count
$opmlCount = @($unique | Where-Object { $_.type -eq "opml" }).Count
$jsonCount = @($unique | Where-Object { $_.type -eq "json" }).Count

Write-Host "── Statistics ────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ("totalCandidates:       " + $unique.Count)
Write-Host ("aiNewsRadarCandidates: " + $aiCount)
Write-Host ("trendRadarCandidates:  " + $trCount)
Write-Host ("manualCandidates:      " + $manCount)
Write-Host ("rssCount:              " + $rssCount)
Write-Host ("atomCount:             " + $atomCount)
Write-Host ("opmlCount:             " + $opmlCount)
Write-Host ("jsonCount:             " + $jsonCount)
Write-Host ("duplicates:            " + $duplicateCount)
Write-Host ("invalidUrls:           " + $invalidCount)
Write-Host ("recommendedToEnable:   " + $recToEnable.Count)
Write-Host ""

if ($recToEnable.Count -gt 0) {
  Write-Host "── Recommended to Enable (Tier S/A/B, priority<=3, no paywall) ──────" -ForegroundColor Green
  foreach ($src in $recToEnable) {
    Write-Host ("  [" + $src.tier + "] " + $src.name) -ForegroundColor White
    Write-Host ("      " + $src.url) -ForegroundColor DarkGray
  }
  Write-Host ""
}

Write-Host "── Notes ─────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "  * All sources are candidateOnly=true by default (not auto-imported)" -ForegroundColor DarkGray
Write-Host "  * Run verify-source-health.ps1 before enabling any source" -ForegroundColor DarkGray
Write-Host "  * TrendRadar: config/URL reference only (GPL-3.0, no core code used)" -ForegroundColor DarkGray
Write-Host "  * GitHub repo URLs are excluded from source candidates" -ForegroundColor DarkGray
Write-Host ""
Write-Host "RESULT: PREVIEW COMPLETE" -ForegroundColor Cyan
