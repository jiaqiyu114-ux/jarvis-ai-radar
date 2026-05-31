# ============================================================
#  JARVIS - Register Local Pipeline Task (Windows Task Scheduler)
#
#  This script generates the commands to schedule an automated
#  recommendation pipeline run using Windows Task Scheduler.
#
#  It does NOT register the task automatically (that would require
#  administrator privileges and could cause unintended side effects).
#  Instead, it prints the commands for you to review and run manually.
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File scripts\register-local-pipeline-task.ps1
#    powershell -ExecutionPolicy Bypass -File scripts\register-local-pipeline-task.ps1 -EveryHours 6 -MaxSources 12
#
#  Requirements:
#    - pnpm dev running at $Base (or deployed to Vercel)
#    - PIPELINE_SECRET set in .env.local if you use Mode=scheduled
#    - Windows Task Scheduler (built into Windows)
# ============================================================

param(
  [string]$Base        = "http://localhost:3000",
  [int]   $EveryHours  = 6,
  [int]   $MaxSources  = 12,
  [string]$Mode        = "scheduled",
  [string]$Secret      = "",
  [string]$TaskName    = "JARVIS Recommendation Pipeline"
)

# Resolve the script path
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runScript   = Join-Path $projectRoot "scripts\run-recommendation-pipeline.ps1"

Write-Host ""
Write-Host "=== JARVIS - Windows Task Scheduler Setup ===" -ForegroundColor Cyan
Write-Host "  Project root : $projectRoot"
Write-Host "  Task name    : $TaskName"
Write-Host "  Frequency    : Every $EveryHours hour(s)"
Write-Host "  MaxSources   : $MaxSources"
Write-Host "  Mode         : $Mode"
Write-Host "  Base URL     : $Base"
Write-Host ""

# ── Build the action command ─────────────────────────────────────────────────

$secretArg = ""
if ($Secret -ne "") { $secretArg = " -Secret `"$Secret`"" }

$actionCmd = "powershell.exe"
$actionArgs = "-NonInteractive -ExecutionPolicy Bypass -File `"$runScript`"" +
  " -Base `"$Base`"" +
  " -MaxSources $MaxSources" +
  " -Mode `"$Mode`"" +
  $secretArg

Write-Host "--- Action command ---" -ForegroundColor Yellow
Write-Host "  Executable : $actionCmd"
Write-Host "  Arguments  : $actionArgs"
Write-Host ""

# ── PowerShell commands to register the task ─────────────────────────────────

$registerCmd = @"
# Run this block in an ELEVATED (Administrator) PowerShell to register the task:

`$action  = New-ScheduledTaskAction -Execute "$actionCmd" -Argument '$actionArgs'
`$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Hours $EveryHours) -Once -At (Get-Date)
`$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable
`$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -RunLevel Limited

Register-ScheduledTask -TaskName "$TaskName" ``
  -Action `$action -Trigger `$trigger -Settings `$settings -Principal `$principal ``
  -Description "JARVIS automated recommendation pipeline — runs every $EveryHours hour(s)" ``
  -Force

Write-Host "Task registered. Run 'Get-ScheduledTask -TaskName `"$TaskName`"' to verify."
"@

Write-Host "--- Commands to register task (run as Administrator) ---" -ForegroundColor Yellow
Write-Host $registerCmd -ForegroundColor White
Write-Host ""

# ── Commands to manage the task ──────────────────────────────────────────────

Write-Host "--- Task management commands ---" -ForegroundColor Yellow
Write-Host "  # View task status:" -ForegroundColor Gray
Write-Host "  Get-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor White
Write-Host ""
Write-Host "  # Run immediately:" -ForegroundColor Gray
Write-Host "  Start-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor White
Write-Host ""
Write-Host "  # View last run result:" -ForegroundColor Gray
Write-Host "  (Get-ScheduledTaskInfo -TaskName `"$TaskName`").LastTaskResult" -ForegroundColor White
Write-Host ""
Write-Host "  # Disable task:" -ForegroundColor Gray
Write-Host "  Disable-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor White
Write-Host ""
Write-Host "  # Remove task:" -ForegroundColor Gray
Write-Host "  Unregister-ScheduledTask -TaskName `"$TaskName`" -Confirm:`$false" -ForegroundColor White
Write-Host ""

# ── Alternative: Vercel Cron (for cloud deployment) ──────────────────────────

Write-Host "--- Alternative: Vercel Cron (cloud deployment) ---" -ForegroundColor Yellow
Write-Host "  When deployed to Vercel, use vercel.json cron instead:" -ForegroundColor Gray
Write-Host @'
  {
    "crons": [
      {
        "path": "/api/pipeline/recommendations?mode=scheduled&maxSources=12&ingest=true&refresh=true",
        "schedule": "0 */6 * * *"
      }
    ]
  }
'@ -ForegroundColor White
Write-Host "  Set PIPELINE_SECRET in Vercel environment variables." -ForegroundColor Gray
Write-Host "  Include Authorization: Bearer <secret> in the cron call (via header injection or query)." -ForegroundColor Gray
Write-Host ""

Write-Host "--- Notes ---" -ForegroundColor Yellow
Write-Host "  - This script requires pnpm dev to be running (or the app deployed)." -ForegroundColor Gray
Write-Host "  - Scheduled task runs in your user context (no admin needed for execution)." -ForegroundColor Gray
Write-Host "  - REGISTRATION requires Administrator. RUNNING does not." -ForegroundColor Gray
Write-Host "  - If using Mode=scheduled, set PIPELINE_SECRET in .env.local first." -ForegroundColor Gray
Write-Host ""
