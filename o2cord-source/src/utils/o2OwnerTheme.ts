/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Small shared module (not living in Vencord.ts itself) so both Vencord.ts
 * and o2Settings can import it without tripping the circular-dependency
 * issue Vencord.ts warns about at its own top (it imports "~plugins" first,
 * which includes o2Settings - a plugin importing back from Vencord.ts
 * directly would be circular).
 */

import { Settings } from "@api/Settings";

export function syncOwnerThemeClass() {
    const enabled = Settings.plugins.o2Settings?.enableTheme !== false;
    const has = document.documentElement.classList.contains("o2-owner-theme");
    if (enabled && !has) document.documentElement.classList.add("o2-owner-theme");
    if (!enabled && has) document.documentElement.classList.remove("o2-owner-theme");
}
