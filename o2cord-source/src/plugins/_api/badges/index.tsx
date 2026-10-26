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
import { fetchWithGithubFallback } from "@utils/githubFallbackFetch";
import { Logger } from "@utils/Logger";
import {
    doesO2BadgeMatchPreset,
    O2_HIDDEN_BADGES_KEY,
    O2_HIDDEN_BADGES_UPDATED_EVENT,
    O2_LOCAL_BADGES_KEY,
    O2_LOCAL_BADGES_UPDATED_EVENT,
    O2_PRESET_BADGES,
    O2_BUILTIN_RARITY_NUMBER,
    O2_FIRST_CUSTOM_RARITY_NUMBER,
    O2_FRIEND_RARITY_NUMBER,
    O2BadgeRarity,
    O2CustomRarity,
    O2LocalBadge
} from "@utils/o2BadgePresets";
import definePlugin from "@utils/types";
import { ContextMenuApi, Menu, Tooltip, UserStore } from "@webpack/common";

import o2BreadImage from "../../../components/settings/tabs/vencord/o2BreadImage";

import o2CrownImage from "./o2CrownImage";

let O2LocalBadges = [] as O2LocalBadge[];
let O2HiddenBadgeIds = [] as string[];
let O2RemoteBadges = [] as O2LocalBadge[];
// badge categories made from Callie (badge-rarities.json); Friend is built in
let O2CustomRarities = [] as O2CustomRarity[];
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

// Member-list "O2cord Dev" crown - beta experiment, scoped to the member
// list only (not the profile badge row, not the popout). Mirrors Discord's
// own Server Owner crown (svg.ownerIcon__xxxxx sitting inside the row's
// nameAndDecorators_ container) but renders unconditionally for this one
// account, on every server, regardless of actual ownership.
const O2CORD_DEV_USER_ID = "719085334989897750";
const O2_CROWN_ATTR = "data-o2cord-dev-crown";
const O2_CROWN_AVATAR_RE = /\/(?:avatars\/|users\/)(\d{17,20})(?:\/avatars)?\//;
const O2_CROWN_MIN_AVATAR_SIZE = 12;
let o2CrownScanFrame: number | null = null;
let o2CrownObserver: MutationObserver | null = null;

function getO2MemberRowUserId(row: HTMLElement) {
    for (const img of Array.from(row.querySelectorAll<HTMLImageElement>("img"))) {
        const src = img.currentSrc || img.src || "";
        const match = O2_CROWN_AVATAR_RE.exec(src);
        if (!match) continue;

        const rect = img.getBoundingClientRect();
        if (Math.max(rect.width, rect.height) < O2_CROWN_MIN_AVATAR_SIZE) continue;

        return match[1];
    }
    return "";
}

function scanO2CrownTargets() {
    const rows = document.querySelectorAll<HTMLElement>("[class*='member_']");

    for (const row of rows) {
        if (getO2MemberRowUserId(row) !== O2CORD_DEV_USER_ID) continue;

        const decorators = row.querySelector<HTMLElement>("[class*='nameAndDecorators_']");
        if (!decorators || decorators.querySelector(`[${O2_CROWN_ATTR}]`)) continue;

        const nativeOwnerIcon = decorators.querySelector("svg[class*='ownerIcon']");
        const referenceSize = nativeOwnerIcon
            ? nativeOwnerIcon.getBoundingClientRect().height || 16
            : 16;

        const crown = document.createElement("img");
        crown.setAttribute(O2_CROWN_ATTR, "true");
        crown.src = o2CrownImage;
        crown.alt = "O2cord Dev";
        crown.setAttribute("aria-label", "O2cord Dev");
        crown.style.width = `${referenceSize}px`;
        crown.style.height = `${referenceSize}px`;
        crown.style.objectFit = "contain";
        crown.style.flexShrink = "0";
        crown.style.marginLeft = "4px";
        decorators.appendChild(crown);
    }
}

function queueO2CrownScan() {
    if (o2CrownScanFrame != null) return;
    o2CrownScanFrame = requestAnimationFrame(() => {
        o2CrownScanFrame = null;
        scanO2CrownTargets();
    });
}

function startO2CrownObserver() {
    stopO2CrownObserver();
    scanO2CrownTargets();
    o2CrownObserver = new MutationObserver(queueO2CrownScan);
    o2CrownObserver.observe(document.body, { childList: true, subtree: true });
}

function stopO2CrownObserver() {
    o2CrownObserver?.disconnect();
    o2CrownObserver = null;
    if (o2CrownScanFrame != null) {
        cancelAnimationFrame(o2CrownScanFrame);
        o2CrownScanFrame = null;
    }
    document.querySelectorAll(`[${O2_CROWN_ATTR}]`).forEach(el => el.remove());
}

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

