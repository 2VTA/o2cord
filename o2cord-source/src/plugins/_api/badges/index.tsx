/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./fixDiscordBadgePadding.css";

import { _getBadges, BadgePosition, BadgeUserArgs, ProfileBadge } from "@api/Badges";
import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { Logger } from "@utils/Logger";
import {
    doesO2BadgeMatchPreset,
    O2_HIDDEN_BADGES_KEY,
    O2_HIDDEN_BADGES_UPDATED_EVENT,
    O2_LOCAL_BADGES_KEY,
    O2_LOCAL_BADGES_UPDATED_EVENT,
    O2_PRESET_BADGES,
    O2LocalBadge
} from "@utils/o2BadgePresets";
import definePlugin from "@utils/types";
import { ContextMenuApi, Menu, Tooltip } from "@webpack/common";

import o2BreadImage from "../../../components/settings/tabs/vencord/o2BreadImage";

let O2LocalBadges = [] as O2LocalBadge[];
let O2HiddenBadgeIds = [] as string[];
let O2RemoteBadges = [] as O2LocalBadge[];
let remoteBadgeRefreshPromise: Promise<void> | null = null;
let remoteBadgeRefreshTimer: number | undefined;
let lastRemoteBadgeRefresh = 0;

const O2_SHARED_BADGES_REFRESH_MS = 30_000;

const O2SharedBadges: O2LocalBadge[] = [{
    id: "shared-bread",
    userId: "719085334989897750",
    name: "bread",
    image: o2BreadImage,
    size: 24
}];

function getO2BadgeSize(size: number | undefined) {
    if (!Number.isFinite(size)) return 22;

    return Math.min(40, Math.max(14, Math.round(size!)));
}

function normalizeUserId(value: unknown) {
    return typeof value === "string" ? value.replace(/\D/g, "").trim() : "";
}

function normalizeBadgeText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeBadgeSize(value: unknown) {
    const size = typeof value === "number" ? value : Number(value);
    return getO2BadgeSize(size);
}

function normalizeSharedBadge(rawBadge: unknown, fallbackUserId = "", fallbackIndex = 0): O2LocalBadge | null {
    if (!rawBadge || typeof rawBadge !== "object" || Array.isArray(rawBadge)) return null;

    const badge = rawBadge as Partial<O2LocalBadge> & Record<string, unknown>;
    const userId = normalizeUserId(badge.userId ?? fallbackUserId);
    const image = normalizeBadgeText(badge.image ?? badge.icon ?? badge.iconSrc);
    const name = normalizeBadgeText(badge.name ?? badge.description ?? badge.tooltip) || "o2cord badge";
    if (!userId || !image) return null;

    return {
        id: normalizeBadgeText(badge.id) || `shared-${userId}-${fallbackIndex}`,
        userId,
        name,
        image,
        size: normalizeBadgeSize(badge.size)
    };
}

function cleanSharedBadges(raw: unknown): O2LocalBadge[] {
    const badges: O2LocalBadge[] = [];

    if (Array.isArray(raw)) {
        raw.forEach((badge, index) => {
            const cleanBadge = normalizeSharedBadge(badge, "", index);
            if (cleanBadge) badges.push(cleanBadge);
        });
    } else if (raw && typeof raw === "object") {
        const source = raw as Record<string, unknown>;
        const rawBadges = Array.isArray(source.badges) ? source.badges : null;
        if (rawBadges) {
            rawBadges.forEach((badge, index) => {
                const cleanBadge = normalizeSharedBadge(badge, "", index);
                if (cleanBadge) badges.push(cleanBadge);
            });
        }

        const rawUsers = source.users;
        if (rawUsers && typeof rawUsers === "object" && !Array.isArray(rawUsers)) {
            for (const [userId, userBadges] of Object.entries(rawUsers as Record<string, unknown>)) {
                const items = Array.isArray(userBadges) ? userBadges : [userBadges];
                items.forEach((badge, index) => {
                    const cleanBadge = typeof badge === "string"
                        ? normalizeSharedBadge({ userId, image: badge, name: "o2cord badge" }, userId, index)
                        : normalizeSharedBadge(badge, userId, index);

                    if (cleanBadge) badges.push(cleanBadge);
                });
            }
        }
    }

    const byId = new Map<string, O2LocalBadge>();
    for (const badge of badges) byId.set(badge.id, badge);

    return [...byId.values()];
}

function getSharedBadgesUrl() {
    const manifestUrl = typeof O2CORD_UPDATE_MANIFEST === "string" ? O2CORD_UPDATE_MANIFEST.trim() : "";
    if (!manifestUrl) return "";

    try {
        return new URL("badges.json", manifestUrl).href;
    } catch {
        return "";
    }
}

