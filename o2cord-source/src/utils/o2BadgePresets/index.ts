/*
 * o2cord badge presets shared by the debug editor and BadgeAPI.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import bronzeImage from "file://bronze.png?base64";
import diamondImage from "file://diamond.png?base64";
import emeraldImage from "file://emerald.png?base64";
import goldImage from "file://gold.png?base64";
import opalImage from "file://opal.png?base64";
import platinumImage from "file://platinum.png?base64";
import rubyImage from "file://ruby.png?base64";
import silverImage from "file://silver.png?base64";

export interface O2LocalBadge {
    id: string;
    userId: string;
    name: string;
    image: string;
    size?: number;
}

export interface O2PresetBadge {
    id: string;
    name: string;
    icon?: string;
    image?: string;
    aliases?: string[];
}

export const O2_LOCAL_BADGES_KEY = "o2cord.debug.localBadges";
export const O2_HIDDEN_BADGES_KEY = "o2cord.debug.hiddenDiscordBadges";
export const O2_LOCAL_BADGES_UPDATED_EVENT = "o2cord:debug-local-badges-updated";
export const O2_HIDDEN_BADGES_UPDATED_EVENT = "o2cord:debug-hidden-badges-updated";

const embeddedPng = (base64: string) => `data:image/png;base64,${base64}`;

export const O2_PRESET_BADGES: O2PresetBadge[] = [
    { id: "discord_staff", name: "Discord Staff", icon: "5e74e9b61934fc1f67c65515d1f7e60d", aliases: ["staff"] },
    { id: "partner", name: "Partner", icon: "3f9748e53446a137a052f3454e2de41e" },
    { id: "hypesquad_events", name: "HypeSquad Events", icon: "bf01d1073931f921909045f3a39fd264", aliases: ["hypesquad_events"] },
    { id: "hypesquad_bravery", name: "HypeSquad Bravery", icon: "8a88d63823d8a71cd5e390baa45efa02", aliases: ["bravery"] },
    { id: "hypesquad_brilliance", name: "HypeSquad Brilliance", icon: "011940fd013da3f7fb926e4a1cd2e618", aliases: ["brilliance"] },
    { id: "hypesquad_balance", name: "HypeSquad Balance", icon: "3aa41de486fa12454c3761e8e223442e", aliases: ["balance"] },
    { id: "bug_hunter_level_1", name: "Bug Hunter", icon: "2717692c7dca7289b35297368a940dd0", aliases: ["bug_hunter_level_1"] },
    { id: "bug_hunter_level_2", name: "Golden Bug Hunter", icon: "848f79194d4be5ff5f81505cbd0ce1e6", aliases: ["bug_hunter_level_2"] },
    { id: "early_supporter", name: "Early Supporter", icon: "7060786766c9c840eb3019e725d2b358", aliases: ["early_supporter"] },
    { id: "verified_developer", name: "Verified Bot Developer", icon: "6df5892e0f35b051f8b61eace34f4967", aliases: ["verified_developer"] },
    { id: "certified_moderator", name: "Certified Moderator", icon: "fee1624003e2fee35cb398e125dc479b", aliases: ["certified_moderator", "moderator_programs_alumni"] },
    { id: "active_developer", name: "Active Developer", icon: "6bdc42827a38498929a4920da12695d9", aliases: ["active_developer"] },
    { id: "nitro", name: "Subscriber", icon: "2ba85e8026a8614b640c2837bcdfe21b", aliases: ["premium", "nitro"] },
    { id: "server_booster", name: "Server Booster", icon: "ec92202290b48d0879b7413d2dde3bab", aliases: ["guild_booster", "server_booster"] },
    { id: "originally_known_as", name: "Originally Known As", icon: "6de6d34650760ba5551a79732e98ed60", aliases: ["legacy_username", "originally_known_as"] },
    { id: "quest_completed", name: "Completed a Quest", image: "https://discordresources.com/img/badges/quests.png", aliases: ["quest"] },
    { id: "nitro_bronze", name: "Bronze - 1 Month", image: embeddedPng(bronzeImage), aliases: ["bronze"] },
    { id: "nitro_silver", name: "Silver - 3 Months", image: embeddedPng(silverImage), aliases: ["silver"] },
    { id: "nitro_gold", name: "Gold - 6 Months", image: embeddedPng(goldImage), aliases: ["gold"] },
    { id: "nitro_platinum", name: "Platinum - 1 Year", image: embeddedPng(platinumImage), aliases: ["platinum"] },
    { id: "nitro_diamond", name: "Diamond - 2 Years", image: embeddedPng(diamondImage), aliases: ["diamond"] },
    { id: "nitro_emerald", name: "Emerald - 3 Years", image: embeddedPng(emeraldImage), aliases: ["emerald"] },
    { id: "nitro_ruby", name: "Ruby - 5 Years", image: embeddedPng(rubyImage), aliases: ["ruby"] },
    { id: "nitro_opal", name: "Opal - 6+ Years", image: embeddedPng(opalImage), aliases: ["opal"] },
    { id: "boost_2_months", name: "Server Boost 2 Months", image: "https://discordresources.com/img/boosts/discordboost1.svg" },
    { id: "boost_3_months", name: "Server Boost 3 Months", image: "https://discordresources.com/img/boosts/discordboost2.svg" },
    { id: "boost_6_months", name: "Server Boost 6 Months", image: "https://discordresources.com/img/boosts/discordboost3.svg" },
    { id: "boost_9_months", name: "Server Boost 9 Months", image: "https://discordresources.com/img/boosts/discordboost4.svg" },
    { id: "boost_12_months", name: "Server Boost 12 Months", image: "https://discordresources.com/img/boosts/discordboost5.svg" },
    { id: "boost_15_months", name: "Server Boost 15 Months", image: "https://discordresources.com/img/boosts/discordboost6.svg" },
    { id: "boost_18_months", name: "Server Boost 18 Months", image: "https://discordresources.com/img/boosts/discordboost7.svg" },
    { id: "boost_24_months", name: "Server Boost 24 Months", image: "https://discordresources.com/img/boosts/discordboost8.svg" },
    { id: "boost_36_months", name: "Server Boost 36 Months", image: "https://discordresources.com/img/boosts/discordboost9.svg" },
    { id: "clown_decoration", name: "A Clown, for now.", image: "https://discordresources.com/img/badges/lootbox.svg" },
    { id: "bot_http_interactions", name: "Uses HTTP Interactions", image: "https://discordresources.com/img/botbadges/usesinteractions.svg" },
    { id: "automod_badge", name: "Uses AutoMod", image: "https://discordresources.com/img/botbadges/usesautomod.svg" },
    { id: "premium_app", name: "Premium App", image: "https://discordresources.com/img/botbadges/premiumapp.svg" },
    { id: "supports_commands", name: "Supports Commands", image: "https://discordresources.com/img/botbadges/supportscommands.svg" }
];

export function getO2PresetBadgeImage(preset: O2PresetBadge) {
    return preset.image ?? `https://cdn.discordapp.com/badge-icons/${preset.icon}.png`;
}

export function getO2PresetBadgeId(preset: O2PresetBadge) {
    return `preset-${preset.id}`;
}

export function doesO2BadgeMatchPreset(badge: Record<string, unknown> | null | undefined, preset: O2PresetBadge) {
    if (!badge) return false;

    const haystack = [badge.id, badge.key, badge.description, badge.iconSrc]
        .filter(value => typeof value === "string")
        .join(" ")
        .toLowerCase();

    if (preset.icon && haystack.includes(preset.icon.toLowerCase())) return true;
    if (haystack.includes(preset.id.toLowerCase())) return true;

    return preset.aliases?.some(alias => haystack.includes(alias.toLowerCase())) ?? false;
}
