/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Cosmetic stand-in for a real Discord "Game Stats Widget" - that system
 * turned out to be locked behind a claimed-game requirement (confirmed live:
 * attempting to claim a fake game returns "No results found" against
 * Discord's real game catalog, and support-dev.discord.com documents access
 * as claimed-games-only, managed through Developer Solutions), so this is a
 * client-side-only replica instead: two stacked cards matching a real
 * widget's layout - header card (app icon + name, activity accessory, big
 * title, detail lines, image in either "Hero" bleed-across-the-card or
 * "Contained" own-square style) and a stats card below it (up to 4 icon +
 * name + value entries, matching the real widget's 2x2 stat grid, not a
 * progress bar). Added as a standalone section above every real widget on
 * your own Settings > Profile screen, and a compact version on your own
 * Mini Profile popout. Available to every o2cord user (not gated to
 * Ryder) - each person's Settings/Mini Profile is only ever visible on
 * their own screen regardless of what client mod they run, so this is
 * still purely a personal cosmetic touch per user, not something published
 * or visible to anyone else.
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { fetchWithGithubFallback } from "@utils/githubFallbackFetch";
import { chooseFile, saveFile } from "@utils/web";
import { Button, Forms, React, showToast, TextInput, Toasts, UserStore } from "@webpack/common";
import Plugins from "~plugins";

const MAX_LOCAL_IMAGE_BYTES = 8 * 1024 * 1024;
const WIDGET_CARD_ATTR = "data-o2-widget-card";
const SCAN_THROTTLE_MS = 500;
const PUBLISH_CODE_PREFIX = "O2WIDGET_PUBLISH:";
const DISCORD_ID_RE = /^\d{17,20}$/;
const REACT_SCAN_LIMIT = 220;
const REACT_SCAN_DEPTH = 5;
const MIN_PRIMARY_AVATAR_SIZE = 48;
const AVATAR_ID_RE = /\/(?:avatars\/|users\/)(\d{17,20})(?:\/avatars)?\//;
const REGISTRY_REFRESH_MS = 30_000;

// Same shell selectors ProfileTheme uses to find a profile card/popout
// anywhere on the page (full profile, popout, both).
const PROFILE_SHELL_SELECTOR = [
    "[class*='outer_c0bea0']",
    "[class*='userProfileOuter']",
    "[class*='userPopoutOuter']",
    "[class*='themeContainer_ce8328']",
    "[class*='custom-user-profile-theme']",
    "[class*='user-profile-popout']"
].join(",");

type WidgetData = {
    appIcon?: string;
    appName?: string;
    title?: string;
    subtitle1?: string;
    subtitle2?: string;
    subtitle3?: string;
    image?: string;
    imageLayout?: string;
    activityAccessory?: string;
    stat1Icon?: string; stat1Name?: string; stat1Value?: string;
    stat2Icon?: string; stat2Name?: string; stat2Value?: string;
    stat3Icon?: string; stat3Name?: string; stat3Value?: string;
    stat4Icon?: string; stat4Name?: string; stat4Value?: string;
};

const FIELDS = [
    "appIcon", "appName", "title", "subtitle1", "subtitle2", "subtitle3",
    "image", "imageLayout", "activityAccessory",
    "stat1Icon", "stat1Name", "stat1Value",
    "stat2Icon", "stat2Name", "stat2Value",
    "stat3Icon", "stat3Name", "stat3Value",
    "stat4Icon", "stat4Name", "stat4Value"
] as const;

const STAT_SLOTS = [1, 2, 3, 4] as const;

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

function cleanUserId(value?: string | null) {
    const userId = (value ?? "").trim();
    return DISCORD_ID_RE.test(userId) ? userId : "";
}

// Registry so other o2cord users can see a published widget on someone
// ELSE's real profile - separate file from ProfileTheme's own registries,
// keyed by userId, same merge-not-replace pattern already proven there
// (a single incomplete fetch from the GitHub-raw CDN shouldn't wipe a
// known-good entry).
let remoteWidgets: Record<string, WidgetData> = {};
let lastRegistryRefresh = 0;
let registryRefreshPromise: Promise<void> | null = null;

