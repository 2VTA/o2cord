/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { fetchWithGithubFallback } from "@utils/githubFallbackFetch";
import definePlugin, { OptionType } from "@utils/types";

import { PUBLIC_BACKGROUNDS, PUBLIC_REGISTRY_URL } from "./publicBackgrounds";

type Backgrounds = Record<string, string>;
const REGISTRY_REFRESH_MS = 30_000;

let remoteBackgrounds: Backgrounds = {};
let lastRegistryRefresh = 0;
let registryRefreshPromise: Promise<void> | null = null;
let registryRefreshTimer: number | undefined;
const bundledBackgrounds = cleanBackgrounds(PUBLIC_BACKGROUNDS);

const settings = definePluginSettings({
    nitroFirst: {
        description: "Banner to use if both Discord and ussro2 public backgrounds are present",
        type: OptionType.SELECT,
        options: [
            { label: "ussro2 public background first", value: false, default: true },
            { label: "Discord banner first", value: true },
        ]
    }
});

function normalizeUserId(value: string) {
    return value.replace(/\D/g, "").trim();
}

function normalizeImageUrl(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function cleanBackgrounds(raw: unknown): Backgrounds {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const source = "users" in raw && raw.users && typeof raw.users === "object" && !Array.isArray(raw.users)
        ? raw.users
        : raw;

    const backgrounds: Backgrounds = {};
    for (const [rawUserId, rawImageUrl] of Object.entries(source as Record<string, unknown>)) {
        const userId = normalizeUserId(rawUserId);
        const imageUrl = normalizeImageUrl(rawImageUrl);
        if (userId && imageUrl) backgrounds[userId] = imageUrl;
    }

    return backgrounds;
}

function getRegistryUrl() {
    const explicitRegistryUrl = normalizeImageUrl(PUBLIC_REGISTRY_URL);
    if (explicitRegistryUrl) return explicitRegistryUrl;

    const updateManifestUrl = normalizeImageUrl(O2CORD_UPDATE_MANIFEST);
    if (!updateManifestUrl) return "";

    try {
        return new URL("backgrounds.json", updateManifestUrl).href;
    } catch {
        return "";
    }
}

async function refreshRegistry(force = false) {
    const registryUrl = getRegistryUrl();
    if (!registryUrl) return;

    const now = Date.now();
    if (!force && now - lastRegistryRefresh < REGISTRY_REFRESH_MS) return;
    if (registryRefreshPromise) return registryRefreshPromise;

    registryRefreshPromise = fetchWithGithubFallback(`${registryUrl}${registryUrl.includes("?") ? "&" : "?"}t=${now}`, {
        cache: "no-store"
    })
        .then(async res => {
            if (!res.ok) throw new Error(`ussro2 registry returned ${res.status}`);

            remoteBackgrounds = cleanBackgrounds(await res.json());
            lastRegistryRefresh = Date.now();
        })
        .catch(() => {
            lastRegistryRefresh = Date.now();
        })
        .finally(() => {
            registryRefreshPromise = null;
        });

    return registryRefreshPromise;
}

function getBackgroundUrl(userId?: string | null) {
    if (!userId) return null;

    void refreshRegistry();

    return remoteBackgrounds[userId] ?? bundledBackgrounds[userId] ?? null;
}

export default definePlugin({
    name: "ussro2Public",
    description: "Shows shared o2 profile backgrounds for everyone using this o2cord build.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    settings,
    enabledByDefault: true,
    start() {
        void refreshRegistry(true);
        registryRefreshTimer = window.setInterval(() => void refreshRegistry(true), REGISTRY_REFRESH_MS);
    },
    stop() {
        if (registryRefreshTimer) window.clearInterval(registryRefreshTimer);
        registryRefreshTimer = undefined;
    },
    patches: [
        {
            find: ':"SHOULD_LOAD");',
            replacement: {
                match: /\i(?:\?)?.getPreviewBanner\(\i,\i,\i\)(?=.{0,100}"COMPLETE")/,
                replace: "$self.patchBannerUrl(arguments[0])||$&"
            }
        },
        {
            find: "\"data-selenium-video-tile\":",
            replacement: {
                match: /style:(\i),ref:(\i),"data-selenium-video-tile":(\i)/,
                replace: 'style:$self.getVoiceBackgroundStyles($1,$3),ref:$2,"data-selenium-video-tile":$3'
            }
        },
        {
            find: '"VideoBackground-web"',
            replacement: {
                match: /(style:\i\?\{\.\.\.\i,\.\.\.\i\}:\{\.\.\.\i\}),className:/,
                replace: "$1,...$self.getVoiceBackgroundOverride(u),className:"
            }
        }
    ],

    // Takes the tile's own computed style (whatever Discord derived from the
    // user's theme/avatar colors) and layers our image on top of it, rather
    // than replacing it outright, so nothing else about the tile's styling
    // changes if there's no custom background for this participant.
    getVoiceBackgroundStyles(originalStyle: any, participantUserId: string) {
        const imageUrl = getBackgroundUrl(participantUserId);
        if (!imageUrl) return originalStyle;

        return {
            ...originalStyle,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat"
        };
    },

    getVoiceBackgroundOverride(userId: string) {
        const imageUrl = getBackgroundUrl(userId);
        if (!imageUrl) return {};

        return {
            style: {
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
            }
        };
    },

    patchBannerUrl({ displayProfile }: any) {
        if (displayProfile?.banner && settings.store.nitroFirst) return;

        return getBackgroundUrl(displayProfile?.userId);
    }
});
