/*
 * o2cord local/public ussro2 helpers
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const O2_USSRO2_LOCAL_BACKGROUNDS_KEY = "o2cord.debug.localUssro2Backgrounds";
export const O2_USSRO2_LOCAL_BACKGROUNDS_UPDATED_EVENT = "o2cord:debug-local-ussro2-backgrounds-updated";

export interface O2LocalUssro2Background {
    id: string;
    userId: string;
    imageUrl: string;
    enabled?: boolean;
}

export type O2Ussro2Backgrounds = Record<string, string>;

export function cleanO2Ussro2UserId(value?: string | null) {
    const userId = (value ?? "").replace(/\D/g, "").trim();
    return /^\d{17,20}$/.test(userId) ? userId : "";
}

export function cleanO2Ussro2ImageUrl(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export function cleanO2Ussro2Backgrounds(raw: unknown): O2Ussro2Backgrounds {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const source = "users" in raw && raw.users && typeof raw.users === "object" && !Array.isArray(raw.users)
        ? raw.users
        : raw;

    const backgrounds: O2Ussro2Backgrounds = {};
    for (const [rawUserId, rawImageUrl] of Object.entries(source as Record<string, unknown>)) {
        const userId = cleanO2Ussro2UserId(rawUserId);
        const imageUrl = cleanO2Ussro2ImageUrl(rawImageUrl);
        if (userId && imageUrl) backgrounds[userId] = imageUrl;
    }

    return backgrounds;
}

export function indexO2Ussro2LocalBackgrounds(entries: O2LocalUssro2Background[]): O2Ussro2Backgrounds {
    const backgrounds: O2Ussro2Backgrounds = {};

    for (const entry of entries) {
        if (entry.enabled === false) continue;

        const userId = cleanO2Ussro2UserId(entry.userId);
        const imageUrl = cleanO2Ussro2ImageUrl(entry.imageUrl);
        if (userId && imageUrl) backgrounds[userId] = imageUrl;
    }

    return backgrounds;
}
