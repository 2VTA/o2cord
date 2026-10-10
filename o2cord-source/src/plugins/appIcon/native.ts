/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Main-process half of AppIcon: puts a picture of your choice on Discord's
 * window and taskbar button (the taskbar button gets its own app id, which is
 * what makes Windows show the picture instead of the shortcut's icon). The renderer sends two PNGs (the square picture as
 * picked, and the finished icon with the shape applied); both are kept in the
 * o2cord data folder so the icon comes back on every launch, including windows
 * opened later (popouts, the second window).
 *
 * Only the running window changes: the Discord shortcut/exe on disk keeps its
 * own icon, and the tray icon is Discord's own and is left alone.
 */

import { DATA_DIR } from "@main/utils/constants";
import { app, BrowserWindow, IpcMainInvokeEvent, nativeImage } from "electron";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const APPLIED = join(DATA_DIR, "o2-app-icon.png");
const SOURCE = join(DATA_DIR, "o2-app-icon-src.png");
const MAX_BYTES = 4 * 1024 * 1024;

// PNG files start with these bytes; anything else is refused.
const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

function decode(b64: unknown): Buffer | null {
    if (typeof b64 !== "string" || !b64 || b64.length > MAX_BYTES * 1.4) return null;
    const buf = Buffer.from(b64, "base64");
    return buf.length <= MAX_BYTES && isPng(buf) ? buf : null;
}

// The taskbar remembers an icon file by its path, so every new picture is written
// to a file with a new name (and the old one deleted), or it would keep showing
// the previous picture.
const ICO_RE = /^o2-app-icon-\d+\.ico$/;

function currentIco() {
    try {
        const name = readdirSync(DATA_DIR).filter(f => ICO_RE.test(f)).sort().pop();
        return name ? join(DATA_DIR, name) : null;
    } catch {
        return null;
    }
}

function writeIco(png: Buffer) {
    const path = join(DATA_DIR, `o2-app-icon-${Date.now()}.ico`);
    writeFileSync(path, pngToIco(png));
    removeOldIcos(path);
    return path;
}

function removeOldIcos(keep?: string) {
    let files: string[] = [];
    try { files = readdirSync(DATA_DIR); } catch { return; }
    for (const f of files) {
        if (!ICO_RE.test(f) || join(DATA_DIR, f) === keep) continue;
        // the taskbar may still hold the previous file open; it goes next time
        try { rmSync(join(DATA_DIR, f), { force: true }); } catch { /* ignore */ }
    }
}

function applyTo(win: BrowserWindow) {
    if (win.isDestroyed() || !existsSync(APPLIED)) return;
    try {
        const img = nativeImage.createFromPath(APPLIED);
        if (!img.isEmpty()) win.setIcon(img);
        if (process.platform === "win32") {
            const ico = currentIco() ?? writeIco(readFileSync(APPLIED));
            // Windows reads the icon of a taskbar button once per app id, so each
            // picture gets its own id (the number in the file name).
            const stamp = ico.match(/(\d+)\.ico$/)?.[1] ?? "0";
            win.setAppDetails({ appId: `o2cord.AppIcon.Discord.${stamp}`, appIconPath: ico, appIconIndex: 0, relaunchCommand: `"${process.execPath}"`, relaunchDisplayName: "Discord" });
        }
    } catch { /* leave Discord's own icon */ }
}

// A .ico holding the PNG as it is (Windows Vista and later read PNG inside ico):
// the taskbar wants an icon file, not a picture.
function pngToIco(png: Buffer) {
    const head = Buffer.alloc(22);
    head.writeUInt16LE(0, 0);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(1, 4);
    head[6] = 0; // 256 wide
    head[7] = 0; // 256 high
    head.writeUInt16LE(1, 10);
    head.writeUInt16LE(32, 12);
    head.writeUInt32LE(png.length, 14);
    head.writeUInt32LE(22, 18);
    return Buffer.concat([head, png]);
}

function applyAll() {
    for (const win of BrowserWindow.getAllWindows()) applyTo(win);
}

// Windows opened later get the icon as soon as they exist, and again once they
// are on screen (Discord sets its own icon while building the window).
app.on("browser-window-created", (_, win) => {
    if (!existsSync(APPLIED)) return;
    applyTo(win);
    win.once("ready-to-show", () => applyTo(win));
});

export function applyIcon(_: IpcMainInvokeEvent) {
    applyAll();
}

export function saveIcon(_: IpcMainInvokeEvent, sourceB64: unknown, appliedB64: unknown) {
    const src = decode(sourceB64);
    const applied = decode(appliedB64);
    if (!src || !applied) return false;
    writeFileSync(SOURCE, src);
    writeFileSync(APPLIED, applied);
    writeIco(applied);
    applyAll();
    return true;
}

export function getSource(_: IpcMainInvokeEvent) {
    try {
        return existsSync(SOURCE) ? readFileSync(SOURCE).toString("base64") : null;
    } catch {
        return null;
    }
}

// Back to Discord's own icon: the one inside the running exe.
export async function resetIcon(_: IpcMainInvokeEvent) {
    rmSync(APPLIED, { force: true });
    removeOldIcos();
    rmSync(SOURCE, { force: true });
    try {
        const original = await app.getFileIcon(process.execPath, { size: "large" });
        if (!original.isEmpty()) for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.setIcon(original);
    } catch { /* the next launch is back to normal anyway */ }
}
