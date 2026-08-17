/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { Devs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { fetchWithGithubFallback } from "@utils/githubFallbackFetch";
import { Margins } from "@utils/margins";
import { isDebugOwner } from "@utils/o2Debug";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { chooseFile, saveFile } from "@utils/web";
import { Button, Forms, React, Slider, showToast, TextInput, Toasts, UserStore } from "@webpack/common";

const PUBLISH_CODE_PREFIX = "O2PROFILE_PUBLISH:";
const LOCAL_PROFILE_THEMES_KEY = "o2cord.debug.localProfileThemes";
const LOCAL_PROFILE_THEMES_UPDATED_EVENT = "o2cord:debug-local-profile-themes-updated";
const STYLE_ID = "o2-profile-theme-vars";
const TARGET_CLASS = "o2-profile-theme-target";
const TARGET_ATTR = "data-o2-profile-theme-target";
const TARGET_KIND_ATTR = "data-o2-profile-theme-kind";
const IMAGE_LAYER_ATTR = "data-o2-profile-theme-layer";
const TRANSPARENT_CHILD_ATTR = "data-o2-profile-theme-transparent";
const PANEL_CHILD_ATTR = "data-o2-profile-theme-panel";
const MAX_LOCAL_IMAGE_BYTES = 8 * 1024 * 1024;
const RYDER_USER_ID = "719085334989897750";
const DISCORD_ID_RE = /^\d{17,20}$/;
const REGISTRY_REFRESH_MS = 30_000;
const REACT_SCAN_LIMIT = 220;
const REACT_SCAN_DEPTH = 5;
const PROFILE_SCAN_THROTTLE_MS = 250;
const MIN_PRIMARY_AVATAR_SIZE = 48;
const AVATAR_ID_RE = /\/(?:avatars\/|users\/)(\d{17,20})(?:\/avatars)?\//;

const PROFILE_EDITOR_MARKERS = [
    "Main Profile",
    "Nameplate",
    "Avatar & Decoration",
    "Display Name Style",
    "Theme & Banner",
    "Profile Effect & Frame",
    "Change Profile Frame",
    "Your Frames",
    "See What's in Shop",
    "Your Effects",
    "Collectibles",
    "Edit Image"
];
const PROFILE_DIALOG_EDITOR_MARKERS = [
    "Avatar & Decoration",
    "Change Profile Frame",
    "Display Name Style",
    "Edit Image",
    "Main Profile",
    "Nameplate",
    "Profile Effect & Frame",
    "See What's in Shop",
    "Theme & Banner",
    "Your Effects",
    "Your Frames"
];
// "Switch Accounts" / "Copy User ID" are just footer buttons on every
// self-profile popout, so matching on them blocked Ryder's own real
// profile card. "Add an existing account" only shows up once that button
// is actually opened into the real multi-account switcher list.
const ACCOUNT_SWITCHER_MARKERS = ["add an existing account", "add another account"];

type ProfileThemeKind = "popout" | "full";
type ProfileThemes = Record<string, string>;
type ProfileThemeTarget = {
    element: HTMLElement;
    userId: string;
    imageUrl: string;
};
// Ryder's own personal, local-only reference list of who he's added an
// image for - lives in this machine's DataStore, never synced anywhere.
// Publishing a given entry to everyone else still goes through its own
// "Copy Publish Code" per entry, same as before.
type LocalProfileThemeEntry = {
    id: string;
    userId: string;
    imageUrl: string;
};

let observer: MutationObserver | null = null;
let scanFrame: number | null = null;
let scanDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let scanTimeouts: ReturnType<typeof setTimeout>[] = [];
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let registryRefreshTimer: number | undefined;
let lastRegistryRefresh = 0;
let registryRefreshPromise: Promise<void> | null = null;
let remoteProfileThemes: ProfileThemes = {};
let styleElement: HTMLStyleElement | null = null;
let lifecycleListenersActive = false;
let applyingTargets = false;
let lastProfileScan = 0;
let lastProfileThemeCss = "";
let localProfileThemeEntries: LocalProfileThemeEntry[] = [];
let localProfileThemesById: ProfileThemes = {};
let localProfileThemesLoaded = false;

function cleanImageUrl(value?: string | null) {
    return (value ?? "").trim();
}

function cssString(value: string) {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/[\n\r\f]/g, "");
}

const PROFILE_TARGET_SELECTOR = [
    "[class*='popoutContainer'][class*='accountPopout'] [class*='outer_c0bea0']",
    "[class*='accountPopout'] [class*='outer_c0bea0']",
    "[role='dialog'] [class*='outer_c0bea0']",
    "[class*='outer_c0bea0']",
    "[class*='userProfileOuter']",
    "[class*='userPopoutOuter']",
    "[class*='themeContainer_ce8328']",
    "[class*='profilePanel'] [class*='userProfile']",
    "[style*='--profile-gradient-primary-color']",
    "[style*='--profile-gradient-secondary-color']"
].join(",");

const PROFILE_SHELL_SELECTOR = [
    "[class*='outer_c0bea0']",
    "[class*='userProfileOuter']",
    "[class*='userPopoutOuter']",
    "[class*='themeContainer_ce8328']",
    "[class*='custom-user-profile-theme']",
    "[class*='user-profile-popout']"
].join(",");

