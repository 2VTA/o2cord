# o2cord

Custom o2cord source, installer, and public update files.

## Public updater

Public builds read updates from:

`https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/manifest.json`

The public `ussro2` backgrounds are read from:

`https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/backgrounds.json`

The public `ProfileTheme` images are read from:

`https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/profile-themes.json`

After users install a public build that contains this manifest URL, they can update from Discord:

`Settings -> o2cord -> Updater -> Check for Updates -> Install Update`

## Build public update package

Run from this folder:

```powershell
.\tools\publish-public-update.ps1
```

This builds the public renderer files, updates `update-package/public/manifest.json`, and rebuilds the public installer.
