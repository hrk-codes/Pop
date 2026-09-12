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
    cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --release --bin pop-native-host
    pnpm --filter @pop/desktop tauri build
}
finally {
    Pop-Location
}
