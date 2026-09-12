$ErrorActionPreference = 'Stop'
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\dev.pop.companion'
$manifestRoot = Join-Path $env:LOCALAPPDATA 'POP\NativeMessaging'
if (Test-Path -LiteralPath $registryPath) { Remove-Item -LiteralPath $registryPath -Recurse -Force }
if (Test-Path -LiteralPath $manifestRoot) { Remove-Item -LiteralPath $manifestRoot -Recurse -Force }
Write-Host 'POP native messaging registration was removed.'
