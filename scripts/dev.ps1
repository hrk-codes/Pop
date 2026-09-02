[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
$devPort = 1420

if (Test-Path -LiteralPath $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}

function Get-DevServerOwnerIds {
    return @(
        Get-NetTCPConnection -LocalPort $devPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

function Test-IsPopDevServer {
    param(
        [Parameter(Mandatory)]
        [int]$ProcessId
    )

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    return $null -ne $process -and
        $process.Name -eq 'node.exe' -and
        $process.CommandLine -like "*$projectRoot*" -and
        $process.CommandLine -like '*vite*'
}

function Get-ProjectDesktopProcessIds {
    $debugExecutable = Join-Path $projectRoot 'apps\desktop\src-tauri\target\debug\pop-desktop.exe'
    return @(
        Get-CimInstance Win32_Process -Filter "Name = 'pop-desktop.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.ExecutablePath -eq $debugExecutable } |
            Select-Object -ExpandProperty ProcessId -Unique
    )
}

foreach ($desktopId in (Get-ProjectDesktopProcessIds)) {
    Write-Host "Stopping abandoned POP desktop runtime (PID $desktopId)."
    Stop-Process -Id $desktopId -Force
}

$existingOwners = Get-DevServerOwnerIds
if ($existingOwners.Count -gt 0) {
    foreach ($ownerId in $existingOwners) {
        if (-not (Test-IsPopDevServer -ProcessId $ownerId)) {
            throw "Port $devPort is used by process $ownerId, which is not a POP development server."
        }

        Write-Host "Stopping abandoned POP development server (PID $ownerId)."
        Stop-Process -Id $ownerId -Force
    }
}

Push-Location $projectRoot
try {
    pnpm --filter @pop/desktop tauri:dev
}
finally {
    foreach ($ownerId in (Get-DevServerOwnerIds)) {
        if (Test-IsPopDevServer -ProcessId $ownerId) {
            Write-Host "Stopping POP development server (PID $ownerId)."
            Stop-Process -Id $ownerId -Force -ErrorAction SilentlyContinue
        }
    }

    Pop-Location
}