function getWidgetRegistryUrl() {
    const updateManifestUrl = (typeof O2CORD_UPDATE_MANIFEST === "string" ? O2CORD_UPDATE_MANIFEST : "").trim();
    if (!updateManifestUrl) return "";

    try {
        return new URL("widgets.json", updateManifestUrl).href;
    } catch {
        return "";
    }
}

function cleanRemoteWidgets(raw: unknown): Record<string, WidgetData> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const widgets: Record<string, WidgetData> = {};
    for (const [rawUserId, rawWidget] of Object.entries(raw as Record<string, unknown>)) {
        const userId = cleanUserId(rawUserId.replace(/\D/g, ""));
        if (!userId || !rawWidget || typeof rawWidget !== "object") continue;

        const widget = cleanWidgetData(rawWidget as Partial<Record<typeof FIELDS[number], string>>);
        if (widget) widgets[userId] = widget;
    }

    return widgets;
}

async function refreshWidgetRegistry(force = false) {
    const registryUrl = getWidgetRegistryUrl();
    if (!registryUrl) return;

    const now = Date.now();
    if (!force && now - lastRegistryRefresh < REGISTRY_REFRESH_MS) return;
    if (registryRefreshPromise) return registryRefreshPromise;

    registryRefreshPromise = fetchWithGithubFallback(`${registryUrl}${registryUrl.includes("?") ? "&" : "?"}t=${now}`, {
        cache: "no-store"
    })
        .then(async res => {
            if (!res.ok) throw new Error(`Widget registry returned ${res.status}`);

            remoteWidgets = { ...remoteWidgets, ...cleanRemoteWidgets(await res.json()) };
            lastRegistryRefresh = Date.now();
        })
        .catch(() => {
            lastRegistryRefresh = Date.now();
        })
        .finally(() => {
            registryRefreshPromise = null;
        });

    return registryRefreshPromise;
}

function getWidgetForUser(userId: string): WidgetData | null {
    if (userId === UserStore.getCurrentUser()?.id) return getWidget();

    void refreshWidgetRegistry();
    return remoteWidgets[userId] ?? null;
}

// --- Profile userId resolution (adapted from ProfileTheme's proven
// implementation - React-fiber walking to find whose profile a given
// shell element actually belongs to). ---

function getElementReactData(element: Element) {
    const record = element as any;
    const values: any[] = [];

    for (const key in record) {
        if (key.startsWith("__reactProps$") || key.startsWith("__reactFiber$")) {
            const value = record[key];
            if (value) values.push(value);
        }
    }

    return values;
}

function pickDirectUserId(value: any) {
    if (!value || typeof value !== "object") return "";

    const candidates = [
        value.userId,
        value.profileUserId,
        value.displayProfile?.userId,
        value.user?.id,
        value.profileUser?.id,
        value.displayProfile?.user?.id,
        value.profile?.userId,
        value.profile?.user?.id
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "string" && DISCORD_ID_RE.test(candidate))
            return candidate;
    }

    if (
        typeof value.id === "string"
        && DISCORD_ID_RE.test(value.id)
        && (typeof value.username === "string" || typeof value.globalName === "string" || typeof value.avatar === "string")
    )
        return value.id;

    return "";
}

function findProfileUserId(value: any, seen = new WeakSet<object>(), depth = 0): string {
    if (!value || depth > REACT_SCAN_DEPTH) return "";
    if (typeof value !== "object" && typeof value !== "function") return "";
    if (seen.has(value)) return "";
    seen.add(value);

    const direct = pickDirectUserId(value);
    if (direct) return direct;

    const nestedKeys = ["props", "memoizedProps", "pendingProps", "user", "profileUser", "displayProfile", "profile", "userProfile", "displayProfileData", "children"];

    for (const key of nestedKeys) {
        let nested: any;
        try {
            nested = value[key];
        } catch {
            continue;
        }

        if (!nested) continue;

        if (Array.isArray(nested)) {
            for (const item of nested) {
                const found = findProfileUserId(item, seen, depth + 1);
                if (found) return found;
            }
            continue;
        }

        const found = findProfileUserId(nested, seen, depth + 1);
        if (found) return found;
    }

    return "";
}

