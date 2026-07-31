/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Message } from "@vencord/discord-types";
import { findCssClassesLazy } from "@webpack";
import { MessageStore, useEffect, UserStore, useState, useStateFromStores } from "@webpack/common";

import { cl, settings } from ".";
import { IconGhost } from "./IconGhost";

function isChannelExempted(channel: Channel): boolean {
    const exemptList = settings.store.exemptedChannels
        .split(",")
        .map(id => id.trim())
        .filter(id => id.length > 0);
    const isGroupDmsExempted = settings.store.ignoreGroupDms && channel.isGroupDM();

    return exemptList.includes(channel.id) || isGroupDmsExempted;
}

const countedChannels = new Set<string>();
const clearedChannels = new Map<string, string>();
const clearedChannelListeners = new Set<(channelId: string) => void>();

let _booCount = 0;
const listeners = new Set<(n: number) => void>();

export function getBooCount() {
    return _booCount;
}

export function setBooCount(n: number) {
    _booCount = Math.max(0, n);
    for (const l of listeners) l(_booCount);
}

export function onBooCountChange(cb: (n: number) => void) {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

export function onClearedChannelChange(cb: (channelId: string) => void) {
    clearedChannelListeners.add(cb);
    return () => {
        clearedChannelListeners.delete(cb);
    };
}

export function getGhostedChannels(): string[] {
    return Array.from(countedChannels);
}

export function clearChannelFromGhost(channelId: string): void {
    if (!countedChannels.has(channelId)) return;

    countedChannels.delete(channelId);
    setBooCount(getBooCount() - 1);

    const lastMessage = MessageStore.getMessages(channelId)?.last();
    if (lastMessage) clearedChannels.set(channelId, lastMessage.id);

    for (const listener of clearedChannelListeners) listener(channelId);
}

const ChannelWrapperStyles = findCssClassesLazy("muted", "wrapper");

export function Boo({ channel }: { channel: Channel; }) {
    const { id } = channel;
    const currentUserId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const lastMessage: Message = useStateFromStores([MessageStore], () => MessageStore.getMessages(id)?.last());

    const [state, setState] = useState({
        isCurrentUser: null as boolean | null,
        containsQuestionMark: false,
        isDataProcessed: false,
    });
    const [isCleared, setIsCleared] = useState(false);

    const lastMessageTimestampMs = lastMessage ? new Date(lastMessage.timestamp).getTime() : 0;
    const isInactive = !!lastMessage
        && settings.store.maxInactiveTimeMs > 0
        && Number.isFinite(lastMessageTimestampMs)
        && Date.now() - lastMessageTimestampMs > settings.store.maxInactiveTimeMs;

    useEffect(() => {
        if (!lastMessage || !currentUserId) return;

        const lastIsCurrentUser = lastMessage.author.id === currentUserId;
        const containsQuestionMark = !lastIsCurrentUser && lastMessage.content.includes("?");

        setState({
            isCurrentUser: lastIsCurrentUser,
            containsQuestionMark,
            isDataProcessed: true,
        });
    }, [lastMessage, currentUserId]);

    useEffect(() => {
        setIsCleared(clearedChannels.has(id));

        const unsubscribe = onClearedChannelChange(clearedChannelId => {
            if (clearedChannelId === id) setIsCleared(clearedChannels.has(id));
        });

        return unsubscribe;
    }, [id, lastMessage?.id]);

    useEffect(() => {
        if (!settings.store.active || !state.isDataProcessed) return;

        const isExempted = isChannelExempted(channel);
        let wasManuallyCleared = clearedChannels.has(id);

        if (wasManuallyCleared && !state.isCurrentUser) {
            const clearedAtMessageId = clearedChannels.get(id);
            const currentLastMessageId = lastMessage?.id;

            if (clearedAtMessageId === currentLastMessageId) return;

            if (currentLastMessageId !== clearedAtMessageId) {
                clearedChannels.delete(id);
                wasManuallyCleared = false;
                for (const listener of clearedChannelListeners) listener(id);
            }
        }

        if (state.isCurrentUser) {
            if (countedChannels.has(id)) {
                countedChannels.delete(id);
                setBooCount(getBooCount() - 1);
            }
            clearedChannels.delete(id);
            return;
        }

        if (isExempted || (settings.store.ignoreBots && lastMessage.author.bot) || isInactive) {
            if (countedChannels.has(id)) {
                countedChannels.delete(id);
                setBooCount(getBooCount() - 1);
            }
            return;
        }

        if (wasManuallyCleared) return;

        if (!state.isCurrentUser && !countedChannels.has(id)) {
            countedChannels.add(id);
            setBooCount(getBooCount() + 1);
        }
    }, [state.isCurrentUser, state.isDataProcessed, id, lastMessage?.id, isInactive]);

    if (
        !settings.store.active ||
        !settings.store.showDmIcons ||
        !state.isDataProcessed ||
        !currentUserId ||
        !lastMessage ||
        state.isCurrentUser ||
        isChannelExempted(channel) ||
        isCleared ||
        (settings.store.ignoreBots && lastMessage.author.bot) ||
        isInactive
    ) return null;

    return (
        <div className={cl("icon", ChannelWrapperStyles.wrapper)}>
            <IconGhost fill={state.containsQuestionMark ? "#ff8000" : "currentColor"} />
        </div>
    );
}
