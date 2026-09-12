[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$manifestRoot = Join-Path $env:LOCALAPPDATA 'POP\NativeMessaging'
$manifestPath = Join-Path $manifestRoot 'dev.pop.companion.json'
$profile = if ($Configuration -eq 'Release') { 'release' } else { 'debug' }
$hostPath = Join-Path $projectRoot "apps\desktop\src-tauri\target\$profile\pop-native-host.exe"
$extensionId = 'fpkepfajehdejjbccjaecmbmdepkaddf'

Push-Location $projectRoot
try {
    pnpm --filter @pop/chrome-extension build
    $cargoArgs = @('build', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml', '--bin', 'pop-native-host')
    if ($Configuration -eq 'Release') { $cargoArgs += '--release' }
    & cargo @cargoArgs
    if ($LASTEXITCODE -ne 0) { throw 'The POP native host did not build.' }
}
finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path $manifestRoot | Out-Null
$manifest = [ordered]@{
    name = 'dev.pop.companion'
    description = 'Authenticated bridge between the POP X adapter and POP Core.'
    path = $hostPath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$extensionId/")
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8

$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\dev.pop.companion'
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath

$extensionPath = Join-Path $projectRoot 'apps\chrome-extension\dist\chrome-mv3'
Write-Host 'POP native messaging is registered for the current Windows user.'
Write-Host "Load this folder once at chrome://extensions: $extensionPath"
Write-Host "Expected stable extension ID: $extensionId"