function getKnownWidgetUserIds() {
    const ids = new Set<string>(Object.keys(remoteWidgets));
    const me = UserStore.getCurrentUser()?.id;
    if (me) ids.add(me);
    return ids;
}

function getMainAvatarUserId(shell: HTMLElement) {
    for (const img of Array.from(shell.querySelectorAll<HTMLImageElement>("img"))) {
        const src = img.currentSrc || img.src || "";
        const match = AVATAR_ID_RE.exec(src);
        if (!match) continue;

        const rect = img.getBoundingClientRect();
        if (Math.max(rect.width, rect.height) < MIN_PRIMARY_AVATAR_SIZE) continue;

        return match[1];
    }

    return "";
}

function getProfileUserIdFromAvatar(shell: HTMLElement) {
    const userId = getMainAvatarUserId(shell);
    return userId && getKnownWidgetUserIds().has(userId) ? userId : "";
}

function getProfileUserId(shell: HTMLElement) {
    const avatarUserId = getProfileUserIdFromAvatar(shell);
    if (avatarUserId) return avatarUserId;

    for (let node: Element | null = shell, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
        if (node === document.body || node === document.documentElement) break;

        for (const reactData of getElementReactData(node)) {
            const userId = findProfileUserId(reactData);
            if (userId) return userId;
        }
    }

    let scanned = 0;
    for (const child of Array.from(shell.querySelectorAll("*"))) {
        if (++scanned > REACT_SCAN_LIMIT) break;

        for (const reactData of getElementReactData(child)) {
            const userId = findProfileUserId(reactData);
            if (userId) return userId;
        }
    }

    return "";
}

