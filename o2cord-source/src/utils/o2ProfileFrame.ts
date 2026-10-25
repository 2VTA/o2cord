/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Which profile frame Ryder's own profile card wears (drawn by the O2ProfilePopout
// core plugin). The choice is a per-device preference, switched from the debug o2 tab.
// Other people's o2cord always show his card with the default frame.

import * as DataStore from "@api/DataStore";

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

export function setOwnProfileFrame(id: ProfileFrameId) {
    current = id;
    DataStore.set(KEY, id).catch(() => { /* still applies for this session */ });
    window.dispatchEvent(new CustomEvent(PROFILE_FRAME_CHANGED_EVENT, { detail: id }));
}
