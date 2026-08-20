/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import * as DataStore from "@api/DataStore";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { Devs } from "@utils/constants";
import { fetchWithGithubFallback } from "@utils/githubFallbackFetch";
import { O2_LOCAL_NAMEPLATES_KEY, O2_LOCAL_NAMEPLATES_UPDATED_EVENT, O2LocalNameplate } from "@utils/o2NameplatePresets";
import definePlugin from "@utils/types";
import { filters, mapMangledModuleLazy } from "@webpack";
import { React } from "@webpack/common";

// Discord's own nameplate system (Collectibles) has a "preview" bypass meant
// for the shop's try-before-you-buy flow: if a nameplate object carries a
// previewToolKey, it reads {staticUrl,animatedUrl} straight out of a local
// Zustand cache instead of resolving a real owned SKU against Discord's CDN.
// setImgCache is what populates that cache, and it does no server-side
// validation at all - so we can prime it with our own registry's image and
// let Discord's native nameplate component render it everywhere (member
// list, account panel, voice list) with correct positioning/animation for
// free, instead of us hand-rolling CSS overlays for every surface.
const NameplateImgCacheModule = mapMangledModuleLazy("toolsCache:{}", {
    useImgCacheApi: filters.byCode("setImgCache:")
});

const primedImgCacheKeys = new Set<string>();

function primeImgCache(key: string, url: string) {
    if (primedImgCacheKeys.has(key)) return;

    try {
        const { setImgCache } = NameplateImgCacheModule.useImgCacheApi();
        const animatedUrl = isGifSource(url) ? url : undefined;
        setImgCache(key, animatedUrl, url);
        primedImgCacheKeys.add(key);
    } catch { }
}

const REGISTRY_REFRESH_MS = 30_000;

let remoteNameplates: Record<string, string> = {};
let lastRegistryRefresh = 0;
let registryRefreshPromise: Promise<void> | null = null;
let registryRefreshTimer: number | undefined;

// Local-only entries added from the debug editor, so Ryder can preview a
// nameplate on his own client before publishing it for everyone.
let localNameplateEntries: O2LocalNameplate[] = [];
let localNameplatesById: Record<string, string> = {};
let localNameplatesLoaded = false;
let localNameplatesListenerActive = false;

function rebuildLocalNameplatesIndex() {
    const next: Record<string, string> = {};
    for (const entry of localNameplateEntries) {
        if (/^\d{5,25}$/.test(entry.userId) && entry.videoUrl) next[entry.userId] = entry.videoUrl;
    }
    localNameplatesById = next;
}

async function loadLocalNameplateEntries() {
    if (localNameplatesLoaded) return localNameplateEntries;

    try {
        const stored = await DataStore.get<O2LocalNameplate[]>(O2_LOCAL_NAMEPLATES_KEY);
        if (Array.isArray(stored)) localNameplateEntries = stored;
    } catch { }

    rebuildLocalNameplatesIndex();
    localNameplatesLoaded = true;
    return localNameplateEntries;
}

function onLocalNameplatesUpdated(event: Event) {
    const entries = (event as CustomEvent<O2LocalNameplate[]>).detail;
    if (!Array.isArray(entries)) return;

    localNameplateEntries = entries;
    rebuildLocalNameplatesIndex();
}

function addLocalNameplatesListener() {
    if (localNameplatesListenerActive) return;
    localNameplatesListenerActive = true;
    window.addEventListener(O2_LOCAL_NAMEPLATES_UPDATED_EVENT, onLocalNameplatesUpdated);
}

function removeLocalNameplatesListener() {
    if (!localNameplatesListenerActive) return;
    localNameplatesListenerActive = false;
    window.removeEventListener(O2_LOCAL_NAMEPLATES_UPDATED_EVENT, onLocalNameplatesUpdated);
}

