[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
    Write-Host 'No runnable application exists in Phase 0. Workspace development scripts will be added by later phases.'
    pnpm --recursive --if-present dev
}
finally {
    Pop-Location
}
