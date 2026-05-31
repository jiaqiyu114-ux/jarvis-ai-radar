param(
  [int]$EveryHours = 6,
  [int]$MaxSources = 12,
  [string]$Base = "http://localhost:3000",
  [string]$TaskName = "JARVIS Recommendation Pipeline",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$msg) { Write-Host "[INFO] $msg" -ForegroundColor Gray }
function Write-Ok([string]$msg) { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }

if ($EveryHours -lt 1) { $EveryHours = 1 }
if ($EveryHours -gt 24) { $EveryHours = 24 }
if ($MaxSources -lt 1) { $MaxSources = 1 }
if ($MaxSources -gt 20) { $MaxSources = 20 }

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runScript = Join-Path $projectRoot "scripts\run-recommendation-pipeline.ps1"
$logFile = Join-Path $projectRoot "logs\pipeline-task.log"
$currentUser = [Environment]::UserName
$fullUser = [Environment]::UserDomainName + "\" + $currentUser

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)

if (-not (Test-Path -Path $runScript)) {
  Write-Fail "run script not found: $runScript"
  exit 1
}

$secretExists = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("PIPELINE_SECRET"))

$actionExec = "powershell.exe"
$actionArgs = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runScript`" -Base `"$Base`" -MaxSources $MaxSources -IngestTimeoutMs 55000 -WindowHours 72 -Mode scheduled -LogFile `"$logFile`""

Write-Host ""
Write-Host "=== JARVIS Local Pipeline Task ===" -ForegroundColor Cyan
Write-Host "TaskName          : $TaskName"
Write-Host "EveryHours        : $EveryHours"
Write-Host "Base              : $Base"
Write-Host "MaxSources        : $MaxSources"
Write-Host "CurrentUser       : $fullUser"
Write-Host "IsAdministrator   : $isAdmin"
Write-Host "PIPELINE_SECRET   : $secretExists"
Write-Host "RunScript         : $runScript"
Write-Host "LogFile           : $logFile"
Write-Host "Executable        : $actionExec"
Write-Host "Arguments         : $actionArgs"
Write-Host ""

if (-not $Apply) {
  Write-Info "preview mode only. append -Apply to register/update the task."
  Write-Info "example:"
  Write-Host "powershell -ExecutionPolicy Bypass -File scripts\register-local-pipeline-task.ps1 -EveryHours $EveryHours -MaxSources $MaxSources -Base `"$Base`" -TaskName `"$TaskName`" -Apply"
  Write-Host ""
  exit 0
}

try {
  $taskFolder = Split-Path -Parent $logFile
  if (-not (Test-Path -Path $taskFolder)) {
    New-Item -ItemType Directory -Path $taskFolder -Force | Out-Null
  }

  $action = New-ScheduledTaskAction -Execute $actionExec -Argument $actionArgs
  $trigger = New-ScheduledTaskTrigger -Daily -At "00:00"
  $trigger.Repetition.Interval = "PT${EveryHours}H"
  $trigger.Repetition.Duration = "P1D"
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId $fullUser -LogonType InteractiveToken -RunLevel Limited

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $taskPrincipal `
    -Description "JARVIS recommendation pipeline every $EveryHours hour(s)" `
    -Force | Out-Null

  Write-Ok "task registered: $TaskName"
  Write-Info "check status: Get-ScheduledTask -TaskName `"$TaskName`""
  exit 0
} catch {
  $msg = $_.Exception.Message
  Write-Fail "task registration failed: $msg"
  if (-not $isAdmin) {
    Write-Warn "try opening PowerShell as Administrator and run again with -Apply"
  }
  exit 1
}
