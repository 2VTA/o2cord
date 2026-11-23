/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Sharing one plugin with a friend. The message that is sent is a normal link to the o2cord site with the plugin's
 * name in it, so anyone can read it; a friend who has o2cord sees a card with a switch under that message.
 * Plugins that exist only in the owner's build (private / debug-only) can never be shared or turned on this way.
 */

import { plugins } from "@api/PluginManager";
import { isPrivate } from "@api/SettingsSync/shareCode";

import { DEBUG_ONLY_PLUGINS } from "./o2Debug";
import { isPluginHidden } from "./o2TestPlugins";

const BASE = "https://2vta.github.io/o2cord/#plugin=";
const FIND = /2vta\.github\.io\/o2cord\/#plugin=([A-Za-z0-9_.]{1,64})/g;

/** true if this plugin may be handed to someone else */
export function canSharePlugin(name: string): boolean {
    const p = plugins[name];
    if (!p || p.required || p.hidden) return false;
    if (DEBUG_ONLY_PLUGINS.has(name) || isPrivate(name) || isPluginHidden(name)) return false;
    return true;
}

/** the text that is sent (the <> keeps Discord from adding a big preview of the site) */
export function sharePluginText(name: string): string {
    return `\u{1F9E9} **${name}** <${BASE}${name}>`;
}

/** plugin names found in a message (at most 3, no repeats) */
export function findSharedPlugins(content: string | undefined | null): string[] {
    if (!content || !content.includes("#plugin=")) return [];
    const out: string[] = [];
    for (const m of content.matchAll(FIND)) if (!out.includes(m[1]) && out.length < 3) out.push(m[1]);
    return out;
}