function buildHeaderCard(widget: WidgetData): HTMLElement | null {
    if (!widget.appName && !widget.title && !widget.subtitle1 && !widget.subtitle2 && !widget.subtitle3 && !widget.image)
        return null;

    const isContained = widget.imageLayout === "contained";

    const card = document.createElement("div");
    card.className = "o2-widget-card o2-widget-header-card" + (isContained ? " o2-widget-layout-contained" : " o2-widget-layout-hero");

    // "Hero" bleeds the image across the whole card behind the text; "Contained"
    // puts it in its own separate square to the side instead - two real
    // Discord widget layout options, confirmed side by side from Ryder's own
    // reference screenshots.
    if (widget.image && !isContained) {
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

    if (widget.image && isContained) {
        const box = document.createElement("div");
        box.className = "o2-widget-contained-image-box";
        const img = document.createElement("img");
        img.className = "o2-widget-contained-image";
        img.src = widget.image;
        img.alt = "";
        box.appendChild(img);
        card.appendChild(box);
    }

    return card;
}

// "Widget Bottom" in the real widget is a 2x2 grid of small stat entries
// (icon + name + value each), not a single progress bar - confirmed from
// Ryder's own reference screenshot of the real TroubleChute widget example.
function buildStatsCard(widget: WidgetData): HTMLElement | null {
    const slots = STAT_SLOTS
        .map(n => ({
            icon: widget[`stat${n}Icon` as const],
            name: widget[`stat${n}Name` as const],
            value: widget[`stat${n}Value` as const]
        }))
        .filter(slot => slot.name || slot.value);

    if (!slots.length) return null;

    const card = document.createElement("div");
    card.className = "o2-widget-card o2-widget-stats-card";

    for (const slot of slots) {
        const item = document.createElement("div");
        item.className = "o2-widget-stat-item";

        if (slot.icon) {
            const icon = document.createElement("img");
            icon.className = "o2-widget-stat-icon";
            icon.src = slot.icon;
            icon.alt = "";
            item.appendChild(icon);
        }

        const text = document.createElement("div");
        text.className = "o2-widget-stat-text";

        if (slot.name) {
            const name = document.createElement("div");
            name.className = "o2-widget-stat-name";
            name.textContent = slot.name;
            text.appendChild(name);
        }

        if (slot.value) {
            const value = document.createElement("div");
            value.className = "o2-widget-stat-value";
            value.textContent = slot.value;
            text.appendChild(value);
        }

        item.appendChild(text);
        card.appendChild(item);
    }

    return card;
}

// Ryder's own Settings > Profile screen has a real widgets panel with
// sections like "Games I Like" (confirmed live: [class*="dragAndDropTarget"]
// only ever exists in that settings editor, never on the read-only profile
// view anyone else sees). Anchoring off that section just confirms we're on
// the right screen - injecting INTO it mixed our card in with his actual
// Fallout games, which he didn't want, so this adds a standalone section of
// its own at the very top of the panel instead, above every real section.
let lastCardWidgetJson = "";

function injectCard() {
    const widget = getWidget();

    document.querySelectorAll<HTMLElement>(`[${WIDGET_CARD_ATTR}]`).forEach(el => {
        if (!widget) el.remove();
    });

    if (!widget) return;

    const widgetJson = JSON.stringify(widget);

    document
        .querySelectorAll<HTMLElement>('[class*="dragAndDropTarget"] [class*="grid__"][class*="gameWidgetGrid"]')
        .forEach(grid => {
            const gamesSection = grid.closest("section");
            const panel = gamesSection?.parentElement;
            if (!gamesSection || !panel) return;

            const existing = panel.querySelector(`[${WIDGET_CARD_ATTR}]`);
            // Rebuild only when the content actually changed, not on every
            // scan - it used to skip rebuilding entirely once a card
            // existed, leaving it stuck showing whatever settings were
            // active at creation time (confirmed live: switching image
            // layout silently did nothing until the section was manually
            // removed). Comparing against the last-rendered JSON avoids
            // both that staleness and needless DOM churn on every
            // unrelated mutation the observer sees.
            if (existing && widgetJson === lastCardWidgetJson) return;
            existing?.remove();
            lastCardWidgetJson = widgetJson;

            const section = document.createElement("section");
            section.setAttribute(WIDGET_CARD_ATTR, "true");
            section.className = "o2-widget-section";

            const header = buildHeaderCard(widget);
            if (header) section.appendChild(header);

            const statsCard = buildStatsCard(widget);
            if (statsCard) section.appendChild(statsCard);

            panel.prepend(section);
        });
}

const MINI_PROFILE_ATTR = "data-o2-widget-mini";

function isOwnProfilePopout(shell: HTMLElement) {
    // Same heuristic ProfileTheme used: the real "Edit Profile" control only
    // ever shows on your OWN popout, never on someone else's.
    return shell.textContent?.includes("Edit Profile")
        || Boolean(shell.querySelector('[aria-label*="Edit Profile"]'));
}

// "Mini Profile" - the small popout card Discord shows when you click a
// user's avatar/name before opening their full profile (also covers the
// equivalent spot on a full profile view). Own account: your local
// settings. Anyone else: their published widget from the registry, if
// they have one - same shell-scanning approach ProfileTheme uses to
// figure out whose profile a given popout actually belongs to.
const lastShellWidgetJson = new WeakMap<HTMLElement, string>();

function injectOnProfiles() {
    document.querySelectorAll<HTMLElement>(PROFILE_SHELL_SELECTOR).forEach(shell => {
        const isOwn = isOwnProfilePopout(shell);
        const userId = isOwn ? UserStore.getCurrentUser()?.id : getProfileUserId(shell);
        const widget = userId ? getWidgetForUser(userId) : null;

        const existing = shell.querySelector<HTMLElement>(`[${MINI_PROFILE_ATTR}]`);
        if (!widget) {
            existing?.remove();
            lastShellWidgetJson.delete(shell);
            return;
        }

        const widgetJson = JSON.stringify(widget);
        if (existing && lastShellWidgetJson.get(shell) === widgetJson) return;
        existing?.remove();
        lastShellWidgetJson.set(shell, widgetJson);

        const header = buildHeaderCard(widget);
        if (!header) return;

        header.setAttribute(MINI_PROFILE_ATTR, "true");
        header.classList.add("o2-widget-mini-card");

        // The real Mini Profile always has a static "View All Stats" line
        // under the text (confirmed from Ryder's reference guide) - not
        // configurable content, just part of the fixed layout.
        const content = header.querySelector<HTMLElement>(".o2-widget-header-content");
        if (content) {
            const footer = document.createElement("div");
            footer.className = "o2-widget-view-all-stats";
            footer.textContent = "View All Stats";
            content.appendChild(footer);
        }

        // Appending directly to the outer shell rendered outside the
        // popout's own rounded card entirely (confirmed live - Ryder saw it
        // spill past the bottom edge, background not extending to cover
        // it). The popout's real content wrapper (its first element child)
        // is what Discord actually sizes/clips the visible card around.
        const contentWrapper = Array.from(shell.children).find(child => child instanceof HTMLElement) as HTMLElement | undefined;

        // Ryder specifically wants this right after the bio ("View Full
        // Bio"), before "Game Collection"/"In a call" - insert as a sibling
        // right after that bio section when found, otherwise fall back to
        // just appending at the end of the content wrapper.
        const bioSection = shell.querySelector<HTMLElement>('[class*="section_bf424d"]');
        if (bioSection) {
            bioSection.insertAdjacentElement("afterend", header);
        } else {
            (contentWrapper ?? shell).appendChild(header);
        }
    });
}

let observer: MutationObserver | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let registryRefreshTimer: number | undefined;

function queueScan() {
    if (scanTimer != null) return;
    scanTimer = setTimeout(() => {
        scanTimer = null;
        injectCard();
        injectOnProfiles();
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

    // Writes straight to settings.store on every change instead of only on
    // "Apply" - Ryder lost real edits closing the modal (the X button)
    // without applying first, since local React state alone doesn't
    // survive an unmount. Auto-saving here means there's nothing left to
    // lose regardless of how the modal gets closed.
    const set = (field: typeof FIELDS[number]) => (value: string) => {
        setValues(prev => ({ ...prev, [field]: value }));
        settings.store[field] = value;
    };

    // Live preview - rebuilds the same raw-DOM cards markProfileTargets uses
    // on the real profile, right here in the settings panel, on every
    // keystroke. Saves a rebuild+screenshot round trip just to see whether
    // a field change actually looks right.
    const previewRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const container = previewRef.current;
        if (!container) return;

        container.innerHTML = "";
        const widget = cleanWidgetData(values);
        if (!widget) return;

        const section = document.createElement("div");
        section.className = "o2-widget-section";

        const header = buildHeaderCard(widget);
        if (header) section.appendChild(header);

        const statsCard = buildStatsCard(widget);
        if (statsCard) section.appendChild(statsCard);

        container.appendChild(section);
    }, [values]);

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

    // Same "download a code, attach it to Claude" flow ProfileTheme uses to
    // get an entry into the shared registry, since a plain client mod can't
    // commit to GitHub itself.
    const copyPublishCode = () => {
        const userId = UserStore.getCurrentUser()?.id;
        const widget = cleanWidgetData(values);
        if (!userId || !widget) {
            showToast("Set at least one field first.", Toasts.Type.FAILURE);
            return;
        }

        const code = `${PUBLISH_CODE_PREFIX}${JSON.stringify({ userId, widget })}`;
        saveFile(new File([code], `o2cord-widget-${userId}.txt`, { type: "text/plain" }));
        showToast("Publish code saved to your Downloads folder. Attach that file to Claude.", Toasts.Type.SUCCESS);
    };

    return (
        <Forms.FormSection className="o2-widget-settings">
            <Forms.FormText>
                Adds a cosmetic two-card widget above your real widgets on Settings &gt; Profile, and on your Mini Profile. Only you see it until you publish it - after that, other o2cord users see it on your real profile too.
            </Forms.FormText>

            <Forms.FormTitle tag="h5">Header Card</Forms.FormTitle>
            {ImagePickerRow({ value: values.appIcon, onChange: set("appIcon"), placeholder: "App icon URL (small, top-left)" })}
            <TextInput value={values.appName} onChange={set("appName")} placeholder="App name (next to the icon)" />
            <TextInput value={values.title} onChange={set("title")} placeholder="Big title" />
            <TextInput value={values.activityAccessory} onChange={set("activityAccessory")} placeholder="Activity accessory text (small, next to app name)" />
            <TextInput value={values.subtitle1} onChange={set("subtitle1")} placeholder="Detail line 1" />
            <TextInput value={values.subtitle2} onChange={set("subtitle2")} placeholder="Detail line 2" />
            <TextInput value={values.subtitle3} onChange={set("subtitle3")} placeholder="Detail line 3" />
            {ImagePickerRow({ value: values.image, onChange: set("image"), placeholder: "Image URL" })}
            <div className="o2-widget-actions">
                <Button
                    color={values.imageLayout === "contained" ? Button.Colors.TRANSPARENT : Button.Colors.PRIMARY}
                    onClick={() => set("imageLayout")("hero")}
                >
                    Hero (bleeds across the card)
                </Button>
                <Button
                    color={values.imageLayout === "contained" ? Button.Colors.PRIMARY : Button.Colors.TRANSPARENT}
                    onClick={() => set("imageLayout")("contained")}
                >
                    Contained (own square, side by side)
                </Button>
            </div>

            <Forms.FormTitle tag="h5" className="o2-widget-section-title">Stats Card (separate box below, up to 4)</Forms.FormTitle>
            {STAT_SLOTS.map(n => (
                <div className="o2-widget-row" key={n}>
                    <TextInput value={values[`stat${n}Icon`]} onChange={set(`stat${n}Icon`)} placeholder={`Stat ${n} icon URL`} />
                    <TextInput value={values[`stat${n}Name`]} onChange={set(`stat${n}Name`)} placeholder={`Stat ${n} name`} />
                    <TextInput value={values[`stat${n}Value`]} onChange={set(`stat${n}Value`)} placeholder={`Stat ${n} value`} />
                </div>
            ))}

            <div className="o2-widget-actions">
                <Button onClick={apply}>Apply</Button>
                <Button onClick={copyPublishCode}>Copy Publish Code</Button>
                <Button color={Button.Colors.RED} onClick={clear}>Clear</Button>
            </div>

            <Forms.FormTitle tag="h5" className="o2-widget-section-title">Preview</Forms.FormTitle>
            <div className="o2-widget-preview" ref={previewRef} />
        </Forms.FormSection>
    );
}

const settingsDefs: Record<string, any> = {};
for (const field of FIELDS) {
    settingsDefs[field] = { type: OptionType.STRING, description: `Widget card ${field}`, default: "", hidden: true };
}
settingsDefs.manager = { type: OptionType.COMPONENT, description: "", component: WidgetSettings };

const settings = definePluginSettings(settingsDefs);

function WidgetIcon(props: { width?: number; height?: number; color?: string; }) {
    return (
        <svg width={props.width ?? 18} height={props.height ?? 18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="8" height="8" rx="1.5" stroke={props.color ?? "currentColor"} strokeWidth="2" />
            <rect x="13" y="3" width="8" height="8" rx="1.5" stroke={props.color ?? "currentColor"} strokeWidth="2" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" stroke={props.color ?? "currentColor"} strokeWidth="2" />
            <rect x="13" y="13" width="8" height="8" rx="1.5" stroke={props.color ?? "currentColor"} strokeWidth="2" />
        </svg>
    );
}

function WidgetHeaderButton() {
    return (
        <HeaderBarButton
            icon={WidgetIcon}
            tooltip="Widget"
            onClick={() => openPluginModal(Plugins.Widget)}
        />
    );
}

export default definePlugin({
    name: "Widget",
    description: "Adds a cosmetic two-card widget (app header + progress) above the real widgets on your own profile settings.",
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    settings,

    start() {
        void refreshWidgetRegistry(true);
        registryRefreshTimer = window.setInterval(() => void refreshWidgetRegistry(true), REGISTRY_REFRESH_MS);
        injectCard();
        injectOnProfiles();
        observer = new MutationObserver(queueScan);
        observer.observe(document.body, { childList: true, subtree: true });
        addHeaderBarButton("o2cord-widget", () => <WidgetHeaderButton />, 900);
    },

    stop() {
        observer?.disconnect();
        observer = null;
        if (scanTimer != null) {
            clearTimeout(scanTimer);
            scanTimer = null;
        }
        if (registryRefreshTimer != null) {
            window.clearInterval(registryRefreshTimer);
            registryRefreshTimer = undefined;
        }
        document.querySelectorAll(`[${WIDGET_CARD_ATTR}], [${MINI_PROFILE_ATTR}]`).forEach(el => el.remove());
        removeHeaderBarButton("o2cord-widget");
    }
});
