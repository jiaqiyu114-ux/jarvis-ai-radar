# ============================================================
#  JARVIS — Recommendation Pipeline Verification Script
#  Usage: powershell -ExecutionPolicy Bypass -File scripts\verify-recommendations.ps1
#  Or:    pnpm verify:recommendations  (if configured in package.json)
# ============================================================

param(
  [string]$Base = "http://localhost:3000",
  [switch]$SkipRefresh
)

$ok    = $true
$sep   = "─" * 50

function Print-Ok   ([string]$msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Print-Warn ([string]$msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Print-Fail ([string]$msg) { Write-Host "  ✗ $msg" -ForegroundColor Red; $script:ok = $false }
function Print-Info ([string]$msg) { Write-Host "  · $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "═══ JARVIS Recommendation Verification ═══" -ForegroundColor Cyan
Write-Host "  Base URL : $Base"
Write-Host "  Time     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# ── 1. Health ──────────────────────────────────────────────
Write-Host "$sep"
Write-Host "[1/5] Health Check" -ForegroundColor Yellow
try {
  $h = Invoke-RestMethod -Method Get -Uri "$Base/api/recommendations/health" -TimeoutSec 15 -ErrorAction Stop
  if ($h.ok) {
    Print-Ok "health: ok"
    Print-Info "activeRss    : $($h.sources.activeRss)"
    Print-Info "items last24h: $($h.items.last24h)"
    Print-Info "items last72h: $($h.items.last72h)"
    if ($h.recommendations) {
      Print-Info "candidates   : $($h.recommendations.recommendationCandidates)"
    }
    if ($h.emptyReason) { Print-Warn "emptyReason: $($h.emptyReason)" }
  } else {
    Print-Fail "health returned ok=false: $($h.error)"
  }
} catch {
  Print-Fail "health request failed: $_"
}

# ── 2. Refresh ─────────────────────────────────────────────
Write-Host ""
Write-Host "$sep"
if ($SkipRefresh) {
  Write-Host "[2/5] Refresh — SKIPPED (use -SkipRefresh:\$false to enable)" -ForegroundColor DarkGray
} else {
  Write-Host "[2/5] Trigger Refresh (POST /api/recommendations/refresh)" -ForegroundColor Yellow
  try {
    $r = Invoke-RestMethod -Method Post -Uri "$Base/api/recommendations/refresh" -TimeoutSec 30 -ErrorAction Stop
    if ($r.ok) {
      Print-Ok "refresh: $($r.runStatus)"
      Print-Info "durationMs  : $($r.durationMs)"
      Print-Info "snapshotId  : $($r.snapshot.id)"
      Print-Info "MR=$($r.stats.mustReadCount)  HV=$($r.stats.highValueCount)  OB=$($r.stats.observeCount)"
    } else {
      Print-Fail "refresh returned ok=false: $($r.error)"
    }
  } catch {
    Print-Fail "refresh request failed: $_"
  }
}

# ── 3. Recommendations ─────────────────────────────────────
Write-Host ""
Write-Host "$sep"
Write-Host "[3/5] Query Recommendations (GET ?windowHours=72&limit=30)" -ForegroundColor Yellow
try {
  $rec = Invoke-RestMethod -Method Get -Uri "$Base/api/recommendations?windowHours=72&limit=30" -TimeoutSec 15 -ErrorAction Stop
  if ($rec.ok) {
    $srcColor = if ($rec.source -eq "snapshot") { "Green" } else { "Yellow" }
    Print-Ok "recommendations ok  source=$($rec.source)"
    Write-Host "    source     : $($rec.source)" -ForegroundColor $srcColor
    Print-Info "capturedTotal: $($rec.stats.capturedTotal)"
    Print-Info "candidates   : $($rec.stats.recommendationCandidates)"
    Print-Info "must read    : $($rec.stats.mustReadCount)"
    Print-Info "high value   : $($rec.stats.highValueCount)"
    Print-Info "observe      : $($rec.stats.observeCount)"
    Print-Info "items count  : $($rec.items.Count)"
    if ($rec.source -ne "snapshot") {
      Print-Warn "Not using snapshot! Run refresh to generate one."
    }
  } else {
    Print-Fail "recommendations returned ok=false: $($rec.error)"
  }
} catch {
  Print-Fail "recommendations request failed: $_"
}

# ── 4. Snapshots ───────────────────────────────────────────
Write-Host ""
Write-Host "$sep"
Write-Host "[4/5] List Snapshots (GET /api/recommendations/snapshots?limit=10)" -ForegroundColor Yellow
try {
  $snaps = Invoke-RestMethod -Method Get -Uri "$Base/api/recommendations/snapshots?limit=10" -TimeoutSec 15 -ErrorAction Stop
  Print-Ok "snapshot count: $($snaps.count)"
  if ($snaps.snapshots.Count -gt 0) {
    $latest = $snaps.snapshots[0]
    Print-Info "latest status     : $($latest.status)"
    Print-Info "latest generatedAt: $($latest.generatedAt)"
    Print-Info "MR=$($latest.mustReadCount)  HV=$($latest.highValueCount)  OB=$($latest.observeCount)"
  } else {
    Print-Warn "No snapshots found. Run refresh to generate one."
  }
} catch {
  Print-Fail "snapshots request failed: $_"
}

# ── 5. Runs ────────────────────────────────────────────────
Write-Host ""
Write-Host "$sep"
Write-Host "[5/5] List Runs (GET /api/recommendations/runs?limit=10)" -ForegroundColor Yellow
try {
  $runs = Invoke-RestMethod -Method Get -Uri "$Base/api/recommendations/runs?limit=10" -TimeoutSec 15 -ErrorAction Stop
  Print-Ok "runs count: $($runs.count)"
  if ($runs.runs.Count -gt 0) {
    $lr = $runs.runs[0]
    Print-Info "latest status    : $($lr.status)"
    Print-Info "latest durationMs: $($lr.durationMs)"
    Print-Info "latest startedAt : $($lr.startedAt)"
  } else {
    Print-Warn "No runs found. Runs are created by POST /api/recommendations/refresh."
  }
} catch {
  Print-Fail "runs request failed: $_"
}

# ── Summary ────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════"
if ($ok) {
  Write-Host "  RESULT: ALL CHECKS PASSED" -ForegroundColor Green
} else {
  Write-Host "  RESULT: SOME CHECKS FAILED — see ✗ lines above" -ForegroundColor Red
}
Write-Host ""