const PROFILE_FRAME_SELECTOR = [
    "[class*='profileFrameContainer']",
    "[class*='custom-profile-frame']",
    "[class*='profileFrameLayer']",
    "[class*='profileFrameMask']",
    "[class*='avatarDecoration']",
    "[class*='decoration']",
    "[src*='collectibles-shop']",
    "[style*='collectibles-shop']",
    "[class*='profileEffect']"
].join(",");

const PROFILE_THEME_EXCLUDED_SELECTOR = [
    "[class*='frameGridItem']",
    "[class*='profilePreviewContainer']",
    "[class*='profileContainer_c9a5b2']",
    "[class*='previewContainer_c9a5b2']",
    "[aria-label*='Profile Frame Preview']",
    "[class*='collectiblesShop']",
    "[class*='collectibles-shop']",
    "[class*='shop_']",
    "[class*='shop__']"
].join(",");

const TRANSPARENT_CHILD_SELECTOR = [
    "[class*='inner_c0bea0']",
    "[class*='userProfileInner']",
    "[class*='profileFrame__']",
    "[class*='overlayBackground']",
    "[class*='bodyInnerWrapper']",
    "[class*='body_ce8328']",
    "[class*='userInfo_ce8328']",
    "[class*='scrollerBase']",
    "[class*='thin_']",
    "[style*='--profile-gradient-modal-background-color']"
].join(",");

const PANEL_CHILD_SELECTOR = [
    "[class*='activity']",
    "[class*='section']",
    "[class*='menuOverlay']",
    "[class*='card_']",
    "[class*='card__']"
].join(",");

function isAccountSwitcherPopout(element: HTMLElement) {
    for (let node: Element | null = element, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
        if (node === document.body || node === document.documentElement)
            break;

        const text = (node.textContent ?? "").toLowerCase();
        if (ACCOUNT_SWITCHER_MARKERS.some(marker => text.includes(marker)))
            return true;
    }

    return false;
}

function isBlockedProfileArea(element: HTMLElement) {
    // The real multi-account switcher list reuses the same profile-card
    // markup as a real profile, but it isn't one - detect it by its stable
    // "add an existing account" text and skip it outright.
    if (isAccountSwitcherPopout(element))
        return true;

    const settingsRoot = element.closest<HTMLElement>("[class*='standardSidebarView'], [class*='contentRegion']");
    if (settingsRoot) {
        const text = settingsRoot.textContent ?? "";
        return PROFILE_EDITOR_MARKERS.some(marker => text.includes(marker));
    }

    const dialog = element.closest<HTMLElement>("[role='dialog']");
    const text = dialog?.textContent ?? "";

    return PROFILE_DIALOG_EDITOR_MARKERS.some(marker => text.includes(marker));
}

function getProfileShell(element: Element) {
    if (element.closest(PROFILE_THEME_EXCLUDED_SELECTOR))
        return null;

    if (element.matches(PROFILE_SHELL_SELECTOR))
        return isBlockedProfileArea(element as HTMLElement) ? null : element as HTMLElement;

    const shell = element.closest<HTMLElement>(PROFILE_SHELL_SELECTOR);
    if (shell?.closest(PROFILE_THEME_EXCLUDED_SELECTOR))
        return null;

    if (shell && isBlockedProfileArea(shell))
        return null;

    return shell;
}

function getClassName(element: Element) {
    const { className } = element as HTMLElement;
    return typeof className === "string" ? className : "";
}

function isProfileFramePart(element: Element) {
    const className = getClassName(element);

    return className.includes("profileFrameLayer")
        || className.includes("profileFrameMask")
        || className.includes("avatarDecoration")
        || hasProfileFrameUrl(element);
}

function hasProfileFrameUrl(element: Element) {
    const urlText = [
        element instanceof HTMLImageElement ? element.src : "",
        element.getAttribute("src") ?? "",
        element.getAttribute("style") ?? "",
        element instanceof HTMLElement ? element.style.backgroundImage : ""
    ].join(" ");

    return urlText.includes("collectibles-shop");
}

function cleanUserId(value?: string | null) {
    const userId = (value ?? "").trim();
    return DISCORD_ID_RE.test(userId) ? userId : "";
}

function cleanProfileThemes(raw: unknown): ProfileThemes {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const source = "users" in raw && raw.users && typeof raw.users === "object" && !Array.isArray(raw.users)
        ? raw.users
        : raw;

    const profileThemes: ProfileThemes = {};
    for (const [rawUserId, rawImageUrl] of Object.entries(source as Record<string, unknown>)) {
        const userId = cleanUserId(rawUserId.replace(/\D/g, ""));
        const imageUrl = cleanImageUrl(typeof rawImageUrl === "string" ? rawImageUrl : "");

        if (userId && imageUrl)
            profileThemes[userId] = imageUrl;
    }

    return profileThemes;
}

function getTargetUserId() {
    return cleanUserId(settings.store.targetUserId) || RYDER_USER_ID;
}

function getAnyConfiguredImageUrl() {
    return cleanImageUrl(settings.store.imageUrl) || cleanImageUrl(settings.store.publicImageUrl);
}

function hasRemoteProfileThemes() {
    return Object.keys(remoteProfileThemes).length > 0;
}

