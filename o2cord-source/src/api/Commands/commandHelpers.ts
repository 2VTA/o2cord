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

import { mergeDefaults } from "@utils/mergeDefaults";
import { isRealDebugOwner } from "@utils/o2Debug";
import { CommandArgument, Message } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";
import { MessageActions, SnowflakeUtils, UserStore, UserUtils } from "@webpack/common";
import type { PartialDeep } from "type-fest";

const createBotMessage = findByCodeLazy('username:"Clyde"');

// The local "bot" messages (command results, notices from plugins) used to come from Clyde. Now they come from
// Marie (the owner bot) for Ryder only, and from Callie (the public bot) for everyone else (debug access does not count).
const MARIE_ID = "1567843790868189224";
const CALLIE_ID = "1538029895601623100";

function asO2Bot<T extends { author?: any; }>(botMessage: T): T {
    try {
        const marie = isRealDebugOwner();
        const id = marie ? MARIE_ID : CALLIE_ID;
        const name = marie ? "Marie" : "Callie";
        const u = UserStore.getUser(id);
        if (!u && !marie) UserUtils.getUser(id).catch(() => { }); // so her picture is there next time
        // her real account (name + picture) if Discord knows her; otherwise just her name on Clyde's picture
        botMessage.author = u
            ? { ...botMessage.author, id: u.id, username: u.username, globalName: u.globalName, avatar: u.avatar, discriminator: u.discriminator, bot: true }
            : { ...botMessage.author, username: name, globalName: name };
    } catch { /* keep Clyde */ }
    return botMessage;
}

export function generateId() {
    return `-${SnowflakeUtils.fromTimestamp(Date.now())}`;
}

/**
 * Send a message as Clyde (as Marie / Callie, see asO2Bot)
 * @param {string} channelId ID of channel to send message to
 * @param {Message} message Message to send
 * @returns {Message}
 */
export function sendBotMessage(channelId: string, message: PartialDeep<Message>): Message {
    const botMessage = asO2Bot(createBotMessage({ channelId, content: "", embeds: [] }));

    MessageActions.receiveMessage(channelId, mergeDefaults(message, botMessage));

    return message as Message;
}

/**
 * Get the value of an option by name
 * @param args Arguments array (first argument passed to execute)
 * @param name Name of the argument
 * @param fallbackValue Fallback value in case this option wasn't passed
 * @returns Value
 */
export function findOption<T>(args: CommandArgument[], name: string): T & {} | undefined;
export function findOption<T>(args: CommandArgument[], name: string, fallbackValue: T): T & {};
export function findOption(args: CommandArgument[], name: string, fallbackValue?: any) {
    return (args.find(a => a.name === name)?.value ?? fallbackValue) as any;
}
