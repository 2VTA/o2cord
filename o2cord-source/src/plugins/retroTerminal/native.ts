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
import { app, BrowserWindow, IpcMainInvokeEvent } from "electron";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const SPLASH_CSS = join(DATA_DIR, "o2-retro-splash.css");
const MAX_BYTES = 256 * 1024;

// Ryder wanted the retro updater window up for ~5s instead of the usual
// blink. Discord destroys it the moment the main window is ready and shows
// the main window right after, so both are held until this long after the
// updater window opened. Only while the retro stylesheet is in place.
const SPLASH_MIN_MS = 5000;

let splash: BrowserWindow | null = null;
let splashUntil = 0;

const splashHeld = () => !!splash && !splash.isDestroyed() && Date.now() < splashUntil;

// Decided when the call happens, not when the window was made - the main
// window can exist before the updater window is recognised as ours.
function hold<T extends (...args: any[]) => any>(win: BrowserWindow, fn: T, extraMs = 0) {
    return ((...args: Parameters<T>) => {
        const wait = splashHeld() ? splashUntil - Date.now() + extraMs : 0;
        if (wait <= 0) return fn(...args);
        setTimeout(() => { if (!win.isDestroyed()) fn(...args); }, wait);
    }) as T;
}

const startedAt = Date.now();

app.on("browser-window-created", (_, win) => {
    const openedAt = Date.now();

    // Windows from the first seconds of startup (the main window): showing
    // them waits for a held retro updater window, so it isn't covered early.
    // A no-op whenever no updater window is being held.
    if (openedAt - startedAt < 15_000) {
        const show = win.show.bind(win), showInactive = win.showInactive.bind(win);
        const heldShow = hold(win, show, 50), heldShowInactive = hold(win, showInactive, 50);
        // ...but never the updater window's own show.
        win.show = () => (win === splash ? show() : heldShow());
        win.showInactive = () => (win === splash ? showInactive() : heldShowInactive());
    }

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

        if (splash !== win) {
            splash = win;
            splashUntil = openedAt + SPLASH_MIN_MS;
            win.close = hold(win, win.close.bind(win));
            win.destroy = hold(win, win.destroy.bind(win));
        }
    });
});

export function setSplashCss(_: IpcMainInvokeEvent, css: unknown) {
    if (typeof css === "string" && css.length > 0 && css.length <= MAX_BYTES) {
        writeFileSync(SPLASH_CSS, css);
    } else {
        rmSync(SPLASH_CSS, { force: true });
    }
}
