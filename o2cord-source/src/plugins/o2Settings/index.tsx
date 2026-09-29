/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Replaces the native Help (?) header bar button with an "o2cord Settings"
 * button (puzzle icon) that opens a quick popout of toggles for
 * removing/disabling parts of Discord's UI Ryder doesn't want - starting
 * with Shop/Quests/Nitro tab and two broad performance toggles (blur,
 * animations). More toggles get added here as specific targets come in.
 */

import "./hideHelpButton.css";
import "./styles.css";

import * as DataStore from "@api/DataStore";
import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { plugins, startPlugin, stopPlugin } from "@api/PluginManager";
import { definePluginSettings, Settings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { FormSwitch } from "@components/FormSwitch";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { canUseRetro, PROFILES as RETRO_PROFILES, RETRO_AUTO_ENABLE_IDS } from "@plugins/retroTerminal";
import { Devs } from "@utils/constants";
import { classes } from "@utils/misc";
import { syncOwnerThemeClass } from "@utils/o2OwnerTheme";
import definePlugin, { OptionType } from "@utils/types";
import { Clickable, FluxDispatcher, Popout, showToast, Toasts, useRef, UserStore, useState } from "@webpack/common";

import disableAnimationsStyle from "./disableAnimations.css?managed";
import disableBlurStyle from "./disableBlur.css?managed";
import hideNitroHomeStyle from "./hideNitroHome.css?managed";
import hideQuestsStyle from "./hideQuests.css?managed";
import hideShopStyle from "./hideShop.css?managed";
import { PuzzleIcon } from "./PuzzleIcon";

interface ToggleDef {
    key: string;
    title: string;
    style: any;
}

const TOGGLES: ToggleDef[] = [
    { key: "hideShop", title: "Hide Shop", style: hideShopStyle },
    { key: "hideQuests", title: "Hide Quests", style: hideQuestsStyle },
    { key: "hideNitroHome", title: "Hide Nitro Tab", style: hideNitroHomeStyle },
    { key: "disableBlur", title: "Disable Blur Effects", style: disableBlurStyle },
    { key: "disableAnimations", title: "Reduce Animations", style: disableAnimationsStyle }
];

const settings = definePluginSettings({
    hideShop: { type: OptionType.BOOLEAN, description: "Hide the Shop entry in the DM sidebar", default: false, onChange: applyToggle("hideShop", hideShopStyle) },
    hideQuests: { type: OptionType.BOOLEAN, description: "Hide the Quests entry in the DM sidebar", default: false, onChange: applyToggle("hideQuests", hideQuestsStyle) },
    hideNitroHome: { type: OptionType.BOOLEAN, description: "Hide the Nitro entry in the DM sidebar", default: false, onChange: applyToggle("hideNitroHome", hideNitroHomeStyle) },
    disableBlur: { type: OptionType.BOOLEAN, description: "Disable backdrop-filter blur everywhere (GPU-heavy)", default: false, onChange: applyToggle("disableBlur", disableBlurStyle) },
    disableAnimations: { type: OptionType.BOOLEAN, description: "Collapse animations/transitions to near-zero duration", default: false, onChange: applyToggle("disableAnimations", disableAnimationsStyle) },
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
    const store = settings.store as Record<string, boolean>;
    for (const { key, style } of TOGGLES) {
        if (store[key]) enableStyle(style);
        else disableStyle(style);
    }
}

type ThemeChoice = "none" | "glass" | "retro";

const isOwner = () => UserStore.getCurrentUser()?.id === String(Devs.Ryder.id);

function currentTheme(): ThemeChoice {
    if (canUseRetro() && Settings.plugins.RetroTerminal?.enabled) return "retro";
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

function chooseTheme(choice: ThemeChoice) {
    if (choice === "retro") {
        setPluginEnabled("RetroTerminal", true);
        return;
    }
    setPluginEnabled("RetroTerminal", false);
    settings.store.enableTheme = choice === "glass";
    syncOwnerThemeClass();
}

function ThemePicker({ closePopout }: { closePopout: () => void; }) {
    const [, forceUpdate] = useState(0);
    const theme = currentTheme();
    const retroProfile = Settings.plugins.RetroTerminal?.profile ?? "amber";

    const options: { id: ThemeChoice; title: string; sub: string; }[] = [
        { id: "none", title: "None", sub: "Discord's normal look" },
        ...(isOwner() ? [{ id: "glass" as const, title: "Liquid Glass", sub: "Frosted glass panels" }] : []),
        ...(canUseRetro() ? [{ id: "retro" as const, title: "Retro Terminal", sub: "Old CRT screen, after cool-retro-term" }] : [])
    ];

    // Both themes are limited to specific accounts - with nothing but "None"
    // to pick, don't show the section at all.
    if (options.length < 2) return null;

    return (
        <div className="o2-settings-themes">
            <div className="o2-settings-popout-section">Themes</div>
            {options.map(opt => (
                <Clickable
                    key={opt.id}
                    className={classes("o2-settings-theme", theme === opt.id && "o2-settings-theme-on")}
                    role="radio"
                    aria-checked={theme === opt.id}
                    onClick={() => { chooseTheme(opt.id); forceUpdate(n => n + 1); }}
                >
                    <span className="o2-settings-theme-dot" />
                    <span className="o2-settings-theme-text">
                        <span className="o2-settings-theme-title">{opt.title}</span>
                        <span className="o2-settings-theme-sub">{opt.sub}</span>
                    </span>
                </Clickable>
            ))}

            {theme === "retro" && (
                <div className="o2-settings-retro">
                    <div className="o2-settings-swatches" role="radiogroup" aria-label="Retro colour">
                        {Object.entries(RETRO_PROFILES).map(([key, p]) => (
                            <Clickable
                                key={key}
                                className={classes("o2-settings-swatch", retroProfile === key && "o2-settings-swatch-on")}
                                role="radio"
                                aria-checked={retroProfile === key}
                                title={p.label}
                                onClick={() => {
                                    Settings.plugins.RetroTerminal.profile = key;
                                    forceUpdate(n => n + 1);
                                }}
                            >
                                <span className="o2-settings-swatch-dot" style={{ background: p.fg }} />
                                {p.short}
                            </Clickable>
                        ))}
                    </div>
                    <Clickable
                        className="o2-settings-more"
                        onClick={() => {
                            closePopout();
                            openPluginModal(plugins.RetroTerminal);
                        }}
                    >
                        More settings…
                    </Clickable>
                </div>
            )}
        </div>
    );
}

function SettingsPopout({ closePopout }: { closePopout: () => void; }) {
    const [, forceUpdate] = useState(0);
    const store = settings.store as Record<string, boolean>;

    return (
        <div className="o2-settings-popout">
            <div className="o2-settings-popout-header">o2cord Settings</div>
            {TOGGLES.map(({ key, title }) => (
                <FormSwitch
                    key={key}
                    title={title}
                    value={!!store[key]}
                    onChange={value => {
                        store[key] = value;
                        forceUpdate(n => n + 1);
                    }}
                    hideBorder
                />
            ))}
            <ThemePicker closePopout={closePopout} />
        </div>
    );
}

function O2SettingsHeaderButton() {
    const [isOpen, setIsOpen] = useState(false);
    const popoutRef = useRef<HTMLDivElement>(null);

    return (
        <Popout
            targetElementRef={popoutRef}
            renderPopout={() => <SettingsPopout closePopout={() => setIsOpen(false)} />}
            shouldShow={isOpen}
            onRequestClose={() => setIsOpen(false)}
            position="bottom"
            align="right"
            spacing={8}
        >
            {() => (
                <div ref={popoutRef as any} style={{ display: "flex" }}>
                    <HeaderBarButton
                        icon={PuzzleIcon}
                        tooltip="o2cord Settings"
                        onClick={() => setIsOpen(v => !v)}
                        selected={isOpen}
                    />
                </div>
            )}
        </Popout>
    );
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
    description: "Replaces the Help button with an o2cord Settings quick panel for hiding/disabling parts of Discord's UI",
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: true,
    settings,
    autoEnableRetroOnce,
    start() {
        applyAllFromSettings();
        addHeaderBarButton("o2cord-settings", () => <O2SettingsHeaderButton />, 1000);
        FluxDispatcher.subscribe("CONNECTION_OPEN", autoEnableRetroOnce);
        void autoEnableRetroOnce();
    },
    stop() {
        removeHeaderBarButton("o2cord-settings");
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", autoEnableRetroOnce);
        for (const { style } of TOGGLES) disableStyle(style);
    }
});
