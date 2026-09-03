/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Cosmetic stand-in for a real Discord "Game Stats Widget" - that system
 * turned out to need Discord partner approval (confirmed via docs.discord.com:
 * the "Account Linking on Web" flow is "only available to select partners"),
 * so this is a client-side-only replica instead: a small card (cover image,
 * title, subtitle lines, optional progress bar) injected directly into the
 * real "Your Widgets" grid on Ryder's own Settings > Profile screen. That
 * page is private to whoever's looking at their own settings regardless of
 * what client mod they run, so this is purely a personal cosmetic touch -
 * not something published or visible to anyone else.
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { chooseFile } from "@utils/web";
import { Button, Forms, React, showToast, TextInput, Toasts, UserStore } from "@webpack/common";

const RYDER_USER_ID = "719085334989897750";
const MAX_LOCAL_IMAGE_BYTES = 8 * 1024 * 1024;
const WIDGET_CARD_ATTR = "data-o2-widget-card";
const SCAN_THROTTLE_MS = 500;

type WidgetData = {
    title?: string;
    subtitle1?: string;
    subtitle2?: string;
    subtitle3?: string;
    image?: string;
    progressLabel?: string;
    progressValue?: string;
};

function cleanWidgetData(raw: {
    title?: string; subtitle1?: string; subtitle2?: string; subtitle3?: string;
    image?: string; progressLabel?: string; progressValue?: string;
}): WidgetData | null {
    const widget: WidgetData = {
        title: (raw.title ?? "").trim(),
        subtitle1: (raw.subtitle1 ?? "").trim(),
        subtitle2: (raw.subtitle2 ?? "").trim(),
        subtitle3: (raw.subtitle3 ?? "").trim(),
        image: (raw.image ?? "").trim(),
        progressLabel: (raw.progressLabel ?? "").trim(),
        progressValue: (raw.progressValue ?? "").trim()
    };

    return widget.title || widget.subtitle1 || widget.subtitle2 || widget.subtitle3 || widget.image || widget.progressLabel
        ? widget
        : null;
}

function getWidget(): WidgetData | null {
    return cleanWidgetData({
        title: settings.store.title,
        subtitle1: settings.store.subtitle1,
        subtitle2: settings.store.subtitle2,
        subtitle3: settings.store.subtitle3,
        image: settings.store.image,
        progressLabel: settings.store.progressLabel,
        progressValue: settings.store.progressValue
    });
}

function renderCardInto(card: HTMLElement, widget: WidgetData) {
    card.innerHTML = "";

    if (widget.image || widget.title) {
        const header = document.createElement("div");
        header.className = "o2-widget-header";

        if (widget.image) {
            const img = document.createElement("img");
            img.className = "o2-widget-image";
            img.src = widget.image;
            img.alt = "";
            header.appendChild(img);
        }

        if (widget.title) {
            const title = document.createElement("div");
            title.className = "o2-widget-title";
            title.textContent = widget.title;
            header.appendChild(title);
        }

        card.appendChild(header);
    }

    for (const subtitle of [widget.subtitle1, widget.subtitle2, widget.subtitle3]) {
        if (!subtitle) continue;
        const line = document.createElement("div");
        line.className = "o2-widget-subtitle";
        line.textContent = subtitle;
        card.appendChild(line);
    }

    const progress = Math.min(100, Math.max(0, Number(widget.progressValue) || 0));
    if (widget.progressLabel || widget.progressValue) {
        const row = document.createElement("div");
        row.className = "o2-widget-progress-row";

        const label = document.createElement("span");
        label.className = "o2-widget-progress-label";
        label.textContent = widget.progressLabel ?? "";
        row.appendChild(label);

        const bar = document.createElement("div");
        bar.className = "o2-widget-progress-bar";
        const fill = document.createElement("div");
        fill.className = "o2-widget-progress-fill";
        fill.style.width = `${progress}%`;
        bar.appendChild(fill);
        row.appendChild(bar);

        const value = document.createElement("span");
        value.className = "o2-widget-progress-value";
        value.textContent = `${progress}/100`;
        row.appendChild(value);

        card.appendChild(row);
    }
}

// Ryder's own Settings > Profile screen has a real "Your Widgets" grid
// (confirmed live: [class*="dragAndDropTarget"] only ever exists in that
// settings editor, never on the read-only profile view anyone else sees) -
// inject a matching card there so it visually blends in with his real ones.
function injectCard() {
    if (UserStore.getCurrentUser()?.id !== RYDER_USER_ID) return;

    const widget = getWidget();

    document.querySelectorAll<HTMLElement>(`[${WIDGET_CARD_ATTR}]`).forEach(card => {
        if (!widget) card.remove();
    });

    if (!widget) return;

    document
        .querySelectorAll<HTMLElement>('[class*="dragAndDropTarget"] [class*="grid__"][class*="gameWidgetGrid"]')
        .forEach(grid => {
            if (grid.querySelector(`[${WIDGET_CARD_ATTR}]`)) return;

            const item = document.createElement("li");
            item.setAttribute(WIDGET_CARD_ATTR, "true");
            item.className = "o2-widget-card";
            renderCardInto(item, widget);
            grid.appendChild(item);
        });
}

let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;

function queueScan() {
    if (scanTimer != null) return;
    scanTimer = setTimeout(() => {
        scanTimer = null;
        injectCard();
    }, SCAN_THROTTLE_MS);
}

