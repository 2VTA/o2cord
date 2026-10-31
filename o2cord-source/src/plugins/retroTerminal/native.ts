/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Main-process half of RetroTerminal: restyles Discord's small updater
 * window ("splash", the 300x350 box with the logo and "Checking for
 * updates…") as a CRT terminal.
 *
 * That window opens before the renderer (and so before any account check),
 * so the renderer leaves the stylesheet in a file while the theme is on for
 * an allowed account, and deletes it when the theme goes off. On the next
 * launch this file decides: present -> retro splash, absent -> Discord's own.
 */

import { DATA_DIR } from "@main/utils/constants";
import { app, IpcMainInvokeEvent } from "electron";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const SPLASH_CSS = join(DATA_DIR, "o2-retro-splash.css");
const MAX_BYTES = 256 * 1024;

// The retro look on Discord's updater window. It used to keep that window
// (and the main window behind it) up for at least 5s, which made startup
// feel slow - now Discord opens the main window the moment it's ready.
app.on("browser-window-created", (_, win) => {
    const wc = win.webContents;
    wc.on("dom-ready", () => {
        // Only Discord's updater window - resources/_app.asar/splash/index.html.
        if (!/\/splash\/index\.html$/i.test(wc.getURL())) return;
        let css: string;
        try {
            css = readFileSync(SPLASH_CSS, "utf8");
        } catch {
            return; // theme off / not an allowed account -> leave it alone
        }
        if (!css || css.length > MAX_BYTES) return;
        wc.insertCSS(css).catch(() => { });
    });
});

export function setSplashCss(_: IpcMainInvokeEvent, css: unknown) {
    if (typeof css === "string" && css.length > 0 && css.length <= MAX_BYTES) {
        writeFileSync(SPLASH_CSS, css);
    } else {
        rmSync(SPLASH_CSS, { force: true });
    }
}
