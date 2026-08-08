/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ColorPicker, Forms, React } from "@webpack/common";

const DEFAULT_ACCENT_HEX = "5865F2";
const MONO_ACCENT_RGB = "148, 152, 161";

function hexToRgbTriplet(hex: string) {
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return hexToRgbTriplet(DEFAULT_ACCENT_HEX);

    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `${r}, ${g}, ${b}`;
}

function applyVars() {
    const root = document.documentElement;
    root.style.setProperty("--o2-glass-alpha", String(settings.store.glassAlpha));

    const accentRgb = settings.store.coloredAccent
        ? hexToRgbTriplet(settings.store.accentColor)
        : MONO_ACCENT_RGB;
    root.style.setProperty("--o2-accent", accentRgb);
}

function removeVars() {
    const root = document.documentElement;
    root.style.removeProperty("--o2-glass-alpha");
    root.style.removeProperty("--o2-accent");
}

function AccentColorPicker() {
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
    const colorNum = parseInt(settings.store.accentColor, 16) || parseInt(DEFAULT_ACCENT_HEX, 16);

    return (
        <Forms.FormSection className="o2-acrylic-settings">
            <Forms.FormTitle tag="h5">Accent Color</Forms.FormTitle>
            <Forms.FormText>Only used while "Colored accent" above is on.</Forms.FormText>
            <ColorPicker
                color={colorNum}
                onChange={(color: number) => {
                    settings.store.accentColor = color.toString(16).padStart(6, "0");
                    applyVars();
                    forceUpdate();
                }}
                showEyeDropper={false}
            />
        </Forms.FormSection>
    );
}

const settings = definePluginSettings({
    glassAlpha: {
        type: OptionType.SLIDER,
        description: "Glass strength - lower is more see-through, higher is more solid",
        markers: [0.08, 0.16, 0.24, 0.32, 0.42, 0.55, 0.7],
        default: 0.28,
        stickToMarkers: false,
        onChange: applyVars
    },
    coloredAccent: {
        type: OptionType.BOOLEAN,
        description: "Use a colored accent (off = neutral gray, no color)",
        default: true,
        onChange: applyVars
    },
    accentColor: {
        type: OptionType.STRING,
        description: "Accent color hex, set via the picker below",
        default: DEFAULT_ACCENT_HEX,
        hidden: true,
        onChange: applyVars
    },
    colorPicker: {
        type: OptionType.COMPONENT,
        description: "",
        component: AccentColorPicker
    }
});

export default definePlugin({
    name: "o2Acrylic",
    description: "Live glass-strength and accent-color controls for the o2 Acrylic theme.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    enabledByDefault: false,
    settings,
    start: applyVars,
    stop: removeVars
});