function getProfileThemeRegistryUrl() {
    const updateManifestUrl = cleanImageUrl(typeof O2CORD_UPDATE_MANIFEST === "string" ? O2CORD_UPDATE_MANIFEST : "");
    if (!updateManifestUrl) return "";

    try {
        return new URL("profile-themes.json", updateManifestUrl).href;
    } catch {
        return "";
    }
}

function hasLocalProfileThemeEntries() {
    return Object.keys(localProfileThemesById).length > 0;
}

function hasProfileThemeSource() {
    return Boolean(
        getAnyConfiguredImageUrl()
        || hasRemoteProfileThemes()
        || getProfileThemeRegistryUrl()
        || hasLocalProfileThemeEntries()
    );
}

async function refreshProfileThemeRegistry(force = false) {
    const registryUrl = getProfileThemeRegistryUrl();
    if (!registryUrl) return;

    const now = Date.now();
    if (!force && now - lastRegistryRefresh < REGISTRY_REFRESH_MS) return;
    if (registryRefreshPromise) return registryRefreshPromise;

    registryRefreshPromise = fetchWithGithubFallback(`${registryUrl}${registryUrl.includes("?") ? "&" : "?"}t=${now}`, {
        cache: "no-store"
    })
        .then(async res => {
            if (!res.ok) throw new Error(`ProfileTheme registry returned ${res.status}`);

            remoteProfileThemes = cleanProfileThemes(await res.json());
            lastRegistryRefresh = Date.now();
            scheduleProfileScans();
        })
        .catch(() => {
            lastRegistryRefresh = Date.now();
        })
        .finally(() => {
            registryRefreshPromise = null;
        });

    return registryRefreshPromise;
}

function rebuildLocalProfileThemesIndex() {
    const next: ProfileThemes = {};
    for (const entry of localProfileThemeEntries) {
        const userId = cleanUserId(entry.userId);
        const imageUrl = cleanImageUrl(entry.imageUrl);
        if (userId && imageUrl) next[userId] = imageUrl;
    }
    localProfileThemesById = next;
}

async function loadLocalProfileThemeEntries() {
    if (localProfileThemesLoaded) return localProfileThemeEntries;

    try {
        const stored = await DataStore.get<LocalProfileThemeEntry[]>(LOCAL_PROFILE_THEMES_KEY);
        if (Array.isArray(stored)) localProfileThemeEntries = stored;
    } catch { }

    rebuildLocalProfileThemesIndex();
    localProfileThemesLoaded = true;
    return localProfileThemeEntries;
}

async function writeLocalProfileThemeEntries(next: LocalProfileThemeEntry[]) {
    localProfileThemeEntries = next;
    rebuildLocalProfileThemesIndex();
    await DataStore.set(LOCAL_PROFILE_THEMES_KEY, next);
    window.dispatchEvent(new CustomEvent(LOCAL_PROFILE_THEMES_UPDATED_EVENT, { detail: next }));
    scheduleProfileScans();
}

function onLocalProfileThemesUpdated(event: Event) {
    const entries = (event as CustomEvent<LocalProfileThemeEntry[]>).detail;
    if (!Array.isArray(entries)) return;

    localProfileThemeEntries = entries;
    rebuildLocalProfileThemesIndex();
    scheduleProfileScans();
}

let localProfileThemesListenerActive = false;

function addLocalProfileThemesListener() {
    if (localProfileThemesListenerActive) return;
    localProfileThemesListenerActive = true;
    window.addEventListener(LOCAL_PROFILE_THEMES_UPDATED_EVENT, onLocalProfileThemesUpdated);
}

function removeLocalProfileThemesListener() {
    if (!localProfileThemesListenerActive) return;
    localProfileThemesListenerActive = false;
    window.removeEventListener(LOCAL_PROFILE_THEMES_UPDATED_EVENT, onLocalProfileThemesUpdated);
}

function getRemoteProfileThemeUrl(userId?: string | null) {
    const cleanId = cleanUserId(userId);
    if (!cleanId) return "";

    void refreshProfileThemeRegistry();
    return remoteProfileThemes[cleanId] ?? "";
}

function getImageUrlForUser(userId: string) {
    const publicImageUrl = cleanImageUrl(settings.store.publicImageUrl);
    const localImageUrl = cleanImageUrl(settings.store.imageUrl);
    const savedImageUrl = cleanImageUrl(localProfileThemesById[userId]);

    if (userId === getTargetUserId())
        return publicImageUrl || localImageUrl || savedImageUrl || getRemoteProfileThemeUrl(userId);

    return savedImageUrl || getRemoteProfileThemeUrl(userId);
}

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
        && (
            typeof value.username === "string"
            || typeof value.globalName === "string"
            || typeof value.avatar === "string"
        )
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

    const nestedKeys = [
        "props",
        "memoizedProps",
        "pendingProps",
        "user",
        "profileUser",
        "displayProfile",
        "profile",
        "userProfile",
        "displayProfileData",
        "children"
    ];

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

function getKnownThemedUserIds() {
    const ids = new Set<string>();

    const targetId = cleanUserId(settings.store.targetUserId);
    if (targetId) ids.add(targetId);
    ids.add(RYDER_USER_ID);

    for (const id of Object.keys(remoteProfileThemes))
        ids.add(id);

    for (const id of Object.keys(localProfileThemesById))
        ids.add(id);

    return ids;
}

