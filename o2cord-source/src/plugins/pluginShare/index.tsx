/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { hasAnyVisibleSettings, isPluginEnabled, plugins, pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { Settings, useSettings } from "@api/Settings";
import { CogWheel, InfoIcon } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { Devs } from "@utils/constants";
import { canSharePlugin, findSharedPlugins } from "@utils/o2PluginShare";
import definePlugin from "@utils/types";

import { openSharePicker } from "./Picker";
import { rewriteShare } from "./rewrite";
import { settings } from "./settings";
import { FluxDispatcher, React, showToast, Toasts, UserStore, UserUtils, useState } from "@webpack/common";
import { CALLIE_ID } from "@plugins/callieRequests";
import { MARIE_BOT } from "@utils/o2PluginShare";

/** the card under a message: the plugin, its switch, and a restart button when the switch needs one */
function SharedPlugin({ name }: { name: string; }) {
    useSettings([`plugins.${name}.enabled`]);
    const [needsRestart, setNeedsRestart] = useState(false);
    const plugin = plugins[name];

    if (!plugin || !canSharePlugin(name)) {
        return (
            <div className="o2ps-missing">
                <b>{name}</b> is not available in your o2cord{plugin ? "" : " (maybe it needs an update)"}.
            </div>
        );
    }

    const settings = Settings.plugins[name];
    const enabled = isPluginEnabled(name);

    function toggle() {
        const was = isPluginEnabled(name);

        if (!was) {
            const { restartNeeded, failures } = startDependenciesRecursive(plugin);
            if (failures.length) {
                showToast("Could not start: " + failures.join(", "), Toasts.Type.FAILURE);
                return;
            }
            if (restartNeeded) {
                settings.enabled = true;
                setNeedsRestart(true);
                return;
            }
        }

        // a plugin with patches only changes after a restart
        if (pluginRequiresRestart(plugin)) {
            settings.enabled = !was;
            setNeedsRestart(true);
            return;
        }

        if (was && !plugin.started) {
            settings.enabled = false;
            return;
        }

        if (!(was ? stopPlugin(plugin) : startPlugin(plugin))) {
            settings.enabled = false;
            showToast(`Error while ${was ? "stopping" : "starting"} ${name}`, Toasts.Type.FAILURE);
            return;
        }
        settings.enabled = !was;
    }

    return (
        <div className="o2ps-wrap">
            <AddonCard
                name={plugin.name}
                description={plugin.description}
                enabled={enabled}
                setEnabled={toggle}
                infoButton={
                    <button
                        role="switch"
                        className="o2ps-info"
                        onClick={() => openPluginModal(plugin, () => setNeedsRestart(true))}
                    >
                        {hasAnyVisibleSettings(plugin) ? <CogWheel className="o2ps-icon" /> : <InfoIcon className="o2ps-icon" />}
                    </button>
                }
            />
            {needsRestart && (
                <div className="o2ps-restart">
                    <span>Restart Discord to finish</span>
                    <button className="o2ps-restart-btn" onClick={() => location.reload()}>Restart</button>
                </div>
            )}
        </div>
    );
}

function Accessory({ message }: { message: { content?: string; }; }) {
    const names = findSharedPlugins(message.content);
    if (!names.length) return null;
    return <div className="o2ps-list">{names.map(n => <SharedPlugin key={n} name={n} />)}</div>;
}

// "Direct" shares (see rewrite.ts): a message somebody sent you that is a plugin share is shown as Marie / Callie
function interceptor(event: any) {
    try {
        const me = UserStore.getCurrentUser()?.id;
        if (event?.type === "MESSAGE_CREATE" || event?.type === "MESSAGE_UPDATE") rewriteShare(event.message, me);
        else if (event?.type === "LOAD_MESSAGES_SUCCESS") for (const m of event.messages ?? []) rewriteShare(m, me);
    } catch { /* never break message loading */ }
}

export default definePlugin({
    name: "PluginShare",
    settings,
    description: "Send a plugin to a friend: under your message they get a card with the plugin's switch (and a restart button if it needs one). Share from the plugin's card, or with /share-plugin.",
    tags: ["Utility"],
    authors: [Devs.Ryder],
    enabledByDefault: true,

    commands: [
        {
            name: "share-plugin",
            description: "Pick friends to send a plugin to (they get a card they can switch on)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{
                name: "plugin",
                description: "The plugin's name, e.g. AlwaysTrust",
                type: ApplicationCommandOptionType.STRING,
                required: true,
            }],
            execute: (args, ctx) => {
                const typed = String(findOption(args, "plugin", "")).trim().toLowerCase();
                const name = Object.keys(plugins).find(n => n.toLowerCase() === typed);
                if (!name || !canSharePlugin(name)) {
                    sendBotMessage(ctx.channel.id, { content: `"${typed}" is not a plugin that can be shared.` });
                    return;
                }
                                openSharePicker(name);
            },
        },
    ],

    start() {
        addMessageAccessory("o2-plugin-share", props => <Accessory message={props.message} />);
        // so the bot's name and picture are known when a shared message turns into one of theirs
        for (const id of [CALLIE_ID, MARIE_BOT.id]) if (!UserStore.getUser(id)) UserUtils.getUser(id).catch(() => { });
        FluxDispatcher.addInterceptor(interceptor);
    },
    stop() {
        removeMessageAccessory("o2-plugin-share");
        const list = (FluxDispatcher as any)._interceptors ?? [];
        const i = list.indexOf(interceptor);
        if (i !== -1) list.splice(i, 1);
    },
});