function refreshProfileBadgesNow() {
    try {
        const webpack = (Vencord as any).Webpack;
        webpack?.findByStoreName?.("UserStore")?.emitChange?.();
        webpack?.findByStoreName?.("UserProfileStore")?.emitChange?.();
        webpack?.findByProps?.("getUserProfile", "getGuildMemberProfile")?.emitChange?.();
    } catch { }
}

async function refreshO2RemoteBadges(force = false) {
    const badgesUrl = getSharedBadgesUrl();
    if (!badgesUrl) return;

    const now = Date.now();
    if (!force && now - lastRemoteBadgeRefresh < O2_SHARED_BADGES_REFRESH_MS) return;
    if (remoteBadgeRefreshPromise) return remoteBadgeRefreshPromise;

    remoteBadgeRefreshPromise = fetch(`${badgesUrl}${badgesUrl.includes("?") ? "&" : "?"}t=${now}`, {
        cache: "no-store"
    })
        .then(async res => {
            if (!res.ok) throw new Error(`o2cord badges registry returned ${res.status}`);

            const nextBadges = cleanSharedBadges(await res.json());
            const previous = JSON.stringify(O2RemoteBadges);
            const next = JSON.stringify(nextBadges);
            O2RemoteBadges = nextBadges;
            lastRemoteBadgeRefresh = Date.now();

            if (previous !== next) refreshProfileBadgesNow();
        })
        .catch(() => {
            lastRemoteBadgeRefresh = Date.now();
        })
        .finally(() => {
            remoteBadgeRefreshPromise = null;
        });

    return remoteBadgeRefreshPromise;
}

async function loadO2LocalBadges() {
    try {
        const storedBadges = await DataStore.get<O2LocalBadge[]>(O2_LOCAL_BADGES_KEY);
        if (Array.isArray(storedBadges)) {
            O2LocalBadges = storedBadges;
            return;
        }
    } catch (e) {
        new Logger("BadgeAPI#loadO2LocalBadges").error(e);
    }

    try {
        const raw = localStorage.getItem(O2_LOCAL_BADGES_KEY);
        const fallbackBadges = raw ? JSON.parse(raw) as O2LocalBadge[] : [];
        if (Array.isArray(fallbackBadges)) O2LocalBadges = fallbackBadges;
    } catch { }
}

async function loadO2HiddenBadges() {
    try {
        const storedBadges = await DataStore.get<string[]>(O2_HIDDEN_BADGES_KEY);
        if (Array.isArray(storedBadges)) {
            O2HiddenBadgeIds = storedBadges;
            return;
        }
    } catch (e) {
        new Logger("BadgeAPI#loadO2HiddenBadges").error(e);
    }

    try {
        const raw = localStorage.getItem(O2_HIDDEN_BADGES_KEY);
        const fallbackBadges = raw ? JSON.parse(raw) as string[] : [];
        if (Array.isArray(fallbackBadges)) O2HiddenBadgeIds = fallbackBadges;
    } catch { }
}

function onO2LocalBadgesUpdated(event: Event) {
    const badges = (event as CustomEvent<O2LocalBadge[]>).detail;
    if (Array.isArray(badges)) O2LocalBadges = badges;
}

function onO2HiddenBadgesUpdated(event: Event) {
    const badgeIds = (event as CustomEvent<string[]>).detail;
    if (Array.isArray(badgeIds)) O2HiddenBadgeIds = badgeIds;
}

let intervalId: any;

export function BadgeContextMenu({ badge }: { badge: Omit<ProfileBadge, "id"> & BadgeUserArgs; }) {
    return (
        <Menu.Menu
            navId="vc-badge-context"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Badge Options"
        >
            {badge.description && (
                <Menu.MenuItem
                    id="vc-badge-copy-name"
                    label="Copy Badge Name"
                    action={() => copyWithToast(badge.description!)}
                />
            )}
            {badge.iconSrc && (
                <Menu.MenuItem
                    id="vc-badge-copy-link"
                    label="Copy Badge Image Link"
                    action={() => copyWithToast(badge.iconSrc!)}
                />
            )}
        </Menu.Menu>
    );
}

