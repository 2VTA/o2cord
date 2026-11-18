/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PlainSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { chooseFile, saveFile } from "@utils/web";
import { moment, Toasts } from "@webpack/common";

const toast = (type: string, message: string) =>
    Toasts.show({
        type,
        message,
        id: Toasts.genId()
    });

const toastSuccess = () =>
    toast(Toasts.Type.SUCCESS, "Settings successfully imported. Restart to apply changes!");

const toastFailure = (err: any) =>
    toast(Toasts.Type.FAILURE, `Failed to import settings: ${String(err)}`);

const logger = new Logger("SettingsSync:Offline", "#39b7e0");

/** Discord's file windows reject with "... canceled by user" when they are closed */
const wasCancelled = (err: any) => /cancel/i.test(String((err as Error)?.message ?? err));

function isSafeObject(obj: any) {
    if (obj == null || typeof obj !== "object") return true;

    for (const key in obj) {
        if (["__proto__", "constructor", "prototype"].includes(key)) {
            return false;
        }
        if (!isSafeObject(obj[key])) {
            return false;
        }
    }

    return true;
}

/** what the Backup tab shows under the buttons */
export interface BackupResult { ok: boolean; text: string; }

export async function importSettings(data: string): Promise<number> {
    try {
        var parsed = JSON.parse(data);
    } catch (err) {
        console.log(data);
        throw new Error("Failed to parse JSON: " + String(err));
    }

    if (!isSafeObject(parsed))
        throw new Error("Unsafe Settings");

    if ("settings" in parsed && "quickCss" in parsed) {
        Object.assign(PlainSettings, parsed.settings);
        await VencordNative.settings.set(parsed.settings);
        await VencordNative.quickCss.set(parsed.quickCss);
        return Object.keys(parsed.settings?.plugins ?? {}).length;
    } else
        throw new Error("Invalid Settings. Is this even an o2cord Settings file?");
}

export async function exportSettings({ minify }: { minify?: boolean; } = {}) {
    const settings = VencordNative.settings.get();
    const quickCss = await VencordNative.quickCss.get();
    return JSON.stringify({ settings, quickCss }, null, minify ? undefined : 4);
}

export async function downloadSettingsBackup(): Promise<BackupResult> {
    try {
        const filename = `o2cord-settings-backup-${moment().format("YYYY-MM-DD")}.json`;
        const backup = await exportSettings();
        const data = new TextEncoder().encode(backup);

        if (IS_DISCORD_DESKTOP) {
            // the save window answers with the folder when the file was written, and with nothing when it is closed
            const folder = await DiscordNative.fileManager.saveWithDialog(data, filename);
            if (!folder) return { ok: false, text: "Nothing was saved (the save window was closed)." };
            return { ok: true, text: `Done - saved ${filename}` };
        }
        saveFile(new File([data], filename, { type: "application/json" }));
        return { ok: true, text: `Done - saved ${filename}` };
    } catch (err) {
        if (wasCancelled(err)) return { ok: false, text: "Nothing was saved (the save window was closed)." };
        logger.error(err);
        return { ok: false, text: `Couldn't save the backup: ${(err as Error)?.message ?? String(err)}` };
    }
}

export async function uploadSettingsBackup(showToast = true): Promise<BackupResult> {
    const load = async (text: string): Promise<BackupResult> => {
        try {
            const count = await importSettings(text);
            if (showToast) toastSuccess();
            return { ok: true, text: `Done - backup loaded (${count} plugins). Restart o2cord to apply it.` };
        } catch (err) {
            logger.error(err);
            if (showToast) toastFailure(err);
            return { ok: false, text: `Couldn't load that file: ${(err as Error)?.message ?? String(err)}` };
        }
    };

    try {
        if (IS_DISCORD_DESKTOP) {
            const [file] = await DiscordNative.fileManager.openFiles({
                filters: [
                    { name: "o2cord Settings Backup", extensions: ["json"] },
                    { name: "all", extensions: ["*"] }
                ]
            });
            if (!file) return { ok: false, text: "Nothing was loaded (no file was chosen)." };
            return await load(new TextDecoder().decode(file.data));
        }

        const file = await chooseFile("application/json");
        if (!file) return { ok: false, text: "Nothing was loaded (no file was chosen)." };
        return await load(await file.text());
    } catch (err) {
        if (wasCancelled(err)) return { ok: false, text: "Nothing was loaded (no file was chosen)." };
        logger.error(err);
        return { ok: false, text: `Couldn't open the file: ${(err as Error)?.message ?? String(err)}` };
    }
}
