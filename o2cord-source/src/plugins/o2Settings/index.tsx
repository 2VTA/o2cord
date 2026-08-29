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

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { FormSwitch } from "@components/FormSwitch";
import { Devs } from "@utils/constants";
import { syncOwnerThemeClass } from "@utils/o2OwnerTheme";
import definePlugin, { OptionType } from "@utils/types";
import { Popout, useRef, useState } from "@webpack/common";

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
            <FormSwitch
                title="Enable Custom Theme"
                value={settings.store.enableTheme !== false}
                onChange={value => {
                    settings.store.enableTheme = value;
                    forceUpdate(n => n + 1);
                }}
                hideBorder
            />
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

export default definePlugin({
    name: "o2Settings",
    description: "Replaces the Help button with an o2cord Settings quick panel for hiding/disabling parts of Discord's UI",
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: true,
    settings,
    start() {
        applyAllFromSettings();
        addHeaderBarButton("o2cord-settings", () => <O2SettingsHeaderButton />, 1000);
    },
    stop() {
        removeHeaderBarButton("o2cord-settings");
        for (const { style } of TOGGLES) disableStyle(style);
    }
});
