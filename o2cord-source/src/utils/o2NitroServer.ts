/*
 * o2cord local/public NitroServer role icon helpers
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const O2_NITROSERVER_LOCAL_ROLE_ICONS_KEY = "o2cord.debug.localNitroServerRoleIcons";
export const O2_NITROSERVER_LOCAL_ROLE_ICONS_UPDATED_EVENT = "o2cord:debug-local-nitroserver-role-icons-updated";

export interface O2LocalNitroServerRoleIcon {
    id: string;
    roleId: string;
    imageUrl: string;
    enabled?: boolean;
}

export type O2NitroServerRoleIcons = Record<string, string>;

export function cleanO2NitroServerRoleId(value?: string | null) {
    const roleId = (value ?? "").replace(/\D/g, "").trim();
    return /^\d{17,20}$/.test(roleId) ? roleId : "";
}

export function cleanO2NitroServerImageUrl(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export function cleanO2NitroServerRoleIcons(raw: unknown): O2NitroServerRoleIcons {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const source = "roles" in raw && raw.roles && typeof raw.roles === "object" && !Array.isArray(raw.roles)
        ? raw.roles
        : raw;

    const icons: O2NitroServerRoleIcons = {};
    for (const [rawRoleId, rawImageUrl] of Object.entries(source as Record<string, unknown>)) {
        const roleId = cleanO2NitroServerRoleId(rawRoleId);
        const imageUrl = cleanO2NitroServerImageUrl(rawImageUrl);
        if (roleId && imageUrl) icons[roleId] = imageUrl;
    }

    return icons;
}

export function indexO2NitroServerLocalRoleIcons(entries: O2LocalNitroServerRoleIcon[]): O2NitroServerRoleIcons {
    const icons: O2NitroServerRoleIcons = {};

    for (const entry of entries) {
        if (entry.enabled === false) continue;

        const roleId = cleanO2NitroServerRoleId(entry.roleId);
        const imageUrl = cleanO2NitroServerImageUrl(entry.imageUrl);
        if (roleId && imageUrl) icons[roleId] = imageUrl;
    }

    return icons;
}
