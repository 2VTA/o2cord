/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * "Direct" share: the friend you share with gets an ordinary message from you (readable by anyone). In THEIR o2cord
 * that message is shown as coming from Marie (when it is from Ryder) or Callie (everyone else), saying who shared
 * what, with the card under it. Only the shape of the message changes on screen - nothing is sent or stored, and
 * the text can only be this fixed sentence, so it can't be used to put other words in a bot's mouth.
 */

import { Devs } from "@utils/constants";
import { MARIE_BOT } from "@utils/o2PluginShare";
import { UserStore } from "@webpack/common";

import { CALLIE_ID } from "@plugins/callieRequests";

const LINK = "https://2vta.github.io/o2cord/#plugin=";
// exactly what sharePluginText() sends: a puzzle piece, **Name**, <link>
const SHARE_RE = /^\u{1F9E9} \*\*([A-Za-z0-9_.]{2,64})\*\* <https:\/\/2vta\.github\.io\/o2cord\/#plugin=([A-Za-z0-9_.]{2,64})>\s*$/u;

export function sharedPluginName(content: unknown): string | null {
    if (typeof content !== "string") return null;
    const m = SHARE_RE.exec(content.trim());
    return m && m[1] === m[2] ? m[1] : null;
}

/** the bot a share from this person is shown as */
function botFor(senderId: string) {
    return senderId === String(Devs.Ryder.id) ? MARIE_BOT : { id: CALLIE_ID, name: "Callie" };
}

/** changes one raw message (as Discord sends it) in place, if it is a share somebody else sent in a DM */
export function rewriteShare(message: any, myId: string | undefined): boolean {
    if (!message || message.guild_id || !message.author || message.author.id === myId) return false;
    const name = sharedPluginName(message.content);
    if (!name) return false;

    const senderName = message.author.global_name ?? message.author.username ?? "Someone";
    const bot = botFor(String(message.author.id));
    const u = UserStore.getUser(bot.id);

    message.author = u
        ? { id: u.id, username: u.username, global_name: (u as any).globalName ?? u.username, avatar: u.avatar, discriminator: u.discriminator, bot: true }
        : { ...message.author, username: bot.name, global_name: bot.name, bot: true };
    message.content = `\u{1F9E9} **${senderName}** shared a plugin with you: **${name}** <${LINK}${name}>`;
    return true;
}