function cleanNameplates(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object") return {};

    const next: Record<string, string> = {};
    for (const [userId, url] of Object.entries(value as Record<string, unknown>)) {
        if (/^\d{5,25}$/.test(userId) && typeof url === "string" && /^https:\/\//.test(url))
            next[userId] = url;
    }
    return next;
}

// Nameplates can be an animated video (webm/mp4) or a plain static image
// (png/jpg/webp/gif) - sniffed from the data: URL mime type for local
// entries, or the file extension for published https: URLs.
function isVideoSource(url: string) {
    if (url.startsWith("data:video/")) return true;
    if (url.startsWith("data:image/")) return false;
    return /\.(webm|mp4)(\?.*)?$/i.test(url);
}

function isGifSource(url: string) {
    if (url.startsWith("data:image/gif")) return true;
    return /\.gif(\?.*)?$/i.test(url);
}

function getNameplateSourceUrl(userId: string): string | null {
    return localNameplatesById[userId] || remoteNameplates[userId] || null;
}

function getNameplateRegistryUrl() {
    const updateManifestUrl = typeof O2CORD_UPDATE_MANIFEST === "string" ? O2CORD_UPDATE_MANIFEST.trim() : "";
    if (!updateManifestUrl) return "";

    try {
        return new URL("nameplates.json", updateManifestUrl).href;
    } catch {
        return "";
    }
}

async function refreshNameplateRegistry(force = false) {
    const registryUrl = getNameplateRegistryUrl();
    if (!registryUrl) return;

    const now = Date.now();
    if (!force && now - lastRegistryRefresh < REGISTRY_REFRESH_MS) return;
    if (registryRefreshPromise) return registryRefreshPromise;

    registryRefreshPromise = fetchWithGithubFallback(`${registryUrl}${registryUrl.includes("?") ? "&" : "?"}t=${now}`, {
        cache: "no-store"
    })
        .then(async res => {
            if (!res.ok) throw new Error(`Nameplate registry returned ${res.status}`);
            remoteNameplates = cleanNameplates(await res.json());
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

function startRegistryRefresh() {
    if (registryRefreshTimer) return;
    void refreshNameplateRegistry(true);
    registryRefreshTimer = window.setInterval(() => void refreshNameplateRegistry(true), REGISTRY_REFRESH_MS);
}

function stopRegistryRefresh() {
    if (!registryRefreshTimer) return;
    clearInterval(registryRefreshTimer);
    registryRefreshTimer = undefined;
}

// Our decorator lands as a sibling inside the member list row's own children
// array (next to the avatar/name), wrapped in .vc-member-list-decorators-wrapper.
// Walking two levels up from our element reaches that row-level flex container,
// which we make a positioning context so the background can sit behind the name.
function positionizeRow(node: HTMLElement | null) {
    if (!node) return;

    const target = node.parentElement?.parentElement;
    if (target && getComputedStyle(target).position === "static")
        target.style.position = "relative";
}

// Static images and GIFs now render through Discord's own native nameplate
// system (see getUserNameplate below), so this decorator only needs to
// cover actual video files (webm/mp4), which that system can't display.
function NameplateBackground({ userId }: { userId: string; }) {
    const url = getNameplateSourceUrl(userId);
    if (!url || !isVideoSource(url)) return null;

    return (
        <video
            ref={positionizeRow}
            className="o2-nameplate-bg"
            src={url}
            autoPlay
            loop
            muted
            playsInline
        />
    );
}

export default definePlugin({
    name: "Nameplate",
    description: "Shows a custom background (video or image) behind usernames in the member list.",
    tags: ["Appearance"],
    authors: [Devs.Ryder],
    dependencies: ["MemberListDecoratorsAPI"],

    patches: [
        // User.prototype's own nameplate getter is the single source every
        // surface (member list, account panel, voice list) reads from -
        // hooking it here means our nameplates get Discord's real rendering
        // (positioning, hover loop, animation) everywhere at once, instead
        // of us re-implementing that per surface.
        {
            find: "get nameplate(){return(0,",
            replacement: {
                match: /get nameplate\(\)\{return\(0,(\i)\.(\i)\)\(this\.collectibles\?\.nameplate\)\}/,
                replace: "get nameplate(){return $self.getUserNameplate(this)??(0,$1.$2)(this.collectibles?.nameplate)}"
            }
        }
    ],

    start() {
        startRegistryRefresh();
        addLocalNameplatesListener();
        void loadLocalNameplateEntries();
        addMemberListDecorator(
            "o2-nameplate",
            ({ user }) => user ? <NameplateBackground userId={user.id} /> : null,
            "guilds"
        );
    },

    stop() {
        stopRegistryRefresh();
        removeLocalNameplatesListener();
        removeMemberListDecorator("o2-nameplate");
    },

    // Only static images and GIFs go through Discord's native preview-cache
    // bypass - it has no video slot, so webm/mp4 nameplates fall through to
    // null here and get the CSS <video> overlay from NameplateBackground
    // instead.
    getUserNameplate(user: any) {
        const userId = user?.id;
        if (!userId) return null;

        const url = getNameplateSourceUrl(userId);
        if (!url || isVideoSource(url)) return null;

        const key = `o2cord-${userId}`;
        primeImgCache(key, url);

        return {
            skuId: `o2cord-${userId}`,
            label: "o2cord Nameplate",
            palette: "crimson",
            previewToolKey: key
        };
    }
});
