/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";
import { UserStore } from "@webpack/common";

import { Devs } from "./constants";

/**
 * Plugins that live only under "debug o2" (turned on/off there, never listed in
 * the normal Plugins page). They are also held out of public builds by
 * tools/publish-public-update.ps1, so nobody else gets them at all.
 */
export const DEBUG_ONLY_PLUGINS = new Set(["ServerCloner", "FakeVoice", "CallieLauncher"]);

/**
 * People Ryder gave "debug o2" to. The list is published by Callie
 * (`-debug-access add/remove <id>`, Ryder only) to debug-access.json next to
 * the update manifest; it is read once per launch and the last good copy is
 * kept so it still works offline. Only ids go in or out - nothing is sent.
 */
const DEBUG_ACCESS_URL = "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/debug-access.json";
const DEBUG_ACCESS_CACHE_KEY = "o2cord-debug-access";
export const DEBUG_ACCESS_UPDATED_EVENT = "o2cord-debug-access-updated";

function readCachedAccess(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(DEBUG_ACCESS_CACHE_KEY) ?? "[]");
        return Array.isArray(list) ? list.filter(id => typeof id === "string" && /^\d{17,20}$/.test(id)) : [];
    } catch {
        return [];
    }
}

let accessList = new Set(readCachedAccess());

export function getDebugAccessList() {
    return [...accessList];
}

export async function loadDebugAccess() {
    try {
        const res = await fetch(`${DEBUG_ACCESS_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return; // no file yet = nobody extra
        const data = await res.json();
        const users = Array.isArray(data?.users) ? data.users.filter((id: unknown) => typeof id === "string" && /^\d{17,20}$/.test(id)) : [];
        accessList = new Set(users);
        try { localStorage.setItem(DEBUG_ACCESS_CACHE_KEY, JSON.stringify(users)); } catch { /* cache is optional */ }
        window.dispatchEvent(new Event(DEBUG_ACCESS_UPDATED_EVENT));
    } catch { /* keep the cached copy */ }
}

/** Ryder himself - the only one who can hand out access. */
export function isRealDebugOwner() {
    return UserStore.getCurrentUser()?.id === String(Devs.Ryder.id);
}

/**
 * Purely account-based, independent of which literal build/exe is running:
 * Ryder, plus anyone he listed with Callie's -debug-access. Everyone else
 * never matches no matter which build they run.
 */
export function isDebugOwner() {
    const id = UserStore.getCurrentUser()?.id;
    return !!id && (id === String(Devs.Ryder.id) || accessList.has(id));
}
