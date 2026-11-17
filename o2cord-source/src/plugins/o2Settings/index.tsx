/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The o2cord quick switches (hiding/disabling parts of Discord's UI) and the
 * theme choice. They're shown on the o2cord settings page and in the o2cord
 * Hub (Hub.tsx, opened from that page). Discord's Help (?) button stays
 * hidden. The top-bar puzzle button was removed at Ryder's request - the
 * settings page covers it.
 */

import "./hideHelpButton.css";
import "./styles.css";

import * as DataStore from "@api/DataStore";
import { plugins, startPlugin, stopPlugin } from "@api/PluginManager";
import { definePluginSettings, Settings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { canUseRetro, RETRO_AUTO_ENABLE_IDS } from "@plugins/retroTerminal";
import { Devs } from "@utils/constants";
import { applyGlassLook, syncOwnerThemeClass } from "@utils/o2OwnerTheme";
import { syncViceCity } from "@utils/o2ViceCity";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, showToast, Toasts, UserStore } from "@webpack/common";

import disableAnimationsStyle from "./disableAnimations.css?managed";
import disableBlurStyle from "./disableBlur.css?managed";
import hideNitroHomeStyle from "./hideNitroHome.css?managed";
import hideQuestsStyle from "./hideQuests.css?managed";
import hideShopStyle from "./hideShop.css?managed";
import hideSpectatorsStyle from "./hideSpectators.css?managed";

interface ToggleDef {
    key: string;
    title: string;
    style: any;
}

export const TOGGLES: ToggleDef[] = [
    { key: "hideShop", title: "Hide Shop", style: hideShopStyle },
    { key: "hideQuests", title: "Hide Quests", style: hideQuestsStyle },
    { key: "hideNitroHome", title: "Hide Nitro Tab", style: hideNitroHomeStyle },
    { key: "hideSpectators", title: "Hide Spectators", style: hideSpectatorsStyle },
    { key: "disableBlur", title: "Disable Blur Effects", style: disableBlurStyle },
    { key: "disableAnimations", title: "Reduce Animations", style: disableAnimationsStyle }
];

export const settings = definePluginSettings({
    hideShop: { type: OptionType.BOOLEAN, description: "Hide the Shop entry in the DM sidebar", default: false, onChange: applyToggle("hideShop", hideShopStyle) },
    hideQuests: { type: OptionType.BOOLEAN, description: "Hide the Quests entry in the DM sidebar", default: false, onChange: applyToggle("hideQuests", hideQuestsStyle) },
    hideNitroHome: { type: OptionType.BOOLEAN, description: "Hide the Nitro entry in the DM sidebar", default: false, onChange: applyToggle("hideNitroHome", hideNitroHomeStyle) },
    hideSpectators: { type: OptionType.BOOLEAN, description: "Hide the spectators list under your stream panel", default: false, onChange: applyToggle("hideSpectators", hideSpectatorsStyle) },
    disableBlur: { type: OptionType.BOOLEAN, description: "Disable backdrop-filter blur everywhere (GPU-heavy)", default: false, onChange: (v: boolean) => { applyToggle("disableBlur", disableBlurStyle)(v); applyGlassLook(); } },
    disableAnimations: { type: OptionType.BOOLEAN, description: "Collapse animations/transitions to near-zero duration", default: false, onChange: applyToggle("disableAnimations", disableAnimationsStyle) },
    glassBlur: { type: OptionType.NUMBER, description: "Liquid Glass: glassBlur", default: 22, hidden: true, onChange: () => applyGlassLook() },
    glassSat: { type: OptionType.NUMBER, description: "Liquid Glass: glassSat", default: 170, hidden: true, onChange: () => applyGlassLook() },
    glassTint: { type: OptionType.NUMBER, description: "Liquid Glass: glassTint", default: 30, hidden: true, onChange: () => applyGlassLook() },
    glassEdge: { type: OptionType.NUMBER, description: "Liquid Glass: glassEdge", default: 100, hidden: true, onChange: () => applyGlassLook() },
    glassRadius: { type: OptionType.NUMBER, description: "Liquid Glass: glassRadius", default: 20, hidden: true, onChange: () => applyGlassLook() },
    glassBackdrop: { type: OptionType.STRING, description: "Liquid Glass: backdrop glow", default: "none", hidden: true, onChange: () => applyGlassLook() },
    glassColor: { type: OptionType.STRING, description: "Liquid Glass: glass colour (r, g, b)", default: "18, 18, 24", hidden: true, onChange: () => applyGlassLook() },
    viceCity: {
        type: OptionType.BOOLEAN,
        description: "Vice City colour theme (Discord's limited-time theme, saved)",
        default: false,
        hidden: true,
        onChange: () => { syncViceCity(); syncOwnerThemeClass(); }
    },
    enableTheme: {
        type: OptionType.BOOLEAN,
        description: "Enable o2Theme.css (the account-panel/call-controls color theme)",
        default: true,
        onChange: () => syncOwnerThemeClass()
    }
});

function applyToggle(key: string, style: any) {
    return (value: boolean) => {
        if (value) enableStyle(style);
        else disableStyle(style);
    };
}

function applyAllFromSettings() {
    const store = settings.store as unknown as Record<string, boolean>;
    for (const { key, style } of TOGGLES) {
        if (store[key]) enableStyle(style);
        else disableStyle(style);
    }
}

export type ThemeChoice = "none" | "glass" | "retro" | "vhs" | "splat" | "vice";

export const isOwner = () => UserStore.getCurrentUser()?.id === String(Devs.Ryder.id);

export function currentTheme(): ThemeChoice {
    // SplatInk is Ryder's private theme - only in his own build
    if (plugins.SplatInk && Settings.plugins.SplatInk?.enabled) return "splat";
    if (Settings.plugins.VHS?.enabled) return "vhs";
    if (canUseRetro() && Settings.plugins.RetroTerminal?.enabled) return "retro";
    if (settings.store.viceCity) return "vice";
    if (isOwner() && settings.store.enableTheme !== false) return "glass";
    return "none";
}

// Same start/stop + enabled-flag order as the Plugins tab (PluginCard).
function setPluginEnabled(name: string, on: boolean) {
    const plugin = plugins[name];
    const pluginSettings = Settings.plugins[name];
    if (!plugin || !pluginSettings || !!pluginSettings.enabled === on) return true;
    if (!on && !plugin.started) {
        pluginSettings.enabled = false;
        return true;
    }
    const ok = on ? startPlugin(plugin) : stopPlugin(plugin);
    if (ok) pluginSettings.enabled = on;
    else showToast(`Couldn't ${on ? "start" : "stop"} ${name}.`, Toasts.Type.FAILURE);
    return ok;
}

export function chooseTheme(choice: ThemeChoice) {
    // Vice City is a theme of its own: any other choice switches it off
    if (choice !== "vice") settings.store.viceCity = false;
    // VHS, RetroTerminal and SplatInk each switch the others off when they start
    if (choice === "retro" || choice === "vhs" || choice === "splat") {
        setPluginEnabled(choice === "retro" ? "RetroTerminal" : choice === "vhs" ? "VHS" : "SplatInk", true);
        return;
    }
    setPluginEnabled("RetroTerminal", false);
    setPluginEnabled("VHS", false);
    setPluginEnabled("SplatInk", false);
    settings.store.viceCity = choice === "vice";
    settings.store.enableTheme = choice === "glass";
    syncOwnerThemeClass();
}

// Accounts in RETRO_AUTO_ENABLE_IDS get RetroTerminal switched on once, on
// their first launch after the update. Remembered per account on this
// device, so choosing another theme in the panel afterwards sticks.
const RETRO_AUTO_KEY = (id: string) => `o2cord.retro.autoEnabled.${id}`;

async function autoEnableRetroOnce() {
    const id = UserStore.getCurrentUser()?.id;
    if (!id || !RETRO_AUTO_ENABLE_IDS.includes(id)) return;
    if (await DataStore.get(RETRO_AUTO_KEY(id))) return;
    await DataStore.set(RETRO_AUTO_KEY(id), true);
    setPluginEnabled("RetroTerminal", true);
}

export default definePlugin({
    name: "o2Settings",
    description: "o2cord's quick switches (hide Shop, Quests, Nitro tab, spectators...) and theme choice",
    authors: [Devs.Ryder],
    enabledByDefault: true,
    settings,
    autoEnableRetroOnce,
    start() {
        applyAllFromSettings();
        applyGlassLook();
        syncViceCity();
        FluxDispatcher.subscribe("CONNECTION_OPEN", autoEnableRetroOnce);
        void autoEnableRetroOnce();
    },
    stop() {
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", autoEnableRetroOnce);
        for (const { style } of TOGGLES) disableStyle(style);
    }
});
