[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'

if (Test-Path -LiteralPath $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}

function Get-ToolVersion {
    param(
        [Parameter(Mandatory)]
        [string]$Command,

        [string[]]$Arguments = @('--version')
    )

    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        return $null
    }

    return (& $Command @Arguments 2>&1 | Select-Object -First 1).ToString().Trim()
}

$requiredTools = @('git', 'node', 'pnpm', 'rustup', 'rustc', 'cargo')
$missingRequired = @()

Write-Host 'POP desktop toolchain'
foreach ($tool in $requiredTools) {
    $version = Get-ToolVersion -Command $tool
    if ($null -eq $version) {
        $missingRequired += $tool
        Write-Host "  [missing] $tool"
    }
    else {
        Write-Host "  [ready]   $version"
    }
}

if ($missingRequired.Count -gt 0) {
    throw "Install required POP tools: $($missingRequired -join ', ')"
}

$vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswherePath) {
    $buildToolsPath = & $vswherePath -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($buildToolsPath) {
        Write-Host "  [ready]   Visual Studio C++ tools: $buildToolsPath"
    }
    else {
        throw 'Visual Studio C++ Build Tools were not detected.'
    }
}
else {
    throw 'Visual Studio Installer detection is unavailable.'
}

if (-not $SkipInstall) {
    Push-Location $projectRoot
    try {
        pnpm install
    }
    finally {
        Pop-Location
    }
}

Write-Host 'POP setup complete. Run: .\scripts\dev.ps1'
