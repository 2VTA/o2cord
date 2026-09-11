/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { Devs } from "@utils/constants";
import { fetchWithGithubFallback } from "@utils/githubFallbackFetch";
import definePlugin, { OptionType } from "@utils/types";
import { Channel } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { Forms, useStateFromStores } from "@webpack/common";

// Set your own phrase with the bot's /set-typing-phrase command (self-serve,
// no approval needed - it's short text, not an asset). Any o2cord user with
// this plugin on then sees "is <phrase>..." instead of "is typing..." for
// you, the same way ussro2/Nameplate/ProfileTheme read their own registries.
// Only handles the single-typer case for now - "A, B and C are typing..."
// is left alone rather than half-translating a multi-user sentence.
type Phrases = Record<string, string>;
const REGISTRY_REFRESH_MS = 30_000;
const PHRASE_MAX_LENGTH = 40;

const TypingStore = findStoreLazy("TypingStore");

let remotePhrases: Phrases = {};
let lastRegistryRefresh = 0;
let registryRefreshPromise: Promise<void> | null = null;
let registryRefreshTimer: number | undefined;

function cleanPhrase(value: unknown): string {
    return typeof value === "string" ? value.trim().slice(0, PHRASE_MAX_LENGTH) : "";
}

function cleanPhrases(raw: unknown): Phrases {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

    const out: Phrases = {};
    for (const [userId, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!/^\d{5,25}$/.test(userId)) continue;
        const phrase = cleanPhrase(value);
        if (phrase) out[userId] = phrase;
    }
    return out;
}

function getRegistryUrl() {
    const updateManifestUrl = typeof O2CORD_UPDATE_MANIFEST === "string" ? O2CORD_UPDATE_MANIFEST.trim() : "";
    if (!updateManifestUrl) return "";

    try {
        return new URL("typing-phrases.json", updateManifestUrl).href;
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
            if (!res.ok) throw new Error(`typing-phrases registry returned ${res.status}`);
            // Merge, don't replace - same reasoning as ussro2/Nameplate/ProfileTheme:
            // a CDN edge briefly serving a stale copy shouldn't wipe out an
            // already-known-good phrase for the ~30s until the next refresh.
            remotePhrases = { ...remotePhrases, ...cleanPhrases(await res.json()) };
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

function startRegistryRefresh() {
    if (registryRefreshTimer) return;
    void refreshRegistry(true);
    registryRefreshTimer = window.setInterval(() => void refreshRegistry(true), REGISTRY_REFRESH_MS);
}

function stopRegistryRefresh() {
    if (!registryRefreshTimer) return;
    clearInterval(registryRefreshTimer);
    registryRefreshTimer = undefined;
}

function getPhraseForUser(userId: string): string {
    void refreshRegistry();
    return remotePhrases[userId] ?? "";
}

export default definePlugin({
    name: "CustomTyping",
    description: "Shows other o2cord users' custom typing phrase (set with /set-typing-phrase) instead of \"is typing...\".",
    tags: ["Fun", "Customisation"],
    authors: [Devs.Ryder],

    start: startRegistryRefresh,
    stop: stopRegistryRefresh,

    settingsAboutComponent: () => (
        <Forms.FormText>
            Set your own phrase from anywhere in Discord with the bot's <code>/set-typing-phrase</code> command
            (e.g. "meowing" shows as "is meowing..." instead of "is typing..." to others with this on).
            Use <code>/clear-typing-phrase</code> to go back to normal.
        </Forms.FormText>
    ),

    patches: [
        {
            find: "#{intl::SEVERAL_USERS_TYPING_STRONG}",
            group: true,
            // TypingTweaks patches this exact same anchor for its own purpose
            // (avatars/colors) - running both independently risks one's regex
            // no longer matching after the other's replacement already ran.
            // Simplest safe split: only patch here when TypingTweaks is off.
            predicate: () => !isPluginEnabled("TypingTweaks"),
            replacement: [
                {
                    match: /(?<=function \i\(\i\)\{)(?=[^}]+?\{channel:\i,isThreadCreation:\i=!1,\.\.\.\i\})/,
                    replace: "let o2TypingUserIds=$self.useTypingUserIds(arguments[0]?.channel);"
                },
                {
                    match: /typingUsers:(\i)\?\[\]:\i,/,
                    replace: "$&o2TypingUserIds:$1||typeof o2TypingUserIds==='undefined'?[]:o2TypingUserIds,"
                },
                {
                    match: /(?<="aria-hidden":!0,children:)\i/,
                    replace: "$self.renderTypingChildren(arguments[0]?.o2TypingUserIds,$&)"
                }
            ]
        }
    ],

    useTypingUserIds(channel: Channel | undefined): string[] {
        return useStateFromStores([TypingStore], () =>
            channel ? Object.keys(TypingStore.getTypingUsers(channel.id)) : []
        );
    },

    renderTypingChildren(userIds: string[] | undefined, children: unknown) {
        if (!Array.isArray(children) || !Array.isArray(userIds) || userIds.length !== 1) return children;

        const phrase = getPhraseForUser(userIds[0]);
        if (!phrase) return children;

        return children.map((c: unknown) =>
            typeof c === "string" && /is typing/i.test(c) ? c.replace(/is typing/i, `is ${phrase}`) : c
        );
    }
});
