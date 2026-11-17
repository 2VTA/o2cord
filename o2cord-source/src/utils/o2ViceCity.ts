/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The "Vice City" colour theme: Discord's own limited-time theme (promoted by Rockstar Games, through
 * December 13 for everyone and February 20 for Nitro members) saved as an o2cord theme.
 *
 * It is not a re-drawing of it. Discord colours its whole app from one class (`custom-theme-background` on
 * <html>) and one rule that defines the gradient and the base colours; every component then reads those
 * variables. The values below are that exact rule, read from Discord's own style element while the theme was
 * on (<style data-client-themes>), so turning this theme on gives the same look - and keeps it after the
 * limited time is over or when the account doesn't have it.
 */

import { Settings } from "@api/Settings";

const STYLE_ID = "o2-vice-city-theme";
const CLASS = "o2-vice-city";

/** Discord's rule for the Vice City colour theme, variables exactly as Discord wrote them */
const VARIABLES = `
    --custom-theme-background: linear-gradient(135deg, #4645ff 0%, #af01f3 33.33%, #ff6698 66.67%, #f89a03 100%);
    --custom-theme-primary-color: #4645ff;
    --custom-theme-secondary-color: #f89a03;
    --custom-background-gradient-opacity-multiplier: 0.8;
    --custom-theme-base-color-amount: 50%;
    --custom-theme-text-color-amount: 38%;
    --custom-theme-base-color-light-hsl: 36.470588235294095 100% 90%;
    --custom-theme-base-color-light: rgb(255,235,204);
    --custom-theme-text-color-light: rgb(1,0,128);
    --custom-theme-base-color-dark-hsl: 240 100% 5.098039215686274%;
    --custom-theme-base-color-dark: rgb(0,0,26);
    --custom-theme-text-color-dark: rgb(255,245,229);
`;

let observer: MutationObserver | null = null;

function apply() {
    const root = document.documentElement;
    if (!root.classList.contains(CLASS)) root.classList.add(CLASS);
    // Discord manages this class itself (it removes it when its own theme is off): keep it on while we are on
    if (!root.classList.contains("custom-theme-background")) root.classList.add("custom-theme-background");
}

export function syncViceCity() {
    const on = !!Settings.plugins.o2Settings?.viceCity;
    const root = document.documentElement;
    let style = document.getElementById(STYLE_ID);

    if (!on) {
        observer?.disconnect();
        observer = null;
        style?.remove();
        // Discord puts its own class back on its own if the account has a theme set
        if (root.classList.contains(CLASS)) {
            root.classList.remove(CLASS);
            if (!document.querySelector("style[data-client-themes]")) root.classList.remove("custom-theme-background");
        }
        return;
    }

    if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        // more specific than Discord's own `.custom-theme-background`, so it also wins over a different theme of the account
        style.textContent = `html.${CLASS}.custom-theme-background {${VARIABLES}}`;
        (document.head || root).appendChild(style);
    }
    apply();
    if (!observer) {
        observer = new MutationObserver(() => apply());
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    }
}