function getMainAvatarUserId(shell: HTMLElement) {
    for (const img of Array.from(shell.querySelectorAll<HTMLImageElement>("img"))) {
        const src = img.currentSrc || img.src || "";
        const match = AVATAR_ID_RE.exec(src);
        if (!match) continue;

        const rect = img.getBoundingClientRect();
        if (Math.max(rect.width, rect.height) < MIN_PRIMARY_AVATAR_SIZE) continue;

        // First large avatar in document order is the profile's own header
        // avatar; anything after it (mutual friends, in-voice participants)
        // is someone else's picture and must not be mistaken for the owner.
        return match[1];
    }

    return "";
}

function getProfileUserIdFromAvatar(shell: HTMLElement) {
    const userId = getMainAvatarUserId(shell);
    return userId && getKnownThemedUserIds().has(userId) ? userId : "";
}

function getProfileUserId(shell: HTMLElement) {
    const avatarUserId = getProfileUserIdFromAvatar(shell);
    if (avatarUserId) return avatarUserId;

    for (let node: Element | null = shell, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
        if (node === document.body || node === document.documentElement)
            break;

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

function getTargetForShell(shell: HTMLElement): ProfileThemeTarget | null {
    const userId = getProfileUserId(shell);

    if (userId) {
        const imageUrl = getImageUrlForUser(userId);
        return imageUrl ? { element: shell, userId, imageUrl } : null;
    }

    // Only preview on Ryder's own account. Otherwise this would fire for
    // whatever Discord account happens to be logged in (alts included),
    // stamping Ryder's image onto profiles that never asked for it.
    if (isCurrentUserProfileShell(shell) && UserStore.getCurrentUser()?.id === RYDER_USER_ID) {
        const imageUrl = getImageUrlForUser(RYDER_USER_ID) || getAnyConfiguredImageUrl();
        return imageUrl ? { element: shell, userId: RYDER_USER_ID, imageUrl } : null;
    }

    return null;
}

function addTargetFromElement(targets: Map<HTMLElement, ProfileThemeTarget>, element: Element) {
    const shell = getProfileShell(element);
    if (!shell) return;

    const target = getTargetForShell(shell);
    if (target) targets.set(target.element, target);
}

function hasOwnProfileControls(element: HTMLElement) {
    const text = element.textContent ?? "";

    return text.includes("Edit Profile")
        || text.includes("Edit Server Profile")
        || Boolean(element.querySelector("[aria-label*='Edit Profile'], [aria-label*='Edit Server Profile']"));
}

function isCurrentUserProfileShell(element: HTMLElement) {
    const me = UserStore.getCurrentUser() as any;
    if (!me?.id) return false;
    if (!hasOwnProfileControls(element)) return false;

    const avatarUrl = typeof me.getAvatarURL === "function"
        ? me.getAvatarURL(undefined, 128, true)
        : "";
    const avatarHash = typeof me.avatar === "string" ? me.avatar : "";

    if (!avatarUrl && !avatarHash) return true;

    return Array.from(element.querySelectorAll<HTMLImageElement>("img"))
        .some(img => {
            const src = img.src || "";
            return Boolean((avatarUrl && src.includes(avatarUrl.split("?")[0])) || (avatarHash && src.includes(avatarHash)));
        });
}

function ensureImageLayer(element: HTMLElement) {
    const existingLayer = Array
        .from(element.children)
        .find(child => child instanceof HTMLElement && child.hasAttribute(IMAGE_LAYER_ATTR));

    if (existingLayer) return;

    const layer = document.createElement("div");
    layer.className = "o2-profile-theme-image-layer";
    layer.setAttribute(IMAGE_LAYER_ATTR, "true");
    layer.setAttribute("aria-hidden", "true");
    element.prepend(layer);
}

function getProfileThemeKind(element: HTMLElement): ProfileThemeKind {
    const width = element.getBoundingClientRect().width;

    if (width >= 500)
        return "full";

    if (element.closest("[class*='userProfileModal'], [class*='fullSize'], [class*='profileModal']"))
        return "full";

    return "popout";
}

function applyTargetFallback({ element, userId, imageUrl }: ProfileThemeTarget) {
    const kind = getProfileThemeKind(element);
    const imageValue = `url("${cssString(imageUrl)}")`;

    if (!element.classList.contains(TARGET_CLASS))
        element.classList.add(TARGET_CLASS);
    if (element.getAttribute(TARGET_ATTR) !== "true")
        element.setAttribute(TARGET_ATTR, "true");
    if (element.getAttribute(TARGET_KIND_ATTR) !== kind)
        element.setAttribute(TARGET_KIND_ATTR, kind);
    if (element.getAttribute("data-o2-profile-theme-user-id") !== userId)
        element.setAttribute("data-o2-profile-theme-user-id", userId);
    if (element.style.getPropertyValue("--o2-profile-theme-image") !== imageValue)
        element.style.setProperty("--o2-profile-theme-image", imageValue);
    ensureImageLayer(element);
    if (element.style.getPropertyValue("background-color") !== "transparent")
        element.style.setProperty("background-color", "transparent", "important");
    applyChildFallbacks(element);
}

function applyTransparentChildFallback(element: HTMLElement) {
    if (isProfileFramePart(element)) return;
    if (element.hasAttribute(TRANSPARENT_CHILD_ATTR)) return;

    element.setAttribute(TRANSPARENT_CHILD_ATTR, "true");
    element.style.setProperty("background", "transparent", "important");
    element.style.setProperty("background-color", "transparent", "important");
}

function applyPanelChildFallback(element: HTMLElement) {
    if (isProfileFramePart(element)) return;
    if (element.hasAttribute(PANEL_CHILD_ATTR)) return;

    element.setAttribute(PANEL_CHILD_ATTR, "true");
    element.style.setProperty("background", "var(--o2-profile-theme-panel-bg)", "important");
    element.style.setProperty("background-color", "transparent", "important");
}

function applyChildFallbacks(element: HTMLElement) {
    element
        .querySelectorAll<HTMLElement>(TRANSPARENT_CHILD_SELECTOR)
        .forEach(applyTransparentChildFallback);

    element
        .querySelectorAll<HTMLElement>(PANEL_CHILD_SELECTOR)
        .forEach(applyPanelChildFallback);
}

function clearTargetFallback(element: Element) {
    element.classList.remove(TARGET_CLASS);
    element.removeAttribute(TARGET_ATTR);
    element.removeAttribute(TARGET_KIND_ATTR);
    element.removeAttribute("data-o2-profile-theme-user-id");

    element
        .querySelectorAll(`[${IMAGE_LAYER_ATTR}]`)
        .forEach(layer => layer.remove());

    element
        .querySelectorAll(`[${TRANSPARENT_CHILD_ATTR}], [${PANEL_CHILD_ATTR}]`)
        .forEach(clearChildFallback);

    if (element instanceof HTMLElement) {
        element.style.removeProperty("--o2-profile-theme-image");
        element.style.removeProperty("background");
        element.style.removeProperty("background-color");
    }
}

function clearChildFallback(element: Element) {
    element.removeAttribute(TRANSPARENT_CHILD_ATTR);
    element.removeAttribute(PANEL_CHILD_ATTR);

    if (element instanceof HTMLElement) {
        element.style.removeProperty("background");
        element.style.removeProperty("background-color");
    }
}

function markProfileTargets() {
    if (!hasProfileThemeSource()) return;
    if (applyingTargets) return;

    applyingTargets = true;

    try {
        const targets = new Map<HTMLElement, ProfileThemeTarget>();

        // Only PROFILE_TARGET_SELECTOR seeds a scan of the whole document.
        // A second global scan keyed on PROFILE_FRAME_SELECTOR's generic
        // "decoration" fragments used to also match decorated avatars in
        // voice call tiles elsewhere on the page - removed on purpose.
        document
            .querySelectorAll<HTMLElement>(PROFILE_TARGET_SELECTOR)
            .forEach(element => addTargetFromElement(targets, element));

        document.querySelectorAll(`.${TARGET_CLASS}, [${TARGET_ATTR}]`).forEach(element => {
            if (!document.documentElement.contains(element)) {
                clearTargetFallback(element);
                return;
            }

            if (element instanceof HTMLElement && isBlockedProfileArea(element)) {
                clearTargetFallback(element);
                return;
            }

            if (targets.has(element as HTMLElement))
                return;

            clearTargetFallback(element);
        });

        document.querySelectorAll(`[${IMAGE_LAYER_ATTR}]`).forEach(layer => {
            const parent = layer.parentElement;
            if (!parent || !targets.has(parent))
                layer.remove();
        });

        targets.forEach(applyTargetFallback);
        lastProfileScan = Date.now();
    } finally {
        applyingTargets = false;
    }
}

function ensureProfileThemeStyle() {
    if (styleElement?.isConnected) return styleElement;

    document.getElementById(STYLE_ID)?.remove();
    styleElement = createAndAppendStyle(STYLE_ID, managedStyleRootNode);
    return styleElement;
}

function queueProfileTargetScan() {
    if (scanFrame != null) return;

    const waitMs = PROFILE_SCAN_THROTTLE_MS - (Date.now() - lastProfileScan);
    if (waitMs > 0) {
        if (scanDebounceTimer == null) {
            scanDebounceTimer = setTimeout(() => {
                scanDebounceTimer = null;
                queueProfileTargetScan();
            }, waitMs);
        }
        return;
    }

    scanFrame = requestAnimationFrame(() => {
        scanFrame = null;
        markProfileTargets();
    });
}

function queueImmediateProfileTargetScan() {
    if (!hasProfileThemeSource()) return;

    try {
        markProfileTargets();
    } catch { }
}

function startProfileWatcher() {
    stopProfileWatcher(false);

    scheduleProfileScans();
    observer = new MutationObserver(() => {
        queueProfileTargetScan();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    addLifecycleListeners();
    startKeepAlive();
}

function scheduleProfileScans() {
    scanTimeouts.forEach(clearTimeout);
    scanTimeouts = [];
    queueProfileTargetScan();

    for (const delay of [50, 150, 350, 800, 1600, 3000, 5000])
        scanTimeouts.push(setTimeout(queueImmediateProfileTargetScan, delay));
}

function handleAppLifecycleChange() {
    if (!hasProfileThemeSource()) return;
    refreshProfileTheme();
    queueImmediateProfileTargetScan();
}

function startKeepAlive() {
    if (keepAliveInterval != null) return;

    keepAliveInterval = setInterval(() => {
        if (!hasProfileThemeSource()) return;

        writeProfileThemeVars();
        queueImmediateProfileTargetScan();
    }, 2500);
}

function stopKeepAlive() {
    if (keepAliveInterval == null) return;

    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
}

function startRegistryRefresh() {
    void refreshProfileThemeRegistry(true);

    if (registryRefreshTimer != null) return;
    registryRefreshTimer = window.setInterval(() => void refreshProfileThemeRegistry(true), REGISTRY_REFRESH_MS);
}

function stopRegistryRefresh() {
    if (registryRefreshTimer == null) return;

    window.clearInterval(registryRefreshTimer);
    registryRefreshTimer = undefined;
}

function addLifecycleListeners() {
    if (lifecycleListenersActive) return;

    lifecycleListenersActive = true;
    window.addEventListener("blur", handleAppLifecycleChange);
    window.addEventListener("focus", handleAppLifecycleChange);
    window.addEventListener("resize", handleAppLifecycleChange);
    document.addEventListener("visibilitychange", handleAppLifecycleChange);
}

function removeLifecycleListeners() {
    if (!lifecycleListenersActive) return;

    lifecycleListenersActive = false;
    window.removeEventListener("blur", handleAppLifecycleChange);
    window.removeEventListener("focus", handleAppLifecycleChange);
    window.removeEventListener("resize", handleAppLifecycleChange);
    document.removeEventListener("visibilitychange", handleAppLifecycleChange);
}

function stopProfileWatcher(clearTargets = true) {
    observer?.disconnect();
    observer = null;
    removeLifecycleListeners();

    if (scanFrame != null) {
        cancelAnimationFrame(scanFrame);
        scanFrame = null;
    }
    if (scanDebounceTimer != null) {
        clearTimeout(scanDebounceTimer);
        scanDebounceTimer = null;
    }

    scanTimeouts.forEach(clearTimeout);
    scanTimeouts = [];
    stopKeepAlive();
    stopRegistryRefresh();

    if (clearTargets)
        document.querySelectorAll(`.${TARGET_CLASS}, [${TARGET_ATTR}]`).forEach(clearTargetFallback);
}

function writeProfileThemeVars() {
    const root = document.documentElement;

    if (!hasProfileThemeSource())
        return false;

    const brightness = Math.min(1, Math.max(0.05, settings.store.brightness ?? 0.6));
    const style = ensureProfileThemeStyle();

    const nextCss = `
        :root {
            --o2-profile-theme-image-opacity: ${brightness};
            --o2-profile-theme-dim: 0.18;
            --o2-profile-theme-panel-bg: rgba(12, 12, 16, 0.34);
        }
    `;
    if (lastProfileThemeCss !== nextCss) {
        style.textContent = nextCss;
        lastProfileThemeCss = nextCss;
    }
    root.classList.add("o2-profile-theme-active");
    return true;
}

function refreshProfileTheme() {
    if (!hasProfileThemeSource()) return;

    if (writeProfileThemeVars())
        scheduleProfileScans();
    void refreshProfileThemeRegistry();
}

function applyProfileTheme() {
    addLocalProfileThemesListener();

    // hasProfileThemeSource() (and therefore whether this activates at all)
    // can depend on the local entries list, which loads asynchronously from
    // DataStore - if it resolves after this first pass decided there was
    // nothing to show, redo the activation once it's in.
    void loadLocalProfileThemeEntries().then(() => {
        if (writeProfileThemeVars()) {
            startProfileWatcher();
            startRegistryRefresh();
            scheduleProfileScans();
        }
    });

    if (!writeProfileThemeVars()) return;
    startProfileWatcher();
    startRegistryRefresh();
    scheduleProfileScans();
}

function removeProfileTheme() {
    document.documentElement.classList.remove("o2-profile-theme-active");
    document.getElementById(STYLE_ID)?.remove();
    styleElement = null;
    lastProfileThemeCss = "";
    stopProfileWatcher();
    removeLocalProfileThemesListener();
}

function clearProfileTheme() {
    settings.store.imageUrl = "";
    settings.store.publicImageUrl = "";
    removeProfileTheme();
}

function readFileAsDataUrl(file: File) {
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

export function PublicProfileThemeSettings() {
    const [brightness, setBrightness] = React.useState(settings.store.brightness ?? 0.6);

    return (
        <Forms.FormSection className="o2-profile-theme-settings">
            <Forms.FormTitle tag="h3">Profile Theme</Forms.FormTitle>
            <Forms.FormText>
                Shows a decorative background image on selected profiles across o2cord.
            </Forms.FormText>
            <Forms.FormTitle tag="h5">Brightness</Forms.FormTitle>
            <Slider
                initialValue={brightness}
                minValue={0.1}
                maxValue={1}
                markers={[0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]}
                stickToMarkers={false}
                onValueChange={value => {
                    setBrightness(value);
                    settings.store.brightness = value;
                    refreshProfileTheme();
                }}
                onValueRender={value => `${Math.round(value * 100)}%`}
            />
        </Forms.FormSection>
    );
}

function DebugProfileThemeSettings() {
    const [imageUrl, setImageUrl] = React.useState(settings.store.imageUrl);
    const [publicImageUrl, setPublicImageUrl] = React.useState(settings.store.publicImageUrl);
    const [targetUserId, setTargetUserId] = React.useState(settings.store.targetUserId || RYDER_USER_ID);
    const [brightness, setBrightness] = React.useState(settings.store.brightness ?? 0.6);
    const [savedTargets, setSavedTargets] = React.useState<LocalProfileThemeEntry[]>(localProfileThemeEntries);

    React.useEffect(() => {
        let cancelled = false;

        loadLocalProfileThemeEntries().then(entries => {
            if (!cancelled) setSavedTargets(entries);
        });

        const onUpdate = (event: Event) => {
            const entries = (event as CustomEvent<LocalProfileThemeEntry[]>).detail;
            if (Array.isArray(entries)) setSavedTargets(entries);
        };
        window.addEventListener(LOCAL_PROFILE_THEMES_UPDATED_EVENT, onUpdate);

        return () => {
            cancelled = true;
            window.removeEventListener(LOCAL_PROFILE_THEMES_UPDATED_EVENT, onUpdate);
        };
    }, []);

    const save = (
        nextImageUrl = imageUrl,
        nextTargetUserId = targetUserId,
        nextPublicImageUrl = publicImageUrl
    ) => {
        settings.store.imageUrl = cleanImageUrl(nextImageUrl);
        settings.store.publicImageUrl = cleanImageUrl(nextPublicImageUrl);
        settings.store.targetUserId = cleanUserId(nextTargetUserId) || RYDER_USER_ID;
        applyProfileTheme();
        showToast("ProfileTheme applied.", Toasts.Type.SUCCESS);
    };

    const chooseImage = async () => {
        const picked = await pickLocalImage();
        if (!picked) return;

        setImageUrl(picked);
        if (!publicImageUrl)
            setPublicImageUrl(picked);
        save(picked, targetUserId, publicImageUrl || picked);
    };

    const clear = () => {
        setImageUrl("");
        setPublicImageUrl("");
        clearProfileTheme();
        showToast("ProfileTheme cleared.", Toasts.Type.MESSAGE);
    };

    const downloadPublishCode = (userId: string, imageUrl: string) => {
        const code = `${PUBLISH_CODE_PREFIX}${JSON.stringify({ userId, imageUrl })}`;
        saveFile(new File([code], `o2cord-profile-${userId}.txt`, { type: "text/plain" }));
        showToast("Publish code saved to your Downloads folder. Attach that file to Claude.", Toasts.Type.SUCCESS);
    };

    const copyPublishCode = async () => {
        const userId = cleanUserId(targetUserId) || RYDER_USER_ID;
        const publishImageUrl = cleanImageUrl(publicImageUrl) || cleanImageUrl(imageUrl);

        if (!publishImageUrl) {
            showToast("Set an image first.", Toasts.Type.FAILURE);
            return;
        }

        downloadPublishCode(userId, publishImageUrl);
    };

    const saveCurrentToList = async () => {
        const userId = cleanUserId(targetUserId) || RYDER_USER_ID;
        const entryImageUrl = cleanImageUrl(publicImageUrl) || cleanImageUrl(imageUrl);

        if (!entryImageUrl) {
            showToast("Set an image first.", Toasts.Type.FAILURE);
            return;
        }

        const existing = savedTargets.find(entry => entry.userId === userId);
        const nextEntry: LocalProfileThemeEntry = {
            id: existing?.id ?? `profile-theme-${Date.now().toString(36)}`,
            userId,
            imageUrl: entryImageUrl
        };
        const next = existing
            ? savedTargets.map(entry => entry.id === existing.id ? nextEntry : entry)
            : [...savedTargets, nextEntry];

        await writeLocalProfileThemeEntries(next);
        setSavedTargets(next);
        showToast(existing ? "Saved entry updated." : "Added to your saved list.", Toasts.Type.SUCCESS);
    };

    const loadEntryIntoForm = (entry: LocalProfileThemeEntry) => {
        setTargetUserId(entry.userId);
        setPublicImageUrl(entry.imageUrl);
        setImageUrl(entry.imageUrl);
    };

    const deleteSavedEntry = async (id: string) => {
        const next = savedTargets.filter(entry => entry.id !== id);
        await writeLocalProfileThemeEntries(next);
        setSavedTargets(next);
        showToast("Removed from your saved list.", Toasts.Type.MESSAGE);
    };

    const copySavedEntryPublishCode = async (entry: LocalProfileThemeEntry) => {
        downloadPublishCode(entry.userId, entry.imageUrl);
    };

    const previewVars = {
        "--o2-profile-theme-settings-preview-image": imageUrl ? `url("${cssString(imageUrl)}")` : "none",
        "--o2-profile-theme-settings-preview-opacity": brightness
    } as React.CSSProperties;

    return (
        <Forms.FormSection className="o2-profile-theme-settings">
            <Forms.FormTitle tag="h3">Profile Theme</Forms.FormTitle>
            <Forms.FormText>
                Set a 320x580-style profile background image or GIF for selected Discord profiles.
            </Forms.FormText>

            <Forms.FormTitle tag="h5">Image</Forms.FormTitle>
            <div className="o2-profile-theme-row">
                <TextInput
                    value={imageUrl}
                    onChange={setImageUrl}
                    placeholder="Image or GIF URL"
                />
                <Button onClick={chooseImage}>Choose Image</Button>
            </div>

            <Forms.FormTitle tag="h5">Public Target</Forms.FormTitle>
            <div className="o2-profile-theme-row">
                <TextInput
                    value={targetUserId}
                    onChange={setTargetUserId}
                    placeholder="Discord user ID"
                />
                <Button
                    onClick={() => {
                        const me = UserStore.getCurrentUser();
                        if (!me?.id) return;
                        setTargetUserId(me.id);
                    }}
                >
                    Use My ID
                </Button>
            </div>

            <Forms.FormTitle tag="h5">Public Image</Forms.FormTitle>
            <div className="o2-profile-theme-row">
                <TextInput
                    value={publicImageUrl}
                    onChange={setPublicImageUrl}
                    placeholder="Image or GIF URL for the target ID"
                />
                <Button
                    onClick={() => {
                        setPublicImageUrl(imageUrl);
                        save(imageUrl, targetUserId, imageUrl);
                    }}
                >
                    Use Image
                </Button>
            </div>

            <Forms.FormTitle tag="h5">Brightness (your own preview)</Forms.FormTitle>
            <Slider
                initialValue={brightness}
                minValue={0.1}
                maxValue={1}
                markers={[0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]}
                stickToMarkers={false}
                onValueChange={value => {
                    setBrightness(value);
                    settings.store.brightness = value;
                    refreshProfileTheme();
                }}
                onValueRender={value => `${Math.round(value * 100)}%`}
            />

            <div className="o2-profile-theme-actions">
                <Button onClick={() => save()}>Apply</Button>
                <Button onClick={copyPublishCode}>Copy Publish Code</Button>
                <Button color={Button.Colors.GREEN} onClick={saveCurrentToList}>Save to List</Button>
                <Button color={Button.Colors.RED} onClick={clear}>Clear</Button>
            </div>

            <Forms.FormTitle tag="h5" className={Margins.top8}>Preview 320x580</Forms.FormTitle>
            <div className="o2-profile-theme-preview" style={previewVars}>
                {!imageUrl && <div className="o2-profile-theme-preview-empty">No image selected</div>}
                <div className="o2-profile-theme-preview-card">
                    <div className="o2-profile-theme-preview-name">o2 Profile</div>
                    <div className="o2-profile-theme-preview-subtitle">
                        {Math.round(brightness * 100)}% brightness
                    </div>
                </div>
            </div>

            <Forms.FormTitle tag="h5" className={Margins.top8}>Saved Profile Images</Forms.FormTitle>
            <Forms.FormText>
                People you've added an image for. "Load" fills the fields above so you can tweak or
                republish; "Copy Code" grabs that entry's publish code directly.
            </Forms.FormText>
            <div className="o2-profile-theme-saved-list">
                {savedTargets.length === 0 && (
                    <Forms.FormText className="o2-profile-theme-saved-empty">Nothing saved yet.</Forms.FormText>
                )}
                {savedTargets.map(entry => (
                    <div className="o2-profile-theme-saved-item" key={entry.id}>
                        <img src={entry.imageUrl} alt="" />
                        <div className="o2-profile-theme-saved-meta">
                            <strong>{entry.userId}</strong>
                        </div>
                        <Button size={Button.Sizes.SMALL} onClick={() => loadEntryIntoForm(entry)}>Load</Button>
                        <Button size={Button.Sizes.SMALL} onClick={() => copySavedEntryPublishCode(entry)}>Copy Code</Button>
                        <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => deleteSavedEntry(entry.id)}>Delete</Button>
                    </div>
                ))}
            </div>
        </Forms.FormSection>
    );
}

function ProfileThemeSettings() {
    return isDebugOwner() ? <DebugProfileThemeSettings /> : <PublicProfileThemeSettings />;
}

const settings = definePluginSettings({
    targetUserId: {
        type: OptionType.STRING,
        description: "Discord user ID that receives the public ProfileTheme image",
        default: RYDER_USER_ID,
        hidden: true,
        onChange: applyProfileTheme
    },
    imageUrl: {
        type: OptionType.STRING,
        description: "Local ProfileTheme image or GIF URL",
        default: "",
        hidden: true,
        onChange: applyProfileTheme
    },
    publicImageUrl: {
        type: OptionType.STRING,
        description: "Public ProfileTheme image or GIF URL for the target ID",
        default: "",
        hidden: true,
        onChange: applyProfileTheme
    },
    brightness: {
        type: OptionType.SLIDER,
        description: "ProfileTheme image brightness",
        markers: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1],
        default: 0.6,
        stickToMarkers: false,
        hidden: true,
        onChange: refreshProfileTheme
    },
    manager: {
        type: OptionType.COMPONENT,
        description: "",
        component: ProfileThemeSettings
    }
});

export default definePlugin({
    name: "ProfileTheme",
    description: "Adds a decorative background image to selected Discord profiles across o2cord.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    // Hidden from the plugin list for everyone, including Ryder - reach its
    // settings via the debug o2 tab's managed plugins list instead. Public
    // users turn it on/off through the ProfileImages plugin, which depends
    // on this one.
    hidden: true,
    enabledByDefault: false,
    settings,
    startAt: StartAt.DOMContentLoaded,
    start: applyProfileTheme,
    stop: removeProfileTheme
});
