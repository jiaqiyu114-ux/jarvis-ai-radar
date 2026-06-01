param(
  [string]$BundleFile = "config\source-bundles\ai-radar-sources.json",
  [int]$MaxSources = 15,
  [int]$TimeoutSec = 12,
  [int]$MaxItemsCheck = 5,
  [switch]$RecommendedOnly,
  [switch]$FailFast
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Source Health Check ===" -ForegroundColor Cyan
Write-Host ("Time:       " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ("MaxSources: " + $MaxSources)
Write-Host ("TimeoutSec: " + $TimeoutSec)
Write-Host ""

# ── Load bundle ────────────────────────────────────────────────────────────────

$bundlePath = Join-Path $PSScriptRoot "..\$BundleFile"
if (-not (Test-Path $bundlePath)) {
  $bundlePath = Join-Path (Get-Location) $BundleFile
}

if (-not (Test-Path $bundlePath)) {
  Write-Host ("[FAIL] Bundle not found: " + $BundleFile) -ForegroundColor Red
  exit 1
}

$rawJson = [System.IO.File]::ReadAllText($bundlePath, [System.Text.Encoding]::UTF8)
$bundle = $rawJson | ConvertFrom-Json
$allSources = @($bundle.sources)

$toCheck = if ($RecommendedOnly) {
  @($allSources | Where-Object {
    ($_.type -eq "rss" -or $_.type -eq "atom") -and
    ($_.tier -eq "S" -or $_.tier -eq "A" -or $_.tier -eq "B") -and
    $_.priority -le 3 -and
    $_.riskNotes -notmatch "paywall"
  })
} else {
  @($allSources | Where-Object { $_.type -eq "rss" -or $_.type -eq "atom" })
}

if ($toCheck.Count -gt $MaxSources) {
  Write-Host ("[INFO] Capping at $MaxSources of " + $toCheck.Count + " sources (-MaxSources to change)") -ForegroundColor Gray
  $toCheck = $toCheck | Select-Object -First $MaxSources
}

Write-Host ("Checking " + $toCheck.Count + " source(s)...")
Write-Host ""

# ── Health test function ───────────────────────────────────────────────────────

function Test-RssFeed {
  param([string]$Url, [string]$Name, [int]$TimeoutMs)

  $r = [PSCustomObject]@{
    name                = $Name
    url                 = $Url
    status              = "unknown"
    fetchMs             = 0
    httpStatus          = 0
    itemCount           = 0
    hasTitleCount       = 0
    hasUrlCount         = 0
    hasPublishedAtCount = 0
    hasSummaryCount     = 0
    hasContentEncoded   = 0
    avgSummaryLength    = 0
    feedType            = "unknown"
    errorReason         = ""
  }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()

  $content = $null
  $parseError = $null

  # Fetch
  try {
    $wr = [System.Net.HttpWebRequest]::Create($Url)
    $wr.Timeout = $TimeoutMs
    $wr.UserAgent = "JARVIS-SourceHealth/1.0 (personal AI radar)"
    $wr.Accept = "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"

    $response = $wr.GetResponse()
    $sw.Stop()
    $r.fetchMs = $sw.ElapsedMilliseconds
    $r.httpStatus = [int]$response.StatusCode

    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
    $content = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
  } catch [System.Net.WebException] {
    $sw.Stop()
    $r.fetchMs = $sw.ElapsedMilliseconds
    $ex = $_.Exception
    if ($ex.Response) {
      $r.httpStatus  = [int]$ex.Response.StatusCode
      $r.status      = "failed"
      $r.errorReason = "HTTP " + [int]$ex.Response.StatusCode + " " + $ex.Response.StatusDescription
    } elseif ($ex.Status -eq [System.Net.WebExceptionStatus]::Timeout) {
      $r.status      = "failed"
      $r.errorReason = "timeout after ${TimeoutMs}ms"
    } else {
      $r.status      = "failed"
      $r.errorReason = $ex.Message
    }
    return $r
  } catch {
    $sw.Stop()
    $r.fetchMs = $sw.ElapsedMilliseconds
    $r.status  = "failed"
    $r.errorReason = $_.Exception.Message
    return $r
  }

  if (-not $content) {
    $r.status = "failed"
    $r.errorReason = "empty response"
    return $r
  }

  $trimmed = $content.TrimStart()
  if (-not ($trimmed.StartsWith("<?xml") -or $trimmed.StartsWith("<rss") -or $trimmed.StartsWith("<feed") -or $trimmed.StartsWith("<channel"))) {
    $r.status = "failed"
    $r.errorReason = "response is not XML (possibly HTML error page)"
    return $r
  }

  # Parse XML
  $xml = New-Object System.Xml.XmlDocument
  try {
    $xml.LoadXml($content)
    $parseError = $null
  } catch {
    $parseError = $_.Exception.Message
  }

  if ($parseError) {
    $r.status = "weak"
    $r.errorReason = "XML parse error: " + $parseError.Substring(0, [Math]::Min(80, $parseError.Length))
    return $r
  }

  $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
  $ns.AddNamespace("atom", "http://www.w3.org/2005/Atom")
  $ns.AddNamespace("content", "http://purl.org/rss/1.0/modules/content/")
  $ns.AddNamespace("dc", "http://purl.org/dc/elements/1.1/")

  # Detect items
  $items = $xml.SelectNodes("//channel/item")
  if ($items -and $items.Count -gt 0) {
    $r.feedType = "rss2"
  } else {
    $items = $xml.SelectNodes("//*[local-name()='entry']")
    if ($items -and $items.Count -gt 0) {
      $r.feedType = "atom"
    } else {
      $items = $xml.SelectNodes("//*[local-name()='item']")
      if ($items -and $items.Count -gt 0) {
        $r.feedType = "rss-generic"
      }
    }
  }

  if (-not $items -or $items.Count -eq 0) {
    $r.status = "weak"
    $r.errorReason = "feed parsed but 0 items found"
    return $r
  }

  $r.itemCount = $items.Count
  $checkN = [Math]::Min($MaxItemsCheck, $items.Count)
  $sumLengths = @()

  for ($i = 0; $i -lt $checkN; $i++) {
    $item = $items[$i]

    $titleNode = $item.SelectSingleNode("title")
    if (-not $titleNode) { $titleNode = $item.SelectSingleNode("*[local-name()='title']") }
    if ($titleNode -and -not [string]::IsNullOrWhiteSpace($titleNode.InnerText)) {
      $r.hasTitleCount++
    }

    $linkNode = $item.SelectSingleNode("link")
    if (-not $linkNode) { $linkNode = $item.SelectSingleNode("*[local-name()='link']") }
    $hasLink = $false
    if ($linkNode) {
      if (-not [string]::IsNullOrWhiteSpace($linkNode.InnerText)) { $hasLink = $true }
      $hrefAttr = $linkNode.GetAttribute("href")
      if (-not [string]::IsNullOrWhiteSpace($hrefAttr)) { $hasLink = $true }
    }
    if ($hasLink) { $r.hasUrlCount++ }

    $pubNode = $item.SelectSingleNode("pubDate")
    if (-not $pubNode) { $pubNode = $item.SelectSingleNode("*[local-name()='published']") }
    if (-not $pubNode) { $pubNode = $item.SelectSingleNode("*[local-name()='updated']") }
    if (-not $pubNode) { $pubNode = $item.SelectSingleNode("dc:date", $ns) }
    if ($pubNode -and -not [string]::IsNullOrWhiteSpace($pubNode.InnerText)) {
      $r.hasPublishedAtCount++
    }

    $summNode = $item.SelectSingleNode("description")
    if (-not $summNode) { $summNode = $item.SelectSingleNode("*[local-name()='summary']") }
    if ($summNode -and -not [string]::IsNullOrWhiteSpace($summNode.InnerText)) {
      $r.hasSummaryCount++
      $sumLengths += $summNode.InnerText.Length
    }

    $contNode = $item.SelectSingleNode("content:encoded", $ns)
    if (-not $contNode) { $contNode = $item.SelectSingleNode("*[local-name()='encoded']") }
    if (-not $contNode) { $contNode = $item.SelectSingleNode("*[local-name()='content'][not(@type) or @type='html' or @type='xhtml']") }
    if ($contNode -and -not [string]::IsNullOrWhiteSpace($contNode.InnerText)) {
      $r.hasContentEncoded++
    }
  }

  if ($sumLengths.Count -gt 0) {
    $r.avgSummaryLength = [Math]::Round(($sumLengths | Measure-Object -Sum).Sum / $sumLengths.Count)
  }

  $titleRatio   = if ($checkN -gt 0) { $r.hasTitleCount / $checkN } else { 0 }
  $urlRatio     = if ($checkN -gt 0) { $r.hasUrlCount   / $checkN } else { 0 }
  $summaryRatio = if ($checkN -gt 0) { $r.hasSummaryCount / $checkN } else { 0 }

  if ($titleRatio -ge 0.8 -and $urlRatio -ge 0.8 -and $r.itemCount -ge 3) {
    if ($summaryRatio -ge 0.6) {
      $r.status = "healthy"
    } else {
      $r.status = "usable"
    }
  } elseif ($titleRatio -ge 0.5 -and $urlRatio -ge 0.5) {
    $r.status = "weak"
  } else {
    $r.status = "failed"
    $r.errorReason = "critical fields missing (title or url ratio too low)"
  }

  return $r
}

# ── Run checks ─────────────────────────────────────────────────────────────────

$results = @()
$idx = 0
foreach ($src in $toCheck) {
  $idx++
  $nameShort = if ($src.name.Length -gt 30) { $src.name.Substring(0,27) + "..." } else { $src.name }
  $urlShort  = if ($src.url.Length  -gt 60) { $src.url.Substring(0,57)  + "..." } else { $src.url  }
  Write-Host ("[$idx/$($toCheck.Count)] " + $nameShort) -NoNewline
  Write-Host (" " + $urlShort) -ForegroundColor DarkGray

  $r = Test-RssFeed -Url $src.url -Name $src.name -TimeoutMs ($TimeoutSec * 1000)
  $r | Add-Member -NotePropertyName origin   -NotePropertyValue $src.origin   -Force
  $r | Add-Member -NotePropertyName tier     -NotePropertyValue $src.tier     -Force
  $r | Add-Member -NotePropertyName priority -NotePropertyValue $src.priority -Force

  $statusColor = switch ($r.status) {
    "healthy"  { "Green"  }
    "usable"   { "Cyan"   }
    "weak"     { "Yellow" }
    "failed"   { "Red"    }
    default    { "Gray"   }
  }

  $line = ("  [" + $r.status.ToUpper().PadRight(9) + "] items=" + $r.itemCount +
    " titles=" + $r.hasTitleCount + " urls=" + $r.hasUrlCount +
    " summaries=" + $r.hasSummaryCount + " ms=" + $r.fetchMs)
  Write-Host $line -ForegroundColor $statusColor

  if ($r.errorReason) {
    Write-Host ("             " + $r.errorReason) -ForegroundColor DarkGray
  }

  $results += $r

  if ($FailFast -and $r.status -eq "failed") {
    Write-Host "[FAIL-FAST] stopping after first failure" -ForegroundColor Yellow
    break
  }
}

# ── Summary ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "── Health Summary ────────────────────────────────────────────────────" -ForegroundColor Cyan

$results | Select-Object name, status, itemCount, hasTitleCount, hasUrlCount, hasSummaryCount, hasContentEncoded, avgSummaryLength, fetchMs, errorReason |
  Format-Table -AutoSize

$healthyCount    = @($results | Where-Object { $_.status -eq "healthy" }).Count
$usableCount     = @($results | Where-Object { $_.status -eq "usable"  }).Count
$weakCount       = @($results | Where-Object { $_.status -eq "weak"    }).Count
$failedCount     = @($results | Where-Object { $_.status -eq "failed"  }).Count

Write-Host "── Results ───────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ("sourcesChecked: " + $results.Count)
Write-Host ("healthy:        " + $healthyCount) -ForegroundColor Green
Write-Host ("usable:         " + $usableCount)  -ForegroundColor Cyan
Write-Host ("weak:           " + $weakCount)    -ForegroundColor Yellow
Write-Host ("failed:         " + $failedCount)  -ForegroundColor Red
Write-Host ""

if ($healthyCount + $usableCount -gt 0) {
  Write-Host "── Ready to Enable (healthy / usable) ────────────────────────────────" -ForegroundColor Green
  $results | Where-Object { $_.status -eq "healthy" -or $_.status -eq "usable" } | ForEach-Object {
    $tag = if ($_.status -eq "healthy") { "[HEALTHY]" } else { "[USABLE] " }
    Write-Host ("  " + $tag + " [" + $_.tier + "] " + $_.name) -ForegroundColor White
    Write-Host ("             " + $_.url) -ForegroundColor DarkGray
  }
  Write-Host ""
}

if ($failedCount -gt 0) {
  Write-Host "── Failed Sources ────────────────────────────────────────────────────" -ForegroundColor Red
  $results | Where-Object { $_.status -eq "failed" } | ForEach-Object {
    Write-Host ("  [FAIL] " + $_.name + ": " + $_.errorReason) -ForegroundColor Red
  }
  Write-Host ""
}

Write-Host ("RESULT: COMPLETE ($healthyCount healthy, $usableCount usable, $weakCount weak, $failedCount failed)") -ForegroundColor Cyan
