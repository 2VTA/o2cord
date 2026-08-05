/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserStore } from "@webpack/common";

import { Devs } from "./constants";

/**
 * O2CORD_DEBUG only reflects which build/exe is running, not who is logged in.
 * If the debug build ever runs under a different Discord account (another
 * device, a shared machine, an alt), that account should still see the
 * public UI, never Ryder's private debug controls.
 */
export function isDebugOwner() {
    return O2CORD_DEBUG && UserStore.getCurrentUser()?.id === String(Devs.Ryder.id);
}
