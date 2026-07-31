$ErrorActionPreference = "SilentlyContinue"

$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
$canaryRoot = Join-Path $localAppData "DiscordCanary"
$installer = Join-Path $PSScriptRoot "o2cord-Installer-Debug.exe"
$logDir = Join-Path $localAppData "o2cord"
$logPath = Join-Path $logDir "canary-auto-repair.log"

function Write-AutoRepairLog {
    param([string] $Message)

    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

function Test-O2cordLoader {
    param([string] $Resources)

    $appAsar = Join-Path $Resources "app.asar"
    $package = Join-Path $appAsar "package.json"
    $index = Join-Path $appAsar "index.js"

    if (-not (Test-Path -LiteralPath $appAsar -PathType Container)) { return $false }
    if (-not (Test-Path -LiteralPath $package -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath $index -PathType Leaf)) { return $false }

    $packageText = Get-Content -LiteralPath $package -Raw
    $indexText = Get-Content -LiteralPath $index -Raw

    return $packageText -match "o2cord" -and $indexText -match "patcher\.js"
}

function Get-LatestCanaryResources {
    if (-not (Test-Path -LiteralPath $canaryRoot -PathType Container)) { return $null }

    $latestApp = Get-ChildItem -LiteralPath $canaryRoot -Directory -Filter "app-*" |
        Sort-Object Name -Descending |
        Select-Object -First 1

    if (-not $latestApp) { return $null }

    $resources = Join-Path $latestApp.FullName "resources"
    if (Test-Path -LiteralPath $resources -PathType Container) { return $resources }

    return $null
}

$resources = Get-LatestCanaryResources
if (-not $resources) {
    Write-AutoRepairLog "Discord Canary resources folder was not found."
    exit 0
}

if (Test-O2cordLoader $resources) {
    Write-AutoRepairLog "Canary is already patched: $resources"
    exit 0
}

if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    Write-AutoRepairLog "Installer missing: $installer"
    exit 1
}

Write-AutoRepairLog "Canary is not patched. Running installer for: $resources"
$process = Start-Process -FilePath $installer -ArgumentList "--install", "--target=canary" -Wait -PassThru -WindowStyle Hidden

if ($process.ExitCode -eq 0) {
    Write-AutoRepairLog "Installer completed successfully."
    exit 0
}

Write-AutoRepairLog "Installer failed with exit code $($process.ExitCode)."
exit $process.ExitCode