async function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(file);
    });
}

async function pickLocalImage() {
    const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
    if (!file) return null;

    if (!file.type.startsWith("image/")) {
        showToast("Choose an image or GIF file.", Toasts.Type.FAILURE);
        return null;
    }

    if (file.size > MAX_LOCAL_IMAGE_BYTES) {
        showToast("Use an image or GIF under 8 MB.", Toasts.Type.FAILURE);
        return null;
    }

    return readFileAsDataUrl(file);
}

function WidgetSettings() {
    const [title, setTitle] = React.useState(settings.store.title);
    const [subtitle1, setSubtitle1] = React.useState(settings.store.subtitle1);
    const [subtitle2, setSubtitle2] = React.useState(settings.store.subtitle2);
    const [subtitle3, setSubtitle3] = React.useState(settings.store.subtitle3);
    const [image, setImage] = React.useState(settings.store.image);
    const [progressLabel, setProgressLabel] = React.useState(settings.store.progressLabel);
    const [progressValue, setProgressValue] = React.useState(settings.store.progressValue);

    const chooseImage = async () => {
        const picked = await pickLocalImage();
        if (!picked) return;
        setImage(picked);
    };

    const apply = () => {
        settings.store.title = title;
        settings.store.subtitle1 = subtitle1;
        settings.store.subtitle2 = subtitle2;
        settings.store.subtitle3 = subtitle3;
        settings.store.image = image;
        settings.store.progressLabel = progressLabel;
        settings.store.progressValue = progressValue;
        injectCard();
        showToast("Widget card applied.", Toasts.Type.SUCCESS);
    };

    const clear = () => {
        setTitle(""); setSubtitle1(""); setSubtitle2(""); setSubtitle3("");
        setImage(""); setProgressLabel(""); setProgressValue("");
        settings.store.title = "";
        settings.store.subtitle1 = "";
        settings.store.subtitle2 = "";
        settings.store.subtitle3 = "";
        settings.store.image = "";
        settings.store.progressLabel = "";
        settings.store.progressValue = "";
        injectCard();
        showToast("Widget card cleared.", Toasts.Type.MESSAGE);
    };

    return (
        <Forms.FormSection className="o2-widget-settings">
            <Forms.FormText>
                Adds a cosmetic card to the real "Your Widgets" grid in your own Settings &gt; Profile screen - only you ever see that page.
            </Forms.FormText>

            <Forms.FormTitle tag="h5">Cover Image</Forms.FormTitle>
            <div className="o2-widget-row">
                <TextInput value={image} onChange={setImage} placeholder="Image URL" />
                <Button onClick={chooseImage}>Choose Image</Button>
            </div>

            <Forms.FormTitle tag="h5">Title</Forms.FormTitle>
            <TextInput value={title} onChange={setTitle} placeholder="Title" />

            <Forms.FormTitle tag="h5">Subtitles</Forms.FormTitle>
            <div className="o2-widget-row">
                <TextInput value={subtitle1} onChange={setSubtitle1} placeholder="Subtitle 1" />
            </div>
            <div className="o2-widget-row">
                <TextInput value={subtitle2} onChange={setSubtitle2} placeholder="Subtitle 2" />
            </div>
            <div className="o2-widget-row">
                <TextInput value={subtitle3} onChange={setSubtitle3} placeholder="Subtitle 3" />
            </div>

            <Forms.FormTitle tag="h5">Progress Bar (optional)</Forms.FormTitle>
            <div className="o2-widget-row">
                <TextInput value={progressLabel} onChange={setProgressLabel} placeholder="Label" />
                <TextInput value={progressValue} onChange={setProgressValue} placeholder="0-100" />
            </div>

            <div className="o2-widget-actions">
                <Button onClick={apply}>Apply</Button>
                <Button color={Button.Colors.RED} onClick={clear}>Clear</Button>
            </div>
        </Forms.FormSection>
    );
}

const settings = definePluginSettings({
    title: { type: OptionType.STRING, description: "Widget card title", default: "", hidden: true },
    subtitle1: { type: OptionType.STRING, description: "Widget card subtitle line 1", default: "", hidden: true },
    subtitle2: { type: OptionType.STRING, description: "Widget card subtitle line 2", default: "", hidden: true },
    subtitle3: { type: OptionType.STRING, description: "Widget card subtitle line 3", default: "", hidden: true },
    image: { type: OptionType.STRING, description: "Widget card cover image URL", default: "", hidden: true },
    progressLabel: { type: OptionType.STRING, description: "Widget card progress bar label", default: "", hidden: true },
    progressValue: { type: OptionType.STRING, description: "Widget card progress bar value (0-100)", default: "", hidden: true },
    manager: { type: OptionType.COMPONENT, description: "", component: WidgetSettings }
});

export default definePlugin({
    name: "Widget",
    description: "Adds a cosmetic card (cover image, title, subtitles, progress bar) to the real Your Widgets grid in your own profile settings.",
    authors: [Devs.Ryder],
    settings,

    start() {
        injectCard();
        observer = new MutationObserver(queueScan);
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        observer?.disconnect();
        observer = null;
        if (scanTimer != null) {
            clearTimeout(scanTimer);
            scanTimer = null;
        }
        document.querySelectorAll(`[${WIDGET_CARD_ATTR}]`).forEach(card => card.remove());
    }
});
