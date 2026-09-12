[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$debugExecutable = Join-Path $projectRoot 'apps\desktop\src-tauri\target\debug\pop-desktop.exe'
$devPort = 1420

$desktopProcesses = Get-CimInstance Win32_Process -Filter "Name = 'pop-desktop.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $debugExecutable }

foreach ($process in $desktopProcesses) {
    Write-Host "Stopping POP desktop runtime (PID $($process.ProcessId))."
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$portOwners = Get-NetTCPConnection -LocalPort $devPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $portOwners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    $isProjectVite = $null -ne $process -and
        $process.Name -eq 'node.exe' -and
        $process.CommandLine -like "*$projectRoot*" -and
        $process.CommandLine -like '*vite*'
    if ($isProjectVite) {
        Write-Host "Stopping POP development server (PID $processId)."
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    } else {
        Write-Warning "Port $devPort belongs to another process (PID $processId); it was not stopped."
    }
}

Write-Host 'POP development processes are stopped.'
