/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Cosmetic stand-in for a real Discord "Game Stats Widget" - that system
 * turned out to need Discord partner approval (confirmed via docs.discord.com:
 * the "Account Linking on Web" flow is "only available to select partners"),
 * so this is a client-side-only replica instead: two stacked cards matching
 * a real widget's layout (app icon + name, big title, detail lines, hero
 * image on top; icon + progress bar + description below), added as a
 * standalone section above every real widget on Ryder's own Settings >
 * Profile screen. That page is private to whoever's looking at their own
 * settings regardless of what client mod they run, so this is purely a
 * personal cosmetic touch - not something published or visible to anyone
 * else.
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
    appIcon?: string;
    appName?: string;
    title?: string;
    subtitle1?: string;
    subtitle2?: string;
    subtitle3?: string;
    image?: string;
    progressIcon?: string;
    progressLabel?: string;
    progressValue?: string;
    progressDescription?: string;
    activityAccessory?: string;
};

const FIELDS = [
    "appIcon", "appName", "title", "subtitle1", "subtitle2", "subtitle3",
    "image", "progressIcon", "progressLabel", "progressValue", "progressDescription",
    "activityAccessory"
] as const;

function cleanWidgetData(raw: Partial<Record<typeof FIELDS[number], string>>): WidgetData | null {
    const widget: WidgetData = {};
    let hasAny = false;
    for (const field of FIELDS) {
        const value = (raw[field] ?? "").trim();
        widget[field] = value;
        if (value) hasAny = true;
    }
    return hasAny ? widget : null;
}

function getWidget(): WidgetData | null {
    const raw: Partial<Record<typeof FIELDS[number], string>> = {};
    for (const field of FIELDS) raw[field] = settings.store[field];
    return cleanWidgetData(raw);
}

function buildHeaderCard(widget: WidgetData): HTMLElement | null {
    if (!widget.appName && !widget.title && !widget.subtitle1 && !widget.subtitle2 && !widget.subtitle3 && !widget.image)
        return null;

    const card = document.createElement("div");
    card.className = "o2-widget-card o2-widget-header-card";

    if (widget.image) {
        const img = document.createElement("img");
        img.className = "o2-widget-hero-image";
        img.src = widget.image;
        img.alt = "";
        card.appendChild(img);
    }

    const content = document.createElement("div");
    content.className = "o2-widget-header-content";

    if (widget.appName) {
        const appRow = document.createElement("div");
        appRow.className = "o2-widget-app-row";

        if (widget.appIcon) {
            const icon = document.createElement("img");
            icon.className = "o2-widget-app-icon";
            icon.src = widget.appIcon;
            icon.alt = "";
            appRow.appendChild(icon);
        }

        const name = document.createElement("span");
        name.className = "o2-widget-app-name";
        name.textContent = widget.appName;
        appRow.appendChild(name);

        if (widget.activityAccessory) {
            const accessory = document.createElement("span");
            accessory.className = "o2-widget-activity-accessory";
            accessory.textContent = widget.activityAccessory;
            appRow.appendChild(accessory);
        }

        content.appendChild(appRow);
    }

    if (widget.title) {
        const title = document.createElement("div");
        title.className = "o2-widget-title";
        title.textContent = widget.title;
        content.appendChild(title);
    }

    for (const subtitle of [widget.subtitle1, widget.subtitle2, widget.subtitle3]) {
        if (!subtitle) continue;
        const line = document.createElement("div");
        line.className = "o2-widget-subtitle";
        line.textContent = subtitle;
        content.appendChild(line);
    }

    card.appendChild(content);
    return card;
}

