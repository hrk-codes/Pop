[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

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

$requiredTools = @('git', 'node', 'pnpm')
$missingRequired = @()

Write-Host 'POP Phase 0 toolchain'
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
    throw "Install required Phase 0 tools: $($missingRequired -join ', ')"
}

Write-Host 'POP Phase 1 native prerequisites'
foreach ($tool in @('rustup', 'rustc', 'cargo')) {
    $version = Get-ToolVersion -Command $tool
    if ($null -eq $version) {
        Write-Warning "$tool was not found. Install it before Phase 1."
    }
    else {
        Write-Host "  [ready]   $version"
    }
}

$vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswherePath) {
    $buildToolsPath = & $vswherePath -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($buildToolsPath) {
        Write-Host "  [ready]   Visual Studio C++ tools: $buildToolsPath"
    }
    else {
        Write-Warning 'Visual Studio C++ Build Tools were not detected. Install them before Phase 1.'
    }
}
else {
    Write-Warning 'Visual Studio Installer detection is unavailable. Confirm C++ Build Tools manually before Phase 1.'
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

Write-Host 'Phase 0 setup complete. Run: pnpm check'
