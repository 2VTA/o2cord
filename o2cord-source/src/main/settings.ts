/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import { IpcEvents } from "@shared/IpcEvents";
import { SettingsStore } from "@shared/SettingsStore";
import { mergeDefaults } from "@utils/mergeDefaults";
import { ipcMain } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

import { NATIVE_SETTINGS_FILE, SETTINGS_DIR, SETTINGS_FILE } from "./utils/constants";

mkdirSync(SETTINGS_DIR, { recursive: true });

function applyO2GlassDefaults(settings: Partial<Settings>) {
    settings.useQuickCss = true;
    settings.enabledThemes = [];
    settings.frameless = false;
    settings.winNativeTitleBar = false;
    settings.transparent = false;
    settings.windowsMaterial = "none";
}

function readSettings<T = object>(name: string, file: string): Partial<T> {
    try {
        return JSON.parse(readFileSync(file, "utf-8"));
    } catch (err: any) {
        if (err?.code !== "ENOENT")
            console.error(`Failed to read ${name} settings`, err);

        return {};
    }
}

const rendererSettings = readSettings<Settings>("renderer", SETTINGS_FILE);
applyO2GlassDefaults(rendererSettings);

export const RendererSettings = new SettingsStore(rendererSettings);

RendererSettings.addGlobalChangeListener(() => {
    try {
        writeFileSync(SETTINGS_FILE, JSON.stringify(RendererSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write renderer settings", e);
    }
});

ipcMain.on(IpcEvents.GET_SETTINGS, e => e.returnValue = RendererSettings.plain);

ipcMain.handle(IpcEvents.SET_SETTINGS, (_, data: Settings, pathToNotify?: string) => {
    RendererSettings.setData(data, pathToNotify);
});

export interface NativeSettings {
    plugins: {
        [plugin: string]: {
            [setting: string]: any;
        };
    };
    customCspRules: Record<string, string[]>;
}

const DefaultNativeSettings: NativeSettings = {
    plugins: {},
    customCspRules: {}
};

const nativeSettings = readSettings<NativeSettings>("native", NATIVE_SETTINGS_FILE);
mergeDefaults(nativeSettings, DefaultNativeSettings);

export const NativeSettings = new SettingsStore(nativeSettings as NativeSettings);

NativeSettings.addGlobalChangeListener(() => {
    try {
        writeFileSync(NATIVE_SETTINGS_FILE, JSON.stringify(NativeSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write native settings", e);
    }
});
