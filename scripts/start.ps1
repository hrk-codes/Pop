[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$desktopPath = Join-Path $projectRoot 'apps\desktop\src-tauri\target\release\pop-desktop.exe'
$hostPath = Join-Path $projectRoot 'apps\desktop\src-tauri\target\release\pop-native-host.exe'

if (-not (Test-Path -LiteralPath $desktopPath) -or -not (Test-Path -LiteralPath $hostPath)) {
    throw 'The POP release is not built. Run .\scripts\build.ps1 once, then run this command again.'
}

& (Join-Path $projectRoot 'scripts\register-native-host.ps1') -Configuration Release -SkipBuild

$desktopProcesses = @(
    Get-CimInstance Win32_Process -Filter "Name = 'pop-desktop.exe'" -ErrorAction SilentlyContinue
)
$running = $desktopProcesses | Where-Object { $_.ExecutablePath -eq $desktopPath }

if ($running) {
    Write-Host 'POP is already running. Use its tray icon to show and resume it.'
    return
}

if ($desktopProcesses.Count -gt 0) {
    throw 'A different POP build is running. Stop the development terminal or choose Quit POP from the tray, then try again.'
}

Start-Process -FilePath $desktopPath
Write-Host 'POP is running independently. This terminal can now be closed.'
