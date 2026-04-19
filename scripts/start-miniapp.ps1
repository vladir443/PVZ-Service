param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot ".runtime"
$serverPidFile = Join-Path $runtimeDir "server.pid"
$ngrokPidFile = Join-Path $runtimeDir "ngrok.pid"
$cloudflaredPidFile = Join-Path $runtimeDir "cloudflared.pid"
$localhostRunPidFile = Join-Path $runtimeDir "localhostrun.pid"
$serverOut = Join-Path $runtimeDir "server.out.log"
$serverErr = Join-Path $runtimeDir "server.err.log"
$ngrokOut = Join-Path $runtimeDir "ngrok.out.log"
$ngrokErr = Join-Path $runtimeDir "ngrok.err.log"
$cloudflaredOut = Join-Path $runtimeDir "cloudflared.out.log"
$cloudflaredErr = Join-Path $runtimeDir "cloudflared.err.log"
$localhostRunOut = Join-Path $runtimeDir "localhostrun.out.log"
$localhostRunErr = Join-Path $runtimeDir "localhostrun.err.log"

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Stop-If-Running([string]$pidFilePath) {
  if (Test-Path $pidFilePath) {
    $existingPid = [int](Get-Content $pidFilePath)
    $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $existingPid -Force
    }
    Remove-Item $pidFilePath -Force
  }
}

function Resolve-NgrokExe {
  $localBundled = Join-Path $projectRoot "tools\ngrok\ngrok.exe"
  if (Test-Path $localBundled) {
    return $localBundled
  }

  $cmd = Get-Command ngrok -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $fallback = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
  if (Test-Path $fallback) {
    return $fallback
  }

  throw "ngrok is not installed. Install: winget install --id Ngrok.Ngrok -e"
}

Stop-If-Running -pidFilePath $serverPidFile
Stop-If-Running -pidFilePath $ngrokPidFile
Stop-If-Running -pidFilePath $cloudflaredPidFile
Stop-If-Running -pidFilePath $localhostRunPidFile

if (Test-Path $serverOut) { Remove-Item $serverOut -Force }
if (Test-Path $serverErr) { Remove-Item $serverErr -Force }
if (Test-Path $ngrokOut) { Remove-Item $ngrokOut -Force }
if (Test-Path $ngrokErr) { Remove-Item $ngrokErr -Force }
if (Test-Path $cloudflaredOut) { Remove-Item $cloudflaredOut -Force }
if (Test-Path $cloudflaredErr) { Remove-Item $cloudflaredErr -Force }
if (Test-Path $localhostRunOut) { Remove-Item $localhostRunOut -Force }
if (Test-Path $localhostRunErr) { Remove-Item $localhostRunErr -Force }

$serverProc = Start-Process -FilePath "node.exe" -ArgumentList "src/index.js" -WorkingDirectory $projectRoot -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru
Set-Content -Path $serverPidFile -Value $serverProc.Id

Start-Sleep -Seconds 2
try {
  $null = Invoke-RestMethod "http://localhost:$Port/health"
} catch {
  throw "Backend is not responding on http://localhost:$Port"
}

$publicUrl = $null
$tunnelProvider = $null

try {
  $ngrokExe = Resolve-NgrokExe
  $ngrokProc = Start-Process -FilePath $ngrokExe -ArgumentList "http", "$Port", "--log=stdout", "--log-format=logfmt" -WorkingDirectory $projectRoot -RedirectStandardOutput $ngrokOut -RedirectStandardError $ngrokErr -PassThru
  Set-Content -Path $ngrokPidFile -Value $ngrokProc.Id

  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $tunnels = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels"
      if ($tunnels.tunnels) {
        $publicUrl = ($tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1).public_url
        if ($publicUrl) {
          $tunnelProvider = "ngrok"
          break
        }
      }
    } catch {
    }
  }
} catch {
}

if (-not $publicUrl) {
  if (Test-Path $ngrokPidFile) {
    Stop-If-Running -pidFilePath $ngrokPidFile
  }

  $cloudflaredExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
  if (-not (Test-Path $cloudflaredExe)) {
    throw "No tunnel provider available. Install cloudflared or fix ngrok auth/policy."
  }

  $cfProc = Start-Process -FilePath $cloudflaredExe -ArgumentList "tunnel", "--url", "http://localhost:$Port", "--no-autoupdate", "--protocol", "http2", "--loglevel", "info" -WorkingDirectory $projectRoot -RedirectStandardOutput $cloudflaredOut -RedirectStandardError $cloudflaredErr -PassThru
  Set-Content -Path $cloudflaredPidFile -Value $cfProc.Id

  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $cloudflaredErr) {
      $match = Select-String -Path $cloudflaredErr -Pattern "https://[-a-zA-Z0-9]+\.trycloudflare\.com" -AllMatches
      if ($match) {
        $publicUrl = $match.Matches.Value | Select-Object -Last 1
        if ($publicUrl) {
          $tunnelProvider = "cloudflared"
          break
        }
      }
    }
  }
}

if ($publicUrl -and $tunnelProvider -eq "cloudflared") {
  $okCount = 0
  for ($i = 0; $i -lt 3; $i++) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod "$publicUrl/health"
      if ($health.ok -eq $true) {
        $okCount++
      }
    } catch {
    }
  }

  if ($okCount -lt 2) {
    Stop-If-Running -pidFilePath $cloudflaredPidFile
    $publicUrl = $null
    $tunnelProvider = $null
  }
}

if (-not $publicUrl) {
  $sshExe = "C:\Windows\System32\OpenSSH\ssh.exe"
  if (Test-Path $sshExe) {
    $args = @(
      "-o", "StrictHostKeyChecking=no",
      "-o", "ServerAliveInterval=30",
      "-R", "80:localhost:$Port",
      "nokey@localhost.run"
    )
    $lrProc = Start-Process -FilePath $sshExe -ArgumentList $args -WorkingDirectory $projectRoot -RedirectStandardOutput $localhostRunOut -RedirectStandardError $localhostRunErr -PassThru
    Set-Content -Path $localhostRunPidFile -Value $lrProc.Id

    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 1
      if (Test-Path $localhostRunOut) {
        $match = Select-String -Path $localhostRunOut -Pattern "([a-zA-Z0-9-]+\.)+lhr\.life" -AllMatches
        if ($match) {
          $host = $match.Matches.Value | Select-Object -Last 1
          if ($host) {
            $publicUrl = "https://$host"
            $tunnelProvider = "localhost.run"
            break
          }
        }
      }
    }
  }
}

if (-not $publicUrl) {
  Write-Host "Failed to expose public URL. Check logs:"
  Write-Host $ngrokOut
  Write-Host $ngrokErr
  Write-Host $cloudflaredOut
  Write-Host $cloudflaredErr
  Write-Host $localhostRunOut
  Write-Host $localhostRunErr
  exit 1
}

Write-Host "Backend: http://localhost:$Port"
Write-Host "Tunnel: $tunnelProvider"
Write-Host "Mini App URL: $publicUrl"
