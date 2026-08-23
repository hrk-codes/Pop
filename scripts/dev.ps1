[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'

if (Test-Path -LiteralPath $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}

Push-Location $projectRoot
try {
    pnpm --filter @pop/desktop tauri:dev
}
finally {
    Pop-Location
}