function normalizeBadgeLink(value: unknown) {
    const link = normalizeBadgeText(value);
    if (!link) return undefined;

    try {
        const { protocol } = new URL(link);
        return protocol === "http:" || protocol === "https:" ? link : undefined;
    } catch {
        return undefined;
    }
}

function normalizeBadgeRarity(value: unknown, name: string): O2BadgeRarity {
    const text = typeof value === "string" ? value.trim().toLowerCase().slice(0, 40) : "";
    if (text === "legendary" || text === "mythic") return "mythic";
    if (text) return text; // a built-in name, "friend", or the id of a Callie category (checked when it is used)
    // no rarity saved: Friend badges get their own FRIEND label, everything else epic like before
    return name.trim().toLowerCase() === "friend" ? "friend" : "epic";
}

const FRIEND_RARITY: O2CustomRarity = { id: "friend", name: "Friend", color: "#ff8a1f", icon: "" };

// The made-up number for a category: friend is 100, Callie's categories follow in the file's order.
function rarityNumberOf(id: string): number {
    if (id in O2_BUILTIN_RARITY_NUMBER) return O2_BUILTIN_RARITY_NUMBER[id];
    if (id === "friend") return O2_FRIEND_RARITY_NUMBER;
    const index = O2CustomRarities.findIndex(r => r.id === id);
    return index >= 0 ? O2_FIRST_CUSTOM_RARITY_NUMBER + index : O2_BUILTIN_RARITY_NUMBER.epic;
}

function customRarityByNumber(number: number): O2CustomRarity | undefined {
    if (number === O2_FRIEND_RARITY_NUMBER) return FRIEND_RARITY;
    return O2CustomRarities[number - O2_FIRST_CUSTOM_RARITY_NUMBER];
}

function normalizeCustomRarities(raw: unknown): O2CustomRarity[] {
    const list = Array.isArray((raw as any)?.rarities) ? (raw as any).rarities : [];
    const out: O2CustomRarity[] = [];
    for (const item of list) {
        const id = normalizeBadgeText(item?.id).toLowerCase();
        const name = normalizeBadgeText(item?.name).slice(0, 24);
        const color = normalizeBadgeText(item?.color);
        const icon = normalizeBadgeLink(item?.icon);
        if (!/^[a-z0-9-]{1,32}$/.test(id) || !name || !/^#[0-9a-f]{6}$/i.test(color) || !icon) continue;
        if (id in O2_BUILTIN_RARITY_NUMBER || id === "friend" || id === "legendary" || out.some(r => r.id === id)) continue;
        out.push({ id, name, color, icon });
        if (out.length >= 90) break;
    }
    return out;
}

// Colours of the label pills: Discord only has its own four, so ours get a rule each
// (picked by the picture inside the pill, which is unique per category).
// A dark colour (like #020201) would make the label invisible on Discord's dark panel, so the
// text and ring use a lightened version of it; the tint behind keeps the colour as chosen.
function legibleColor(hex: string) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luminance >= 0.35) return hex;

    const lift = (c: number) => Math.round(c + (255 - c) * 0.72);
    return "#" + [r, g, b].map(c => lift(c).toString(16).padStart(2, "0")).join("");
}

function updateRarityStyle() {
    const css = [FRIEND_RARITY, ...O2CustomRarities].map(rarity => {
        const r = { ...rarity, color: legibleColor(rarity.color) };
        const sel = `[class*="rarity-"]:has(> .o2-rarity-icon-${r.id})`;
        // the ring around the pill is a ::before painted with Discord's own mythic gradient
        return `${sel}{color:${r.color}!important;border-color:${r.color}!important;background:color-mix(in srgb,${r.color} 16%,transparent)!important;box-shadow:0 0 8px color-mix(in srgb,${r.color} 40%,transparent)!important}`
            + `${sel}::before{background-image:linear-gradient(-78deg,${r.color},color-mix(in srgb,${r.color} 55%,#fff))!important}`;
    }).join("\n");

    let style = document.getElementById("o2-badge-rarity-style") as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = "o2-badge-rarity-style";
        document.head.append(style);
    }
    if (style.textContent !== css) style.textContent = css;
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
        size: normalizeBadgeSize(badge.size),
        link: normalizeBadgeLink(badge.link),
        enabled: badge.enabled !== false,
        rarity: normalizeBadgeRarity(badge.rarity, name)
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

