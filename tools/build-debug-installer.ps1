# Rebuilds installer\ready\o2cord-Installer-Debug.exe from the CURRENT
# source tree - unlike publish-public-update.ps1, this one does NOT strip
# any plugin out first, so private/local-only plugins (e.g.
# accountSwitcher.desktop) are baked in too. This installer is never
# distributed - it's what debug-build.ps1 falls back to for re-patching
# Discord Canary's app.asar after it auto-updates, and it's how Ryder keeps
# a standalone copy of tonight's full debug build (private plugins
# included) that survives even if the source tree gets reset again.
#
# Same env vars as debug-build.ps1's own build step (real manifest URL +
# a throwaway unique hash + --disable-updater) so this installer's baked-in
# dist files behave the same way a normal debug-build.ps1 run would - no
# accidental auto-update fighting a locally patched build.

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root "o2cord-source"
$Installer = Join-Path $Root "installer"
$DebugDist = Join-Path $Root "build-artifacts\dist-debug"
$Payload = Join-Path $Installer "payload\dist.zip"
$Ready = Join-Path $Installer "ready"

function Assert-LastCommand([string] $Label) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

Write-Host "== Building full debug bundle (all plugins, including private/local-only ones) ==" -ForegroundColor Cyan
Push-Location $Source
try {
    $env:O2CORD_UPDATE_MANIFEST = "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/manifest.json"
    $env:VENCORD_HASH = "public-" + (Get-Date -Format "yyyyMMddHHmmss")
    $env:VENCORD_REMOTE = "2VTA/o2cord"

    node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --disable-updater
    Assert-LastCommand "o2cord debug build"

    # koffi (native DWM/acrylic bindings) is marked external in esbuild, so
    # its runtime files need to ship alongside patcher.js as a real
    # node_modules folder for `require("koffi")` to resolve after extraction.
    $KoffiDest = Join-Path $Source "dist\node_modules"
    New-Item -ItemType Directory -Force -Path (Join-Path $KoffiDest "@koromix") | Out-Null
    Copy-Item -LiteralPath (Join-Path $Source "node_modules\koffi") -Destination (Join-Path $KoffiDest "koffi") -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $Source "node_modules\@koromix\koffi-win32-x64") -Destination (Join-Path $KoffiDest "@koromix\koffi-win32-x64") -Recurse -Force
} finally {
    Remove-Item Env:O2CORD_UPDATE_MANIFEST -ErrorAction SilentlyContinue
    Remove-Item Env:VENCORD_HASH -ErrorAction SilentlyContinue
    Remove-Item Env:VENCORD_REMOTE -ErrorAction SilentlyContinue
    Pop-Location
}

if (Test-Path -LiteralPath $DebugDist) {
    Remove-Item -LiteralPath $DebugDist -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $Source "dist") -Destination $DebugDist -Recurse -Force

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Payload), $Ready | Out-Null
if (Test-Path -LiteralPath $Payload) {
    Remove-Item -LiteralPath $Payload -Force
}
Compress-Archive -Path (Join-Path $DebugDist "*") -DestinationPath $Payload -Force

dotnet publish $Installer -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o (Join-Path $Installer "out-debug-local")
Assert-LastCommand "Debug installer publish"

Copy-Item -LiteralPath (Join-Path $Installer "out-debug-local\o2cord-Installer.exe") -Destination (Join-Path $Ready "o2cord-Installer-Debug.exe") -Force
$PdbSrc = Join-Path $Installer "out-debug-local\o2cord-Installer.pdb"
if (Test-Path -LiteralPath $PdbSrc) {
    Copy-Item -LiteralPath $PdbSrc -Destination (Join-Path $Ready "o2cord-Installer-Debug.pdb") -Force
}

Write-Host "Built debug installer (all plugins, private ones included)" -ForegroundColor Green
Write-Host "Installer: $(Join-Path $Ready "o2cord-Installer-Debug.exe")" -ForegroundColor Green