function buildProgressCard(widget: WidgetData): HTMLElement | null {
    if (!widget.progressLabel && !widget.progressValue && !widget.progressDescription) return null;

    const card = document.createElement("div");
    card.className = "o2-widget-card o2-widget-progress-card";

    if (widget.progressIcon) {
        const icon = document.createElement("img");
        icon.className = "o2-widget-progress-icon";
        icon.src = widget.progressIcon;
        icon.alt = "";
        card.appendChild(icon);
    }

    const content = document.createElement("div");
    content.className = "o2-widget-progress-content";

    const progress = Math.min(100, Math.max(0, Number(widget.progressValue) || 0));
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

    content.appendChild(row);

    if (widget.progressDescription) {
        const desc = document.createElement("div");
        desc.className = "o2-widget-progress-description";
        desc.textContent = widget.progressDescription;
        content.appendChild(desc);
    }

    card.appendChild(content);
    return card;
}

// Ryder's own Settings > Profile screen has a real widgets panel with
// sections like "Games I Like" (confirmed live: [class*="dragAndDropTarget"]
// only ever exists in that settings editor, never on the read-only profile
// view anyone else sees). Anchoring off that section just confirms we're on
// the right screen - injecting INTO it mixed our card in with his actual
// Fallout games, which he didn't want, so this adds a standalone section of
// its own at the very top of the panel instead, above every real section.
function injectCard() {
    if (UserStore.getCurrentUser()?.id !== RYDER_USER_ID) return;

    const widget = getWidget();

    document.querySelectorAll<HTMLElement>(`[${WIDGET_CARD_ATTR}]`).forEach(el => {
        if (!widget) el.remove();
    });

    if (!widget) return;

    document
        .querySelectorAll<HTMLElement>('[class*="dragAndDropTarget"] [class*="grid__"][class*="gameWidgetGrid"]')
        .forEach(grid => {
            const gamesSection = grid.closest("section");
            const panel = gamesSection?.parentElement;
            if (!gamesSection || !panel) return;
            if (panel.querySelector(`[${WIDGET_CARD_ATTR}]`)) return;

            const section = document.createElement("section");
            section.setAttribute(WIDGET_CARD_ATTR, "true");
            section.className = "o2-widget-section";

            const header = buildHeaderCard(widget);
            if (header) section.appendChild(header);

            const progressCard = buildProgressCard(widget);
            if (progressCard) section.appendChild(progressCard);

            panel.prepend(section);
        });
}

const MINI_PROFILE_ATTR = "data-o2-widget-mini";
const MINI_PROFILE_SELECTOR = '[class*="outer_c0bea0"], [class*="userPopoutOuter"]';

function isOwnProfilePopout(shell: HTMLElement) {
    // Same heuristic ProfileTheme used: the real "Edit Profile" control only
    // ever shows on your OWN popout, never on someone else's - checking for
    // it is enough to gate this to Ryder's own screen without needing the
    // heavier per-target userId resolution ProfileTheme has.
    return shell.textContent?.includes("Edit Profile")
        || Boolean(shell.querySelector('[aria-label*="Edit Profile"]'));
}

// "Mini Profile" - the small popout card Discord shows when you click a
// user's avatar/name before opening their full profile. Compact version of
// the header card only (no room for the progress card in this small space).
function injectMiniProfile() {
    if (UserStore.getCurrentUser()?.id !== RYDER_USER_ID) return;

    const widget = getWidget();

    document.querySelectorAll<HTMLElement>(`[${MINI_PROFILE_ATTR}]`).forEach(el => {
        if (!widget) el.remove();
    });

    if (!widget) return;

    document.querySelectorAll<HTMLElement>(MINI_PROFILE_SELECTOR).forEach(shell => {
        if (!isOwnProfilePopout(shell)) return;
        if (shell.querySelector(`[${MINI_PROFILE_ATTR}]`)) return;

        const header = buildHeaderCard(widget);
        if (!header) return;

        header.setAttribute(MINI_PROFILE_ATTR, "true");
        header.classList.add("o2-widget-mini-card");
        shell.appendChild(header);
    });
}

let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;

