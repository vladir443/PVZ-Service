$ErrorActionPreference = "SilentlyContinue"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot ".runtime"
$serverPidFile = Join-Path $runtimeDir "server.pid"
$ngrokPidFile = Join-Path $runtimeDir "ngrok.pid"
$cloudflaredPidFile = Join-Path $runtimeDir "cloudflared.pid"
$localhostRunPidFile = Join-Path $runtimeDir "localhostrun.pid"

function Stop-FromPidFile([string]$pidFilePath) {
  if (Test-Path $pidFilePath) {
    $id = [int](Get-Content $pidFilePath)
    Stop-Process -Id $id -Force
    Remove-Item $pidFilePath -Force
  }
}

Stop-FromPidFile -pidFilePath $serverPidFile
Stop-FromPidFile -pidFilePath $ngrokPidFile
Stop-FromPidFile -pidFilePath $cloudflaredPidFile
Stop-FromPidFile -pidFilePath $localhostRunPidFile

Write-Host "Stopped server and tunnel processes (if they were running)."
