/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserStore } from "@webpack/common";

import { Devs } from "./constants";

/**
 * Purely account-based, independent of which literal build/exe is running.
 * Debug features used to also require O2CORD_DEBUG (a build-time flag), but
 * that meant every public update silently stripped Ryder's own debug tools
 * from his own client until someone rebuilt and redeployed a debug JS bundle
 * to him specifically. The account check alone is what actually protects
 * other users - they never match Devs.Ryder.id no matter which build they
 * run - so the build flag was redundant and just kept causing that bug.
 */
/**
 * Plugins that live only under "debug o2" (turned on/off there, never listed in
 * the normal Plugins page). They are also held out of public builds by
 * tools/publish-public-update.ps1, so nobody else gets them at all.
 */
export const DEBUG_ONLY_PLUGINS = new Set(["ServerCloner", "ChannelWallpaper", "AntiMoveDeco", "FakeVoice"]);

export function isDebugOwner() {
    return UserStore.getCurrentUser()?.id === String(Devs.Ryder.id);
}
