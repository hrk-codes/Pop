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
    pnpm build
    pnpm --filter @pop/desktop tauri build --no-bundle
}
finally {
    Pop-Location
}
