[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd('\')
$targets = @(
    (Join-Path $projectRoot 'node_modules'),
    (Join-Path $projectRoot 'packages\shared\node_modules'),
    (Join-Path $projectRoot 'packages\shared\coverage'),
    (Join-Path $projectRoot 'packages\shared\dist')
)

foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target)) {
        continue
    }

    $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
    if (-not $resolvedTarget.StartsWith("$projectRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove path outside the project: $resolvedTarget"
    }

    if ($PSCmdlet.ShouldProcess($resolvedTarget, 'Remove generated project output')) {
        Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
    }
}
