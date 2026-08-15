/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import * as DataStore from "@api/DataStore";
import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { Devs } from "@utils/constants";
import { O2_LOCAL_NAMEPLATES_KEY, O2_LOCAL_NAMEPLATES_UPDATED_EVENT, O2LocalNameplate } from "@utils/o2NameplatePresets";
import definePlugin from "@utils/types";
import { React } from "@webpack/common";

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

    registryRefreshPromise = fetch(`${registryUrl}${registryUrl.includes("?") ? "&" : "?"}t=${now}`, {
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
// Walking two levels up from our <video> reaches that row-level flex container,
// which we make a positioning context so the video can sit behind the name.
function positionizeRow(node: HTMLVideoElement | null) {
    if (!node) return;

    const target = node.parentElement?.parentElement;
    if (target && getComputedStyle(target).position === "static")
        target.style.position = "relative";
}

function NameplateVideo({ userId }: { userId: string; }) {
    const url = localNameplatesById[userId] || remoteNameplates[userId];
    if (!url) return null;

    return (
        <video
            ref={positionizeRow}
            className="o2-nameplate-video"
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
    description: "Shows a custom animated background behind usernames in the member list.",
    tags: ["Appearance"],
    authors: [Devs.Ryder],
    dependencies: ["MemberListDecoratorsAPI"],

    start() {
        startRegistryRefresh();
        addLocalNameplatesListener();
        void loadLocalNameplateEntries();
        addMemberListDecorator(
            "o2-nameplate",
            ({ user }) => user ? <NameplateVideo userId={user.id} /> : null,
            "guilds"
        );
    },

    stop() {
        stopRegistryRefresh();
        removeLocalNameplatesListener();
        removeMemberListDecorator("o2-nameplate");
    }
});