export default definePlugin({
    name: "BadgeAPI",
    description: "API to add badges to users",
    authors: [Devs.Megu, Devs.Ven, Devs.TheSun],
    required: true,
    patches: [
        {
            find: "#{intl::PROFILE_USER_BADGES}",
            replacement: [
                {
                    match: /alt:" ","aria-hidden":!0,src:.{0,50}(\i).iconSrc/,
                    replace: "...$1.props,...$self.getO2NativeBadgeProps($1),$&"
                },
                {
                    match: /(?<=forceOpen:.{0,40}?ariaHidden:!0,)children:(?=.{0,50}?(\i)\.id)/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}) :"
                },
                // handle onClick and onContextMenu
                {
                    match: /href:(\i)\.link/,
                    replace: "...$self.getBadgeMouseEventHandlers($1),$&"
                }
            ]
        },
        {
            find: "getLegacyUsername(){",
            replacement: {
                match: /getBadges\(\)\{.{0,100}?return\[/,
                replace: "$&...$self.getBadges(this),"
            }
        }
    ],

    async start() {
        await Promise.all([loadO2LocalBadges(), loadO2HiddenBadges()]);
        window.addEventListener(O2_LOCAL_BADGES_UPDATED_EVENT, onO2LocalBadgesUpdated);
        window.addEventListener(O2_HIDDEN_BADGES_UPDATED_EVENT, onO2HiddenBadgesUpdated);

        void refreshO2RemoteBadges(true);
        remoteBadgeRefreshTimer = window.setInterval(() => void refreshO2RemoteBadges(true), O2_SHARED_BADGES_REFRESH_MS);
        clearInterval(intervalId);
    },

    async stop() {
        clearInterval(intervalId);
        if (remoteBadgeRefreshTimer) window.clearInterval(remoteBadgeRefreshTimer);
        remoteBadgeRefreshTimer = undefined;
        window.removeEventListener(O2_LOCAL_BADGES_UPDATED_EVENT, onO2LocalBadgesUpdated);
        window.removeEventListener(O2_HIDDEN_BADGES_UPDATED_EVENT, onO2HiddenBadgesUpdated);
    },

    getBadges(profile: { userId: string; guildId: string; }) {
        if (!profile) return [];

        try {
            return _getBadges(profile);
        } catch (e) {
            new Logger("BadgeAPI#getBadges").error(e);
            return [];
        }
    },

    renderBadgeComponent: ErrorBoundary.wrap((badge: ProfileBadge & BadgeUserArgs) => {
        const Component = badge.component!;
        return <Component {...badge} />;
    }, { noop: true }),


    getBadgeMouseEventHandlers(badge: ProfileBadge & BadgeUserArgs) {
        const handlers = {} as Record<string, (e: React.MouseEvent) => void>;

        if (!badge) return handlers; // sanity check

        const { onClick, onContextMenu } = badge;

        if (onClick) handlers.onClick = e => onClick(e, badge);
        if (onContextMenu) handlers.onContextMenu = e => onContextMenu(e, badge);

        return handlers;
    },

    getDonorBadges(userId: string) {
        const localBadges = this.getO2LocalBadges(userId);
        return localBadges.length
            ? localBadges
            : undefined;
    },

    getO2LocalBadges(userId: string): ProfileBadge[] {
        try {
            void refreshO2RemoteBadges();

            const badgesById = new Map<string, O2LocalBadge>();
            for (const badge of O2SharedBadges) badgesById.set(badge.id, badge);
            for (const badge of O2RemoteBadges) badgesById.set(badge.id, badge);
            for (const badge of O2LocalBadges) badgesById.set(badge.id, badge);

            return [...badgesById.values()]
                .filter(badge => badge.userId === userId && badge.image && badge.name)
                .map((badge, idx) => {
                    const badgeSize = getO2BadgeSize(badge.size);

                    return {
                        key: `o2cord-local-badge-${badge.id || idx}`,
                        id: `o2cord_local_badge_${badge.id || idx}`,
                        iconSrc: badge.image,
                        description: badge.name,
                        component: ({ iconSrc, description }) => (
                            <Tooltip text={description ?? "o2cord badge"}>
                                {tooltipProps => (
                                    <img
                                        {...tooltipProps}
                                        alt={description ?? "o2cord badge"}
                                        aria-label={description ?? "o2cord badge"}
                                        src={iconSrc}
                                        style={{
                                            width: `${badgeSize}px`,
                                            height: `${badgeSize}px`,
                                            borderRadius: "50%",
                                            objectFit: "contain"
                                        }}
                                    />
                                )}
                            </Tooltip>
                        ),
                        position: BadgePosition.START,
                        props: {
                            style: {
                                borderRadius: "50%"
                            }
                        }
                    } satisfies ProfileBadge;
                });
        } catch (e) {
            new Logger("BadgeAPI#getO2LocalBadges").error(e);
            return [];
        }
    },

    getO2NativeBadgeProps(badge: Record<string, unknown>) {
        const shouldHide = O2HiddenBadgeIds.some(id => {
            const preset = O2_PRESET_BADGES.find(item => item.id === id);
            return preset ? doesO2BadgeMatchPreset(badge, preset) : false;
        });

        if (!shouldHide) return {};

        const props = badge?.props as React.HTMLProps<HTMLImageElement> | undefined;
        return {
            style: {
                ...props?.style,
                display: "none",
                width: 0,
                height: 0
            },
            "aria-hidden": true
        };
    }
});
