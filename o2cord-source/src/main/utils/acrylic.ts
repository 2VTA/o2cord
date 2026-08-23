/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow } from "electron";
import { release } from "os";

// DWMWA_SYSTEMBACKDROP_TYPE only exists on Windows 11 22H2+ (build 22621+).
// Electron's own `backgroundMaterial` window option is unreliable on some
// builds/setups, so this calls DWM directly - the same technique tools like
// MicaForEveryone use - as a stronger, more direct enforcement of it.
const MIN_BUILD_FOR_BACKDROP = 22621;
const DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWA_SYSTEMBACKDROP_TYPE = 38;

const BACKDROP_TYPES: Record<string, number> = {
    none: 1, // DWMSBT_NONE
    mica: 2, // DWMSBT_MAINWINDOW
    acrylic: 3, // DWMSBT_TRANSIENTWINDOW
    tabbed: 4 // DWMSBT_TABBEDWINDOW
};

// DWMWCP_ROUND - matches the rounded corners every other Mica/Acrylic
// Windows 11 app has (MicaForEveryone included); without this the window
// keeps its sharp default corners and looks out of place next to the blur.
const DWMWCP_ROUND = 2;

let dwmSetWindowAttribute: ((handle: Buffer, attr: number, value: number[], size: number) => number) | null | undefined;

function getDwmSetWindowAttribute() {
    if (dwmSetWindowAttribute !== undefined) return dwmSetWindowAttribute;

    try {
        // Lazily required: koffi is a native module and this file is only
        // ever exercised on win32, so avoid paying its load cost elsewhere.
        const koffi = require("koffi");
        const dwm = koffi.load("dwmapi.dll");
        dwmSetWindowAttribute = dwm.func("DwmSetWindowAttribute", "long", ["void *", "int", "void *", "uint"]);
    } catch {
        dwmSetWindowAttribute = null;
    }

    return dwmSetWindowAttribute;
}

function getWindowsBuildNumber() {
    const parts = release().split(".");
    return parseInt(parts[2], 10) || 0;
}

/**
 * Best-effort only. Never throws - any failure here should just mean no
 * acrylic/mica effect, not a crashed client.
 */
export function applyNativeBackdrop(win: BrowserWindow, material: string) {
    if (process.platform !== "win32") return;
    if (getWindowsBuildNumber() < MIN_BUILD_FOR_BACKDROP) return;

    const backdropType = BACKDROP_TYPES[material];
    if (backdropType == null) return;

    try {
        const setAttribute = getDwmSetWindowAttribute();
        if (!setAttribute) return;

        const handle = win.getNativeWindowHandle();
        setAttribute(handle, DWMWA_SYSTEMBACKDROP_TYPE, [backdropType], 4);
        setAttribute(handle, DWMWA_USE_IMMERSIVE_DARK_MODE, [1], 4);
        setAttribute(handle, DWMWA_WINDOW_CORNER_PREFERENCE, [DWMWCP_ROUND], 4);
    } catch {
        // Swallow - see doc comment above.
    }
}
