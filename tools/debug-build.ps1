# Local dev "debug build" - builds o2cord with the real update manifest
# baked in (not a placeholder), re-patches the target Discord channel if it
# auto-updated since the last patch, THEN syncs the 4 live dist files into
# the installed o2cord/dist folder, then fully restarts that channel with
# --remote-debugging-port=9222 so it's ready for live CDP testing again.
#
# Defaults to PTB now - that's where most of the work happens going
# forward (Ryder moved his day-to-day o2cord install from Canary to PTB).
# Pass -Channel canary to target Canary instead; anything else this script
# touches (process name, install folder, --target flag for the installer)
# derives from this one parameter.
#
# Order matters here: the installer carries its OWN bundled copy of the dist
# files (baked in whenever o2cord-Installer-Debug.exe itself was last built)
# and overwrites %LOCALAPPDATA%\o2cord\dist with that copy as part of
# patching app.asar. If dist sync ran before the installer, any re-patch
# would silently clobber today's build back to whatever was bundled in the
# installer - which is exactly what caused fixes to "revert" after Discord
# auto-updated mid-session. Sync now always runs LAST, after any install
# step, so it's the final word on what's actually loaded.
#
# Also uses the call operator (&) instead of Start-Process -Wait to run the
# installer - Start-Process -Wait can return before a self-elevating (UAC)
# child process actually finishes, leaving the caller waiting on the wrong
# handle. Direct invocation blocks on the real process exit.

param(
    [ValidateSet("ptb", "canary")]
    [string] $Channel = "ptb"
)

$ErrorActionPreference = "Stop"

$ProcessName = if ($Channel -eq "ptb") { "DiscordPTB" } else { "DiscordCanary" }

$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root "o2cord-source"
$LocalDist = Join-Path $env:LOCALAPPDATA "o2cord\dist"

Write-Host "== Building with real update manifest ==" -ForegroundColor Cyan
Push-Location $Source
try {
    # --disable-updater is the actual fix here, not just a nice-to-have: every
    # local dev build gets a unique throwaway VENCORD_HASH (below), which can
    # never match whatever hash is in the manifest currently published on
    # GitHub. Without this flag, o2cord's own auto-updater (src/Vencord.ts
    # runUpdateCheck, runs on every startup + every 30 min) treats that
    # mismatch as "outdated", silently downloads the GitHub-published build
    # over today's dist files, and force-relaunches - which is exactly what
    # made tonight's fixes keep "reverting" a few minutes after every deploy.
    $env:O2CORD_UPDATE_MANIFEST = "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/manifest.json"
    $env:VENCORD_HASH = "public-" + (Get-Date -Format "yyyyMMddHHmmss")
    $env:VENCORD_REMOTE = "2VTA/o2cord"
    node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --disable-updater
    if ($LASTEXITCODE -ne 0) { throw "build failed" }
} finally {
    Remove-Item Env:O2CORD_UPDATE_MANIFEST -ErrorAction SilentlyContinue
    Remove-Item Env:VENCORD_HASH -ErrorAction SilentlyContinue
    Remove-Item Env:VENCORD_REMOTE -ErrorAction SilentlyContinue
    Pop-Location
}

Write-Host "== Stopping $ProcessName ==" -ForegroundColor Cyan
Stop-Process -Name $ProcessName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$ChannelRoot = Join-Path $env:LOCALAPPDATA $ProcessName
$LatestApp = Get-ChildItem -LiteralPath $ChannelRoot -Directory -Filter "app-*" |
    Sort-Object Name -Descending | Select-Object -First 1

# If this Discord build was auto-updated since the last time o2cord was
# installed, its app.asar won't have the o2cord loader hook - re-run the
# installer against it first, same as the scheduled auto-repair task does.
$AppAsarIndex = Join-Path $LatestApp.FullName "resources\app.asar\index.js"
$IsPatched = (Test-Path $AppAsarIndex) -and ((Get-Content -LiteralPath $AppAsarIndex -Raw) -match "patcher\.js")
if (-not $IsPatched) {
    Write-Host "== Discord updated since last patch - re-patching ==" -ForegroundColor Yellow
    $Installer = Join-Path $Root "installer\ready\o2cord-Installer-Debug.exe"
    & $Installer --install --target=$Channel
    if ($LASTEXITCODE -ne 0) { throw "installer failed with exit code $LASTEXITCODE" }

    # The installer's own post-install step launches Discord itself (without
    # our debug flag) - that instance holds the single-instance lock, so our
    # own launch below would silently do nothing but focus it. Kill it first.
    Write-Host "== Stopping installer's own auto-launch ==" -ForegroundColor Cyan
    Stop-Process -Name $ProcessName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# The app-* folder name isn't reliable on its own - Discord can leave a
# newer-numbered folder behind from an interrupted/failed background update
# that it doesn't actually consider current. SquirrelSetup.log's last
# "About to launch" line is what Discord's own updater actually uses, so
# prefer that over alphabetical sorting when it's available.
$SquirrelLog = Join-Path $ChannelRoot "SquirrelSetup.log"
$LatestApp = $null
if (Test-Path $SquirrelLog) {
    $lastLaunchLine = Get-Content -LiteralPath $SquirrelLog -Tail 50 |
        Where-Object { $_ -match "About to launch: '(.+$ProcessName\.exe)'" } |
        Select-Object -Last 1
    if ($lastLaunchLine -match "About to launch: '(.+)\\$ProcessName\.exe'") {
        $candidate = $Matches[1]
        if (Test-Path (Join-Path $candidate "$ProcessName.exe")) {
            $LatestApp = Get-Item -LiteralPath $candidate
        }
    }
}
if (-not $LatestApp) {
    $LatestApp = Get-ChildItem -LiteralPath $ChannelRoot -Directory -Filter "app-*" |
        Sort-Object Name -Descending | Select-Object -First 1
}

Write-Host "== Syncing dist files into $LocalDist ==" -ForegroundColor Cyan
# Copy-Item silently "succeeding" while stale content still ends up loaded
# was observed tonight more than once - don't trust timing assumptions.
# Force-kill immediately before the copy (not just earlier in the script,
# where an install step or Discord's own crash-recovery can have silently
# relaunched it since), wait for zero processes, then verify byte-for-byte
# afterward and fail loudly if the copy didn't actually take.
Stop-Process -Name $ProcessName -Force -ErrorAction SilentlyContinue
for ($i = 0; $i -lt 10; $i++) {
    if (-not (Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Seconds 1
}
if (Get-Process -Name $ProcessName -ErrorAction SilentlyContinue) {
    throw "$ProcessName is still running after 10s - can't safely sync dist files."
}

foreach ($file in "patcher.js", "preload.js", "renderer.js", "renderer.css") {
    $src = Join-Path $Source "dist\$file"
    $dst = Join-Path $LocalDist $file
    Copy-Item -LiteralPath $src -Destination $dst -Force
    $srcHash = (Get-FileHash -LiteralPath $src -Algorithm SHA1).Hash
    $dstHash = (Get-FileHash -LiteralPath $dst -Algorithm SHA1).Hash
    if ($srcHash -ne $dstHash) { throw "Sync verification failed for $file - copied file doesn't match source." }
}
Write-Host "== Sync verified (hash match on all 4 files) ==" -ForegroundColor Green

Write-Host "== Launching $($LatestApp.Name) with debug port ==" -ForegroundColor Cyan
$Exe = Join-Path $LatestApp.FullName "$ProcessName.exe"
Start-Process -FilePath $Exe -ArgumentList "--remote-debugging-port=9222"
Write-Host "Done. $ProcessName is restarting with the fresh build." -ForegroundColor Green
