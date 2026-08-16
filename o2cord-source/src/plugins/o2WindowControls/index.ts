/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { Devs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { makeRange, OptionType } from "@utils/types";

let style: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;

const settings = definePluginSettings({
    minimizeImage: {
        type: OptionType.STRING,
        description: "Image URL for the minimize button. Leave empty to keep the default icon.",
        placeholder: "https://example.com/minimize.png",
        default: "",
        onChange: updateStyle
    },
    maximizeImage: {
        type: OptionType.STRING,
        description: "Image URL for the maximize / restore button. Leave empty to keep the default icon.",
        placeholder: "https://example.com/maximize.png",
        default: "",
        onChange: updateStyle
    },
    closeImage: {
        type: OptionType.STRING,
        description: "Image URL for the close button. Leave empty to keep the default icon.",
        placeholder: "https://example.com/close.png",
        default: "",
        onChange: updateStyle
    },
    iconSize: {
        type: OptionType.SLIDER,
        description: "Custom image size.",
        markers: makeRange(10, 58, 2),
        default: 16,
        stickToMarkers: false,
        onChange: updateStyle
    },
    hoverScale: {
        type: OptionType.SLIDER,
        description: "How much the custom image grows on hover.",
        markers: makeRange(100, 150, 5),
        default: 118,
        stickToMarkers: false,
        onChange: updateStyle
    },
    verticalOffset: {
        type: OptionType.SLIDER,
        description: "Move the custom image up or down.",
        markers: makeRange(-8, 8, 1),
        default: 1,
        stickToMarkers: false,
        onChange: updateStyle
    },
    dimOnIdle: {
        type: OptionType.BOOLEAN,
        description: "Slightly dim custom window control images until hovered.",
        default: false,
        onChange: updateStyle
    }
});

function asCssUrl(raw?: string) {
    const url = raw?.trim();
    if (!url) return null;

    return `url("${url.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "")}")`;
}

function imageRule(selector: string, url: string | null) {
    if (!url) return "";

    return `
        ${selector} {
            color: transparent !important;
            font-size: 0 !important;
            background-image: ${url} !important;
            background-position: center calc(50% + var(--o2-window-control-offset-y)) !important;
            background-repeat: no-repeat !important;
            background-size: var(--o2-window-control-size) var(--o2-window-control-size) !important;
            opacity: var(--o2-window-control-opacity) !important;
            transition: background-size 140ms ease, opacity 120ms ease !important;
        }

        ${selector} > *,
        ${selector} svg,
        ${selector} path,
        ${selector} div {
            opacity: 0 !important;
            visibility: hidden !important;
        }

        ${selector}:hover {
            background-size: var(--o2-window-control-hover-size) var(--o2-window-control-hover-size) !important;
            opacity: 1 !important;
        }
    `;
}

function updateStyle() {
    if (!style) return;

    const minimize = asCssUrl(settings.store.minimizeImage);
    const maximize = asCssUrl(settings.store.maximizeImage);
    const close = asCssUrl(settings.store.closeImage);
    const size = Math.max(8, Math.min(58, Number(settings.store.iconSize) || 16));
    const hoverScale = Math.max(1, Math.min(1.7, Number(settings.store.hoverScale) / 100 || 1.18));
    const hoverSize = Math.round(size * hoverScale);
    const verticalOffset = Math.max(-12, Math.min(12, Number(settings.store.verticalOffset) || 0));
    const idleOpacity = settings.store.dimOnIdle ? 0.72 : 1;

    style.textContent = `
        :root {
            --o2-window-control-size: ${size}px;
            --o2-window-control-hover-size: ${hoverSize}px;
            --o2-window-control-offset-y: ${verticalOffset}px;
            --o2-window-control-opacity: ${idleOpacity};
        }

        [class*=winButton],
        [class*=windowControlButton] {
            position: relative !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow: visible !important;
        }

        ${imageRule(".o2-wc-minimize", minimize)}
        ${imageRule(".o2-wc-maximize", maximize)}
        ${imageRule(".o2-wc-close", close)}
    `;
}

function clearButtonTags() {
    document
        .querySelectorAll(".o2-wc-minimize, .o2-wc-maximize, .o2-wc-close")
        .forEach(button => button.classList.remove("o2-wc-minimize", "o2-wc-maximize", "o2-wc-close"));
}

function tagWindowButtons() {
    document.querySelectorAll<HTMLElement>("[class*=winButtons]").forEach(container => {
        const buttons = Array.from(container.querySelectorAll<HTMLElement>("[class*=winButton]"));
        if (!buttons.length) return;

        buttons.forEach(button => button.classList.remove("o2-wc-minimize", "o2-wc-maximize", "o2-wc-close"));

        const closeButton = buttons.find(button =>
            Array.from(button.classList).some(className => className.includes("winButtonClose"))
        );
        const standardButtons = buttons.filter(button => button !== closeButton);

        standardButtons[0]?.classList.add("o2-wc-minimize");
        standardButtons[1]?.classList.add("o2-wc-maximize");
        (closeButton ?? standardButtons[2])?.classList.add("o2-wc-close");
    });
}

export default definePlugin({
    name: "O2WindowControls",
    description: "Customize Discord window control buttons with your own images.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    settings,
    enabledByDefault: true,
    requiresRestart: false,

    start() {
        style = createAndAppendStyle("o2-window-controls", managedStyleRootNode);
        updateStyle();
        tagWindowButtons();

        observer = new MutationObserver(tagWindowButtons);
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener("resize", tagWindowButtons);
    },

    stop() {
        observer?.disconnect();
        observer = null;
        window.removeEventListener("resize", tagWindowButtons);
        clearButtonTags();
        style?.remove();
        style = null;
    }
});
