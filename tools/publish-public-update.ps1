param(
    [string] $Hash = "public-" + (Get-Date -Format "yyyyMMddHHmmss"),
    [string] $Version = "1.3.8",
    [string] $Message = "o2cord public update",
    [string] $ManifestUrl = "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/manifest.json",
    [string] $RawBaseUrl = "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public"
)

$ErrorActionPreference = "Stop"

function Assert-LastCommand([string] $Label) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root "o2cord-source"
$Installer = Join-Path $Root "installer"
$PublicDist = Join-Path $Root "build-artifacts\dist-public"
$UpdatePublic = Join-Path $Root "update-package\public"
$UpdateFiles = Join-Path $UpdatePublic "files"
$Payload = Join-Path $Installer "payload\dist.zip"
$Ready = Join-Path $Installer "ready"

Push-Location $Source
try {
    Remove-Item Env:O2CORD_DEBUG -ErrorAction SilentlyContinue
    Remove-Item Env:O2CORD_USSRO2_REGISTRY_URL -ErrorAction SilentlyContinue
    $env:O2CORD_UPDATE_MANIFEST = $ManifestUrl
    $env:VENCORD_HASH = $Hash
    $env:VENCORD_REMOTE = "2VTA/o2cord"

    node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs
    Assert-LastCommand "o2cord public build"

    # koffi (native DWM/acrylic bindings) is marked external in esbuild, so
    # its runtime files need to ship alongside patcher.js as a real
    # node_modules folder for `require("koffi")` to resolve after extraction.
    $KoffiDest = Join-Path $Source "dist\node_modules"
    New-Item -ItemType Directory -Force -Path (Join-Path $KoffiDest "@koromix") | Out-Null
    Copy-Item -LiteralPath (Join-Path $Source "node_modules\koffi") -Destination (Join-Path $KoffiDest "koffi") -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $Source "node_modules\@koromix\koffi-win32-x64") -Destination (Join-Path $KoffiDest "@koromix\koffi-win32-x64") -Recurse -Force
} finally {
    Pop-Location
}

if (Test-Path -LiteralPath $PublicDist) {
    Remove-Item -LiteralPath $PublicDist -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $Source "dist") -Destination $PublicDist -Recurse -Force

New-Item -ItemType Directory -Force -Path $UpdateFiles, (Split-Path -Parent $Payload), $Ready | Out-Null
foreach ($Name in "patcher.js", "preload.js", "renderer.js", "renderer.css") {
    Copy-Item -LiteralPath (Join-Path $PublicDist $Name) -Destination (Join-Path $UpdateFiles $Name) -Force
}

$Manifest = [ordered]@{
    version = $Version
    hash = $Hash
    author = "o2cord"
    message = $Message
    notes = @(
        "Public o2cord update package",
        "ussro2 backgrounds are loaded from backgrounds.json beside this manifest",
        "ProfileTheme images are loaded from profile-themes.json beside this manifest",
        "o2cord shared badges are loaded from badges.json beside this manifest"
    )
    files = [ordered]@{
        "patcher.js" = "$RawBaseUrl/files/patcher.js"
        "preload.js" = "$RawBaseUrl/files/preload.js"
        "renderer.js" = "$RawBaseUrl/files/renderer.js"
        "renderer.css" = "$RawBaseUrl/files/renderer.css"
    }
}

$ManifestPath = Join-Path $UpdatePublic "manifest.json"
$ManifestJson = $Manifest | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

$Zip = Join-Path $UpdatePublic "public-update-files.zip"
if (Test-Path -LiteralPath $Zip) {
    Remove-Item -LiteralPath $Zip -Force
}
Compress-Archive -Path (Join-Path $UpdateFiles "*") -DestinationPath $Zip -Force

if (Test-Path -LiteralPath $Payload) {
    Remove-Item -LiteralPath $Payload -Force
}
Compress-Archive -Path (Join-Path $PublicDist "*") -DestinationPath $Payload -Force

dotnet publish $Installer -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o (Join-Path $Installer "out-public-github")
Assert-LastCommand "Public installer publish"
Copy-Item -LiteralPath (Join-Path $Installer "out-public-github\o2cord-Installer.exe") -Destination (Join-Path $Ready "o2cord-Installer-Public.exe") -Force

Write-Host "Built public update $Hash"
Write-Host "Manifest: $(Join-Path $UpdatePublic "manifest.json")"
Write-Host "Installer: $(Join-Path $Ready "o2cord-Installer-Public.exe")"
