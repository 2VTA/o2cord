/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId } from "@api/ContextMenu";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { Channel } from "@vencord/discord-types";
import { Menu, openModal, Tooltip, useEffect, useState } from "@webpack/common";

import { Boo, clearChannelFromGhost, getBooCount, getGhostedChannels, onBooCountChange } from "./Boo";
import { getChannelDisplayName, GhostedUsersModal } from "./GhostedUsersModal";
import { IconGhost } from "./IconGhost";

export const cl = classNameFactory("vc-boo-");

export const settings = definePluginSettings({
    active: {
        type: OptionType.BOOLEAN,
        description: "Enable Ghosted in debug o2",
        default: false,
        restartNeeded: false
    },
    showIndicator: {
        type: OptionType.BOOLEAN,
        description: "Show the ghost counter at the top of the server list",
        default: true,
        restartNeeded: false
    },
    showDmIcons: {
        type: OptionType.BOOLEAN,
        description: "Show ghost icons next to individual DMs",
        default: true,
        restartNeeded: false
    },
    ignoreGroupDms: {
        type: OptionType.BOOLEAN,
        description: "Exclude all group DMs",
        default: false
    },
    exemptedChannels: {
        type: OptionType.STRING,
        description: "Comma-separated list of channel IDs to exempt",
        default: "",
        restartNeeded: false
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Ignore DMs from bots",
        default: true,
        restartNeeded: false
    },
    maxInactiveTimeMs: {
        type: OptionType.SELECT,
        description: "Only count DMs active within this timeframe",
        options: [
            { label: "No limit", value: 0, default: true },
            { label: "1 hour", value: 60 * 60 * 1000 },
            { label: "1 day", value: 24 * 60 * 60 * 1000 },
            { label: "1 week", value: 7 * 24 * 60 * 60 * 1000 },
            { label: "1 month", value: 30 * 24 * 60 * 60 * 1000 },
        ],
        restartNeeded: false
    }
});

function BooIndicator() {
    const [count, setCount] = useState(getBooCount());

    useEffect(() => onBooCountChange(setCount), []);

    if (!settings.store.active || !settings.store.showIndicator || getGhostedChannels().length === 0) return null;

    const handleClick = () => {
        const ghostedChannels = getGhostedChannels();
        openModal(modalProps => (
            <ErrorBoundary>
                <GhostedUsersModal
                    modalProps={modalProps}
                    ghostedChannels={ghostedChannels}
                    onClearGhost={clearChannelFromGhost}
                />
            </ErrorBoundary>
        ));
    };

    const getTooltipText = () => {
        const ghostedChannels = getGhostedChannels();
        if (ghostedChannels.length === 0) return "No users";
        if (ghostedChannels.length <= 5) return ghostedChannels.map(id => getChannelDisplayName(id)).join(", ");
        return `${ghostedChannels.length} users`;
    };

    return (
        <Tooltip text={getTooltipText()} position="right">
            {tooltipProps => (
                <button
                    {...tooltipProps}
                    type="button"
                    id={cl("container")}
                    className={cl("clickable")}
                    onClick={handleClick}
                >
                    {count} <IconGhost fill="currentColor" />
                </button>
            )}
        </Tooltip>
    );
}

function makeContextItem(props) {
    if (!settings.store.active) return null;

    return (
        <Menu.MenuItem
            id="ec-ghosted-clear"
            key="ec-ghosted-clear"
            label="Clear Ghosted"
            action={() => clearChannelFromGhost(props.channel.id)}
        />
    );
}

export default definePlugin({
    name: "Ghosted",
    description: "Shows a local indicator for DMs waiting on your reply",
    tags: ["Chat", "Utility"],
    authors: [Devs.sadan, Devs.iamme],
    settings,
    dependencies: ["ServerListAPI"],
    required: true,
    contextMenus: {
        "gdm-context": (menuItems, props) => {
            const item = makeContextItem(props);
            if (!item) return;

            const group = findGroupChildrenByChildId("leave", menuItems, true);
            group?.unshift(item);
        },
        "user-context": (menuItems, props) => {
            const item = makeContextItem(props);
            if (!item) return;

            const group = findGroupChildrenByChildId("close-dm", menuItems);
            group?.push(item);
        }
    },
    patches: [
        {
            find: "PrivateChannel.renderAvatar",
            replacement: {
                match: /\]:\i\|\|\i.{0,50}children:\[/,
                replace: "$&$self.renderBoo(arguments[0]),"
            }
        },
    ],

    renderBoo(props: { channel: Channel; }) {
        return (
            <ErrorBoundary noop>
                <Boo {...props} />
            </ErrorBoundary>
        );
    },

    renderIndicator() {
        return (
            <ErrorBoundary noop>
                <BooIndicator />
            </ErrorBoundary>
        );
    },

    start() {
        addServerListElement(ServerListRenderPosition.Above, this.renderIndicator);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, this.renderIndicator);
    },
});
