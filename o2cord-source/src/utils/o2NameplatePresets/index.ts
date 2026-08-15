/*
 * o2cord nameplate presets shared by the debug editor and Nameplate plugin.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface O2LocalNameplate {
    id: string;
    userId: string;
    videoUrl: string;
}

export const O2_LOCAL_NAMEPLATES_KEY = "o2cord.debug.localNameplates";
export const O2_LOCAL_NAMEPLATES_UPDATED_EVENT = "o2cord:debug-local-nameplates-updated";