function getRaritiesUrl() {
    const manifestUrl = typeof O2CORD_UPDATE_MANIFEST === "string" ? O2CORD_UPDATE_MANIFEST.trim() : "";
    if (!manifestUrl) return "";

    try {
        return new URL("badge-rarities.json", manifestUrl).href;
    } catch {
        return "";
    }
}

async function refreshO2Rarities() {
    const url = getRaritiesUrl();
    if (!url) return;

    try {
        const res = await fetchWithGithubFallback(`${url}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        O2CustomRarities = normalizeCustomRarities(await res.json());
        updateRarityStyle();
    } catch { /* no categories yet - only Friend and Discord's own */ }
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

    remoteBadgeRefreshPromise = fetchWithGithubFallback(`${badgesUrl}${badgesUrl.includes("?") ? "&" : "?"}t=${now}`, {
        cache: "no-store"
    })
        .then(async res => {
            if (!res.ok) throw new Error(`o2cord badges registry returned ${res.status}`);

            void refreshO2Rarities();
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

// the picture in a category's label: the heart for Friend, the picture from Callie for the others
const RarityIcon = ({ rarity, className }: { rarity: O2CustomRarity; className?: string; }) => rarity.id === "friend" ? (
    <svg className={`${className ?? ""} o2-rarity-icon-friend`} width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#ff8a1f" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
) : (
    <img className={`${className ?? ""} o2-rarity-icon-${rarity.id}`} src={rarity.icon} width={12} height={12} alt="" aria-hidden="true" draggable={false} style={{ objectFit: "contain" }} />
);

// a stable number for each of our badges, far above the ids Discord uses for its own
function directoryBadgeId(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return 1_000_000 + (Math.abs(hash) % 1_000_000_000);
}

export default definePlugin({
    name: "BadgeAPI",
    description: "API to add badges to users",
    authors: [Devs.Megu, Devs.Ven, Devs.TheSun],
    required: true,
    // the rarity label of a badge in the "Your badges" panel, for our numbers (100 = Friend, 101+ = Callie's categories)
    customRarityPill(number: number) {
        const rarity = typeof number === "number" ? customRarityByNumber(number) : undefined;
        if (!rarity) return null;

        return {
            type: { text: rarity.name.toUpperCase() },
            variant: "rarity-mythic",
            icon: (props: { className?: string; }) => <RarityIcon rarity={rarity} className={props?.className} />
        };
    },

    // the small rarity icon in badge tooltips
    customRarityIcon(number: number, className: string) {
        const rarity = typeof number === "number" ? customRarityByNumber(number) : undefined;
        if (!rarity) return null;

        return {
            Icon: (props: { className?: string; }) => <RarityIcon rarity={rarity} className={props?.className} />,
            className,
            label: rarity.name
        };
    },

    patches: [
        {
            find: 'variant:"rarity-mythic"',
            replacement: {
                match: /(switch\((\i)\)\{case \i\.\i\.COMMON:return\{type:.+?)default:return null/,
                replace: "$1default:return $self.customRarityPill($2)"
            }
        },
        {
            find: "mini-premium-tooltip",
            replacement: {
                match: /(switch\((\i)\)\{case \i\.\i\.COMMON:return\{Icon:.+?MYTHIC:return\{Icon:\i\.\i,className:(\i\.\i),.+?)default:return null/,
                replace: "$1default:return $self.customRarityIcon($2,$3)"
            }
        },
        {
            // Discord's "Your badges" panel reads its list from this store: add ours to it so
            // the o2cord badges show there too, and can be selected for the details on the right
            find: "BadgeDirectoryStore",
            replacement: [
                {
                    match: /(getBadges\(\i\)\{let (\i)=.{0,120}?;return )(null!=\i\?Array\.from\(\i\.badges\.values\(\)\):\[\])/,
                    replace: "$1$self.addDirectoryBadges($2,$3)"
                },
                {
                    match: /(getBadgeById\(\i,\i\)\{let (\i)=.{0,60}?;return null!=\i\?)(\i\.get\(\i\)\?\.badges\.get\((\i)\))(?=:void 0\})/,
                    replace: "$1($3??$self.getDirectoryBadgeById($2,$4))"
                }
            ]
        },
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
        },
        // The badges list component (UserProfileBadgeList) renders whatever
        // `badges` array it's handed - for regular users that array already
        // includes ours via the getBadges() patch above, but bot profiles
        // build their badge list through a different path that never calls
        // getBadges() at all, so our badges never reach it. Merging directly
        // here, at the one render point every profile type shares, covers
        // both cases; mergeO2Badges dedupes by id so regular users don't get
        // their badges twice.
        {
            find: "UserProfileBadgeList",
            replacement: {
                match: /children:t\.map\(/,
                replace: "children:(t=$self.mergeO2Badges(t,s?.userId)).map("
            }
        }
    ],

    async start() {
        await Promise.all([loadO2LocalBadges(), loadO2HiddenBadges()]);
        window.addEventListener(O2_LOCAL_BADGES_UPDATED_EVENT, onO2LocalBadgesUpdated);
        window.addEventListener(O2_HIDDEN_BADGES_UPDATED_EVENT, onO2HiddenBadgesUpdated);

        updateRarityStyle();
        void refreshO2RemoteBadges(true);
        remoteBadgeRefreshTimer = window.setInterval(() => void refreshO2RemoteBadges(true), O2_SHARED_BADGES_REFRESH_MS);
        clearInterval(intervalId);
        startO2CrownObserver();
    },

    async stop() {
        document.getElementById("o2-badge-rarity-style")?.remove();
        clearInterval(intervalId);
        if (remoteBadgeRefreshTimer) window.clearInterval(remoteBadgeRefreshTimer);
        remoteBadgeRefreshTimer = undefined;
        window.removeEventListener(O2_LOCAL_BADGES_UPDATED_EVENT, onO2LocalBadgesUpdated);
        window.removeEventListener(O2_HIDDEN_BADGES_UPDATED_EVENT, onO2HiddenBadgesUpdated);
        stopO2CrownObserver();
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

    mergeO2Badges(nativeBadges: any[] | null | undefined, userId: string | null | undefined) {
        if (!userId) return nativeBadges;

        // Regular users already get our badges through the getBadges() patch
        // above (it flows into nativeBadges here), so merging again would
        // duplicate them. Bot profiles never call getBadges() at all, so
        // this is still the only place that reaches them.
        if (!UserStore.getUser(userId)?.bot) return nativeBadges;

        const existing = new Set((nativeBadges ?? []).map((badge: any) => badge?.id));
        const custom = this.getO2LocalBadges(userId).filter(badge => !existing.has(badge.id));
        if (!custom.length) return nativeBadges;

        return [...custom, ...(nativeBadges ?? [])];
    },

    // our badges as entries of Discord's own badge directory (what the "Your badges" panel lists)
    getDirectoryBadges(userId: string) {
        return this.getO2BadgeRecords(userId).map((badge, idx) => ({
            badge_id: directoryBadgeId(`o2cord_local_badge_${badge.id || idx}`),
            name: badge.name,
            description: badge.name,
            info_label: "o2cord badge",
            rarity: rarityNumberOf(normalizeBadgeRarity(badge.rarity, badge.name)),
            simple_icon_url: badge.image,
            simple_icon_raster_url: badge.image,
            complex_icon_static_url: badge.image,
            is_earnable: false,
            owned: true,
            hidden: false
        }));
    },

    addDirectoryBadges(userId: string, nativeBadges: any[]) {
        try {
            const custom = this.getDirectoryBadges(userId);
            return custom.length ? [...nativeBadges, ...custom] : nativeBadges;
        } catch (e) {
            new Logger("BadgeAPI#addDirectoryBadges").error(e);
            return nativeBadges;
        }
    },

    getDirectoryBadgeById(userId: string, badgeId: number) {
        try {
            return this.getDirectoryBadges(userId).find(badge => badge.badge_id === badgeId);
        } catch {
            return undefined;
        }
    },

    // every badge a user has (shared, published and local), in the order they show
    getO2BadgeRecords(userId: string): O2LocalBadge[] {
        void refreshO2RemoteBadges();

        const badgesById = new Map<string, O2LocalBadge>();
        for (const badge of O2SharedBadges) badgesById.set(badge.id, badge);
        for (const badge of O2RemoteBadges) badgesById.set(badge.id, badge);
        for (const badge of O2LocalBadges) badgesById.set(badge.id, badge);

        return [...badgesById.values()]
            .filter(badge => badge.userId === userId && badge.image && badge.name && badge.enabled !== false);
    },

    getO2LocalBadges(userId: string): ProfileBadge[] {
        try {
            return this.getO2BadgeRecords(userId)
                .map((badge, idx) => {
                    const badgeSize = getO2BadgeSize(badge.size);
                    const link = badge.link;
                    const circular = badge.circular !== false;

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
                                        onClick={link ? () => VencordNative.native.openExternal(link) : tooltipProps.onClick}
                                        style={{
                                            width: `${badgeSize}px`,
                                            height: `${badgeSize}px`,
                                            borderRadius: circular ? "50%" : undefined,
                                            objectFit: "contain",
                                            cursor: link ? "pointer" : undefined
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