function queueScan() {
    if (scanTimer != null) return;
    scanTimer = setTimeout(() => {
        scanTimer = null;
        injectCard();
        injectMiniProfile();
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

function ImagePickerRow({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string; }) {
    const pick = async () => {
        const picked = await pickLocalImage();
        if (picked) onChange(picked);
    };

    return (
        <div className="o2-widget-row">
            <TextInput value={value} onChange={onChange} placeholder={placeholder} />
            <Button onClick={pick}>Choose Image</Button>
        </div>
    );
}

function WidgetSettings() {
    const [values, setValues] = React.useState<Record<typeof FIELDS[number], string>>(() => {
        const initial = {} as Record<typeof FIELDS[number], string>;
        for (const field of FIELDS) initial[field] = settings.store[field] ?? "";
        return initial;
    });

    const set = (field: typeof FIELDS[number]) => (value: string) =>
        setValues(prev => ({ ...prev, [field]: value }));

    const apply = () => {
        for (const field of FIELDS) settings.store[field] = values[field];
        injectCard();
        showToast("Widget card applied.", Toasts.Type.SUCCESS);
    };

    const clear = () => {
        const empty = {} as Record<typeof FIELDS[number], string>;
        for (const field of FIELDS) {
            empty[field] = "";
            settings.store[field] = "";
        }
        setValues(empty);
        injectCard();
        showToast("Widget card cleared.", Toasts.Type.MESSAGE);
    };

    return (
        <Forms.FormSection className="o2-widget-settings">
            <Forms.FormText>
                Adds a cosmetic two-card widget above your real widgets on Settings &gt; Profile - only you ever see that page.
            </Forms.FormText>

            <Forms.FormTitle tag="h5">Header Card</Forms.FormTitle>
            {ImagePickerRow({ value: values.appIcon, onChange: set("appIcon"), placeholder: "App icon URL (small, top-left)" })}
            <TextInput value={values.appName} onChange={set("appName")} placeholder="App name (next to the icon)" />
            <TextInput value={values.title} onChange={set("title")} placeholder="Big title" />
            <TextInput value={values.activityAccessory} onChange={set("activityAccessory")} placeholder="Activity accessory text (small, next to app name)" />
            <TextInput value={values.subtitle1} onChange={set("subtitle1")} placeholder="Detail line 1" />
            <TextInput value={values.subtitle2} onChange={set("subtitle2")} placeholder="Detail line 2" />
            <TextInput value={values.subtitle3} onChange={set("subtitle3")} placeholder="Detail line 3" />
            {ImagePickerRow({ value: values.image, onChange: set("image"), placeholder: "Hero image URL (right side)" })}

            <Forms.FormTitle tag="h5" className="o2-widget-section-title">Progress Card (separate box below)</Forms.FormTitle>
            {ImagePickerRow({ value: values.progressIcon, onChange: set("progressIcon"), placeholder: "Progress icon URL" })}
            <div className="o2-widget-row">
                <TextInput value={values.progressLabel} onChange={set("progressLabel")} placeholder="Label" />
                <TextInput value={values.progressValue} onChange={set("progressValue")} placeholder="0-100" />
            </div>
            <TextInput value={values.progressDescription} onChange={set("progressDescription")} placeholder="Description line under the bar" />

            <div className="o2-widget-actions">
                <Button onClick={apply}>Apply</Button>
                <Button color={Button.Colors.RED} onClick={clear}>Clear</Button>
            </div>
        </Forms.FormSection>
    );
}

const settingsDefs: Record<string, any> = {};
for (const field of FIELDS) {
    settingsDefs[field] = { type: OptionType.STRING, description: `Widget card ${field}`, default: "", hidden: true };
}
settingsDefs.manager = { type: OptionType.COMPONENT, description: "", component: WidgetSettings };

const settings = definePluginSettings(settingsDefs);

export default definePlugin({
    name: "Widget",
    description: "Adds a cosmetic two-card widget (app header + progress) above the real widgets on your own profile settings.",
    authors: [Devs.Ryder],
    settings,

    start() {
        injectCard();
        injectMiniProfile();
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
        document.querySelectorAll(`[${WIDGET_CARD_ATTR}], [${MINI_PROFILE_ATTR}]`).forEach(el => el.remove());
    }
});
