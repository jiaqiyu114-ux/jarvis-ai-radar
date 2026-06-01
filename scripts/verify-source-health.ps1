param(
  [string]$BundleFile   = "config\source-bundles\ai-radar-sources.json",
  [int]$MaxSources      = 0,
  [int]$TimeoutSec      = 12,
  [int]$MaxItemsCheck   = 5,
  [string]$OutputFile   = ".tmp\source-health-report.json",
  [switch]$RecommendedOnly,
  [switch]$FailFast
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== J.A.R.V.I.S. Source Health Check ===" -ForegroundColor Cyan
Write-Host ("Time:       " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ("TimeoutSec: " + $TimeoutSec)

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

# Filter sources to check
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

# MaxSources = 0 means check all
if ($MaxSources -gt 0 -and $toCheck.Count -gt $MaxSources) {
  Write-Host ("[INFO] Capping at " + $MaxSources + " of " + $toCheck.Count + " sources (-MaxSources to change, 0=all)") -ForegroundColor Gray
  $toCheck = $toCheck | Select-Object -First $MaxSources
} else {
  Write-Host ("MaxSources: all (" + $toCheck.Count + " sources)")
}
Write-Host ""
Write-Host ("Checking " + $toCheck.Count + " source(s) ...")
Write-Host ""

# ── Health test function ───────────────────────────────────────────────────────

function Test-RssFeed {
  param([string]$Url, [string]$Name, [int]$TimeoutMs)

  $r = [PSCustomObject]@{
    name                = $Name
    url                 = $Url
    status              = "unknown"
    feedType            = "unknown"
    fetchMs             = 0
    httpStatus          = 0
    itemCount           = 0
    hasTitleCount       = 0
    hasUrlCount         = 0
    hasPublishedAtCount = 0
    hasSummaryCount     = 0
    hasContentEncoded   = 0
    avgSummaryLength    = 0
    errorReason         = ""
    errorType           = ""
  }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $content = $null

  try {
    $wr = [System.Net.HttpWebRequest]::Create($Url)
    $wr.Timeout = $TimeoutMs
    $wr.UserAgent = "JARVIS-SourceHealth/1.0 (personal AI radar)"
    $wr.Accept = "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
    $wr.AllowAutoRedirect = $true
    $wr.MaximumAutomaticRedirections = 5

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
      $r.httpStatus = [int]$ex.Response.StatusCode
      $code = $r.httpStatus
      $r.status = "failed"
      if ($code -eq 404) {
        $r.errorType = "failed_not_found"
        $r.errorReason = "HTTP 404 Not Found"
      } elseif ($code -in @(500, 502, 503, 504)) {
        $r.errorType = "failed_bad_gateway"
        $r.errorReason = "HTTP $code Bad Gateway / Server Error"
      } elseif ($code -ge 300 -and $code -lt 400) {
        $r.errorType = "failed_redirect"
        $r.errorReason = "HTTP $code redirect could not be resolved"
      } else {
        $r.errorType = "failed_http_$code"
        $r.errorReason = "HTTP $code"
      }
    } elseif ($ex.Status -eq [System.Net.WebExceptionStatus]::Timeout) {
      $r.status    = "failed"
      $r.errorType = "failed_timeout"
      $r.errorReason = "Timeout after ${TimeoutMs}ms"
    } elseif ($ex.Status -eq [System.Net.WebExceptionStatus]::ConnectionClosed -or
              $ex.Status -eq [System.Net.WebExceptionStatus]::ReceiveFailure) {
      $r.status    = "failed"
      $r.errorType = "failed_connection_closed"
      $r.errorReason = "Connection closed: " + $ex.Message
    } elseif ($ex.Status -eq [System.Net.WebExceptionStatus]::NameResolutionFailure) {
      $r.status    = "failed"
      $r.errorType = "failed_dns"
      $r.errorReason = "DNS resolution failed"
    } else {
      $r.status    = "failed"
      $r.errorType = "failed_network"
      $r.errorReason = $ex.Message
    }
    return $r
  } catch {
    $sw.Stop()
    $r.fetchMs = $sw.ElapsedMilliseconds
    $r.status  = "failed"
    $r.errorType = "failed_unknown"
    $r.errorReason = $_.Exception.Message
    return $r
  }

  if (-not $content) {
    $r.status    = "failed"
    $r.errorType = "failed_empty"
    $r.errorReason = "Empty response"
    return $r
  }

  $trimmed = $content.TrimStart()
  if (-not ($trimmed.StartsWith("<?xml") -or $trimmed.StartsWith("<rss") -or
            $trimmed.StartsWith("<feed") -or $trimmed.StartsWith("<channel"))) {
    $r.status    = "failed"
    $r.errorType = "failed_not_xml"
    $r.errorReason = "Response is not XML (HTML error page?)"
    return $r
  }

  $xml = New-Object System.Xml.XmlDocument
  $parseErr = $null
  try {
    $xml.LoadXml($content)
  } catch {
    $parseErr = $_.Exception.Message
  }

  if ($parseErr) {
    $r.status    = "weak"
    $r.errorType = "parse_error"
    $short = if ($parseErr.Length -gt 80) { $parseErr.Substring(0,77) + "..." } else { $parseErr }
    $r.errorReason = "XML parse error: " + $short
    return $r
  }

  $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
  $ns.AddNamespace("atom",    "http://www.w3.org/2005/Atom")
  $ns.AddNamespace("content", "http://purl.org/rss/1.0/modules/content/")
  $ns.AddNamespace("dc",      "http://purl.org/dc/elements/1.1/")

  $items = $xml.SelectNodes("//channel/item")
  if ($items -and $items.Count -gt 0) {
    $r.feedType = "rss2"
  } else {
    $items = $xml.SelectNodes("//*[local-name()='entry']")
    if ($items -and $items.Count -gt 0) {
      $r.feedType = "atom"
    } else {
      $items = $xml.SelectNodes("//*[local-name()='item']")
      if ($items -and $items.Count -gt 0) { $r.feedType = "rss-generic" }
    }
  }

  if (-not $items -or $items.Count -eq 0) {
    $r.status    = "weak"
    $r.errorType = "no_items"
    $r.errorReason = "Feed parsed OK but 0 items found"
    return $r
  }

  $r.itemCount = $items.Count
  $checkN = [Math]::Min($MaxItemsCheck, $items.Count)
  $sumLengths = @()

  for ($i = 0; $i -lt $checkN; $i++) {
    $item = $items[$i]

    $titleNode = $item.SelectSingleNode("title")
    if (-not $titleNode) { $titleNode = $item.SelectSingleNode("*[local-name()='title']") }
    if ($titleNode -and -not [string]::IsNullOrWhiteSpace($titleNode.InnerText)) { $r.hasTitleCount++ }

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
    if ($pubNode -and -not [string]::IsNullOrWhiteSpace($pubNode.InnerText)) { $r.hasPublishedAtCount++ }

    $summNode = $item.SelectSingleNode("description")
    if (-not $summNode) { $summNode = $item.SelectSingleNode("*[local-name()='summary']") }
    if ($summNode -and -not [string]::IsNullOrWhiteSpace($summNode.InnerText)) {
      $r.hasSummaryCount++
      $sumLengths += $summNode.InnerText.Length
    }

    $contNode = $item.SelectSingleNode("content:encoded", $ns)
    if (-not $contNode) { $contNode = $item.SelectSingleNode("*[local-name()='encoded']") }
    if (-not $contNode) { $contNode = $item.SelectSingleNode("*[local-name()='content']") }
    if ($contNode -and -not [string]::IsNullOrWhiteSpace($contNode.InnerText)) { $r.hasContentEncoded++ }
  }

  if ($sumLengths.Count -gt 0) {
    $r.avgSummaryLength = [Math]::Round(($sumLengths | Measure-Object -Sum).Sum / $sumLengths.Count)
  }

  $titleRatio   = if ($checkN -gt 0) { $r.hasTitleCount / $checkN } else { 0 }
  $urlRatio     = if ($checkN -gt 0) { $r.hasUrlCount   / $checkN } else { 0 }
  $summaryRatio = if ($checkN -gt 0) { $r.hasSummaryCount / $checkN } else { 0 }

  if ($titleRatio -ge 0.8 -and $urlRatio -ge 0.8 -and $r.itemCount -ge 3) {
    if ($summaryRatio -ge 0.6) { $r.status = "healthy" }
    else                        { $r.status = "usable"  }
  } elseif ($titleRatio -ge 0.5 -and $urlRatio -ge 0.5) {
    $r.status    = "weak"
    $r.errorType = "weak_fields"
    $r.errorReason = ("Low field coverage: title=" + [Math]::Round($titleRatio*100) + "% url=" + [Math]::Round($urlRatio*100) + "%")
  } else {
    $r.status    = "failed"
    $r.errorType = "failed_fields"
    $r.errorReason = "Critical fields missing: title or url ratio too low"
  }

  return $r
}

# ── Run checks ─────────────────────────────────────────────────────────────────

$results = @()
$idx = 0

foreach ($src in $toCheck) {
  $idx++
  $nameShort = if ($src.name.Length -gt 30) { $src.name.Substring(0,27) + "..." } else { $src.name }
  $urlShort  = if ($src.url.Length  -gt 58) { $src.url.Substring(0,55)  + "..." } else { $src.url  }
  Write-Host ("[" + $idx + "/" + $toCheck.Count + "] " + $nameShort) -NoNewline
  Write-Host (" " + $urlShort) -ForegroundColor DarkGray

  $r = Test-RssFeed -Url $src.url -Name $src.name -TimeoutMs ($TimeoutSec * 1000)

  # Attach bundle metadata for the saved report
  $r | Add-Member -NotePropertyName bundleId     -NotePropertyValue $src.id           -Force
  $r | Add-Member -NotePropertyName origin       -NotePropertyValue $src.origin       -Force
  $r | Add-Member -NotePropertyName category     -NotePropertyValue $src.category     -Force
  $r | Add-Member -NotePropertyName tier         -NotePropertyValue $src.tier         -Force
  $r | Add-Member -NotePropertyName priority     -NotePropertyValue $src.priority     -Force
  $r | Add-Member -NotePropertyName official     -NotePropertyValue $src.official     -Force
  $r | Add-Member -NotePropertyName userCurated  -NotePropertyValue $src.userCurated  -Force
  $r | Add-Member -NotePropertyName notes        -NotePropertyValue $src.notes        -Force
  $r | Add-Member -NotePropertyName riskNotes    -NotePropertyValue $src.riskNotes    -Force
  $r | Add-Member -NotePropertyName importedFrom -NotePropertyValue $src.importedFrom -Force

  $statusColor = switch ($r.status) {
    "healthy"  { "Green"  }
    "usable"   { "Cyan"   }
    "weak"     { "Yellow" }
    "failed"   { "Red"    }
    default    { "Gray"   }
  }

  $tag = ("[" + $r.status.ToUpper().PadRight(9) + "]")
  $line = ("  " + $tag + " items=" + $r.itemCount + " titles=" + $r.hasTitleCount +
    " urls=" + $r.hasUrlCount + " summaries=" + $r.hasSummaryCount +
    " ms=" + $r.fetchMs)
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

# ── Summary table ──────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "── Health Summary ────────────────────────────────────────────────────" -ForegroundColor Cyan
$results | Select-Object name, status, feedType, itemCount, hasTitleCount, hasUrlCount, hasSummaryCount, hasContentEncoded, avgSummaryLength, fetchMs, errorReason |
  Format-Table -AutoSize

# ── Stats ──────────────────────────────────────────────────────────────────────

$healthyCount  = @($results | Where-Object { $_.status -eq "healthy" }).Count
$usableCount   = @($results | Where-Object { $_.status -eq "usable"  }).Count
$weakCount     = @($results | Where-Object { $_.status -eq "weak"    }).Count
$failedCount   = @($results | Where-Object { $_.status -eq "failed"  }).Count

Write-Host "── Results ───────────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ("sourcesChecked: " + $results.Count)
Write-Host ("healthy:        " + $healthyCount) -ForegroundColor Green
Write-Host ("usable:         " + $usableCount)  -ForegroundColor Cyan
Write-Host ("weak:           " + $weakCount)    -ForegroundColor Yellow
Write-Host ("failed:         " + $failedCount)  -ForegroundColor Red
Write-Host ""

if ($healthyCount + $usableCount -gt 0) {
  Write-Host "── Ready to Import (healthy / usable) ────────────────────────────────" -ForegroundColor Green
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
    Write-Host ("  [" + $_.errorType + "] " + $_.name + ": " + $_.errorReason) -ForegroundColor Red
  }
  Write-Host ""
}

# ── Save JSON report ──────────────────────────────────────────────────────────

$outPath = Join-Path (Get-Location) $OutputFile
$outDir  = Split-Path $outPath -Parent
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$report = [PSCustomObject]@{
  generatedAt    = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
  bundleFile     = $BundleFile
  sourcesChecked = $results.Count
  summary        = [PSCustomObject]@{
    healthy = $healthyCount
    usable  = $usableCount
    weak    = $weakCount
    failed  = $failedCount
  }
  results = $results
}

try {
  $reportJson = $report | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($outPath, $reportJson, [System.Text.Encoding]::UTF8)
  Write-Host ("Health report saved to: " + $outPath) -ForegroundColor Green
} catch {
  Write-Host ("Warning: could not save report: " + $_.Exception.Message) -ForegroundColor Yellow
}
Write-Host ""
Write-Host ("RESULT: " + $healthyCount + " healthy, " + $usableCount + " usable, " + $weakCount + " weak, " + $failedCount + " failed") -ForegroundColor Cyan
Write-Host ""
Write-Host "Run import-healthy-sources.ps1 to import healthy/usable sources." -ForegroundColor Gray
