/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Which profile frame Ryder's own profile card wears (drawn by the O2ProfilePopout core plugin).
// He switches it in the debug o2 tab: it applies on his own client at once and is also sent to
// Callie, who publishes it in profile-frames.json so every o2cord user sees the same frame.

import * as DataStore from "@api/DataStore";
import { fetchWithGithubFallback } from "@utils/githubFallbackFetch";

export const PROFILE_FRAME_OWNER_ID = "719085334989897750";

export const PROFILE_FRAMES = [
    { id: "terminal", name: "Terminal", hint: "black & white retro, running light, scan line, > O2 _" },
    { id: "chibi", name: "Chibi", hint: "orange & pink glowing edge, sparkles, the little headphones girl peeking over the top" },
    { id: "smoke", name: "Smoke", hint: "black frame with silver corners, white smoke rising, RYDER on top" },
    { id: "none", name: "No frame", hint: "plain profile card" }
] as const;

export type ProfileFrameId = typeof PROFILE_FRAMES[number]["id"];

export const DEFAULT_PROFILE_FRAME: ProfileFrameId = "terminal";
export const PROFILE_FRAME_CHANGED_EVENT = "o2cord-profile-frame-changed";
const KEY = "o2cord-profile-frame";

// Discord removes window.localStorage, so the choice lives in the o2cord DataStore (IndexedDB)
// and is mirrored in memory for the synchronous reads the profile card needs.
let current: ProfileFrameId = DEFAULT_PROFILE_FRAME;
// what Callie published ({userId: frame}); what everyone else sees
let remote: Record<string, ProfileFrameId> = {};
const REMOTE_REFRESH_MS = 60_000;
let remoteTimer: ReturnType<typeof setInterval> | undefined;

export function isProfileFrameId(value: unknown): value is ProfileFrameId {
    return PROFILE_FRAMES.some(f => f.id === value);
}

export function getOwnProfileFrame(): ProfileFrameId {
    return current;
}

/** Reads the saved choice once at startup; frames already on screen are redrawn if it differs. */
export async function loadOwnProfileFrame() {
    try {
        const saved = await DataStore.get(KEY);
        if (isProfileFrameId(saved) && saved !== current) {
            current = saved;
            window.dispatchEvent(new CustomEvent(PROFILE_FRAME_CHANGED_EVENT, { detail: saved }));
        }
    } catch { /* no saved choice - the default stays */ }
}

/** The frame Callie published for someone (undefined = none published, use the default). */
export function getPublishedProfileFrame(userId: string): ProfileFrameId | undefined {
    return remote[userId];
}

function getRegistryUrl() {
    const manifestUrl = typeof O2CORD_UPDATE_MANIFEST === "string" ? O2CORD_UPDATE_MANIFEST.trim() : "";
    if (!manifestUrl) return "";

    try {
        return new URL("profile-frames.json", manifestUrl).href;
    } catch {
        return "";
    }
}

async function refreshPublishedFrames() {
    const url = getRegistryUrl();
    if (!url) return;

    try {
        const res = await fetchWithGithubFallback(`${url}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;

        const raw = await res.json();
        const next: Record<string, ProfileFrameId> = {};
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            for (const [userId, frame] of Object.entries(raw)) {
                if (/^\d{17,20}$/.test(userId) && isProfileFrameId(frame)) next[userId] = frame;
            }
        }

        if (JSON.stringify(next) !== JSON.stringify(remote)) {
            remote = next;
            window.dispatchEvent(new CustomEvent(PROFILE_FRAME_CHANGED_EVENT, { detail: "remote" }));
        }
    } catch { /* offline or nothing published yet - the default frame stays */ }
}

/** Starts reading the published frames (call once when the plugin starts). */
export function startPublishedFrames() {
    void refreshPublishedFrames();
    clearInterval(remoteTimer);
    remoteTimer = setInterval(() => void refreshPublishedFrames(), REMOTE_REFRESH_MS);
}

export function stopPublishedFrames() {
    clearInterval(remoteTimer);
    remoteTimer = undefined;
}

export function setOwnProfileFrame(id: ProfileFrameId) {
    current = id;
    DataStore.set(KEY, id).catch(() => { /* still applies for this session */ });
    window.dispatchEvent(new CustomEvent(PROFILE_FRAME_CHANGED_EVENT, { detail: id }));
}
