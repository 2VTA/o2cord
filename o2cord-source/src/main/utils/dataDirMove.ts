/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * o2cord keeps its settings, themes and plugin files in a folder named
 * "o2cord" (Windows: %APPDATA%\o2cord, Linux: ~/.config/o2cord). Older
 * versions used "Vencord" - the first time a new version starts, that
 * folder is COPIED over once:
 *  - the old folder is never changed or deleted (an older o2cord, or going
 *    back, still finds everything where it was);
 *  - the copy goes into a temporary folder first and is only renamed into
 *    place when it's complete, so a crash halfway leaves no half-copied
 *    settings behind;
 *  - files already in the new folder are never overwritten;
 *  - if anything at all goes wrong, o2cord simply keeps using the old folder
 *    like before - nobody loses their settings.
 * Plain Node (fs + path only), so it can be tested outside Discord.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const SETTINGS = ["settings", "settings.json"] as const;
const MARK = "moved-from-Vencord.txt";

/** Which data folder to use; copies `oldDir` into `newDir` the first time. Never throws. */
export function moveDataDir(oldDir: string, newDir: string, log: (msg: string) => void = () => { }): string {
    try {
        // already moved (or a fresh install that has been used once)
        if (existsSync(join(newDir, ...SETTINGS)) || existsSync(join(newDir, MARK))) return newDir;
        // nothing to bring over - a fresh install starts in the new folder
        if (!existsSync(oldDir) || !readdirSync(oldDir).length) return newDir;

        const tmp = `${newDir}.moving-${process.pid}`;
        rmSync(tmp, { recursive: true, force: true });
        cpSync(oldDir, tmp, { recursive: true, errorOnExist: false, force: false });

        if (!existsSync(newDir)) {
            try {
                renameSync(tmp, newDir);
            } catch {
                // another Discord (e.g. Stable and Canary starting together) got there first
            }
        }
        if (existsSync(tmp)) {
            // the new folder already existed (empty, or made by another start) - add what's missing, overwrite nothing
            cpSync(tmp, newDir, { recursive: true, errorOnExist: false, force: false });
            rmSync(tmp, { recursive: true, force: true });
        }

        // the settings must have arrived, or keep using the old folder
        if (existsSync(join(oldDir, ...SETTINGS)) && !existsSync(join(newDir, ...SETTINGS))) {
            log(`o2cord: settings did not arrive in ${newDir}, still using ${oldDir}`);
            return oldDir;
        }
        try {
            writeFileSync(join(newDir, MARK),
                `o2cord copied its files here from:\n${oldDir}\non ${new Date().toISOString()}.\nThe old folder was left as it was - you can delete it once everything works.\n`);
        } catch { /* only a note */ }
        log(`o2cord: copied ${oldDir} -> ${newDir}`);
        return newDir;
    } catch (err) {
        log(`o2cord: could not copy ${oldDir} -> ${newDir} (${err}), still using the old folder`);
        try { rmSync(`${newDir}.moving-${process.pid}`, { recursive: true, force: true }); } catch { /* best effort */ }
        return existsSync(oldDir) ? oldDir : (mkdirSafe(newDir), newDir);
    }
}

function mkdirSafe(dir: string) {
    try { mkdirSync(dir, { recursive: true }); } catch { /* the folder users will report it */ }
}
