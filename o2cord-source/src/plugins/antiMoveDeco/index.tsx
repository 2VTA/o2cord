/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { Devs } from "@utils/constants";
import { isDebugOwner } from "@utils/o2Debug";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, FluxDispatcher, Forms, React, UserStore } from "@webpack/common";

const ChannelActions = findByPropsLazy("selectVoiceChannel", "disconnect");
const SelectedChannelStore = findByPropsLazy("getVoiceChannelId", "getChannelId");

let enabled = false;
let targetChannelId: string | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
    for (const listener of listeners) listener();
}

function isInVoiceChannel() {
    return Boolean(SelectedChannelStore?.getVoiceChannelId?.());
}

function enableForCurrentVoiceChannel() {
    const channelId = SelectedChannelStore?.getVoiceChannelId?.();
    if (!channelId) return false;

    targetChannelId = channelId;
    enabled = true;
    console.log(`[AntiMoveDeco] Enabled. Protected channel: ${targetChannelId}`);
    notifyListeners();

    return true;
}

function disableProtection() {
    enabled = false;
    targetChannelId = null;
    console.log("[AntiMoveDeco] Disabled.");
    notifyListeners();
}

function toggleProtection() {
    if (enabled) {
        disableProtection();
        return true;
    }

    return enableForCurrentVoiceChannel();
}

function onVoiceStateUpdate({ voiceStates }: { voiceStates: any[]; }) {
    notifyListeners();

    if (!enabled || !targetChannelId) return;

    const currentUser = UserStore.getCurrentUser();
    if (!currentUser) return;

    const myState = voiceStates.find(s => s.userId === currentUser.id);
    if (!myState || myState.channelId === targetChannelId) return;

    console.log(`[AntiMoveDeco] Movement or disconnect detected. Returning to channel ${targetChannelId}...`);

    setTimeout(() => {
        if (!enabled || !targetChannelId) return;

        try {
            ChannelActions?.selectVoiceChannel?.(targetChannelId);
        } catch (e) {
            console.error("[AntiMoveDeco] Error while reconnecting:", e);
        }
    }, 500);
}

// Line icon in currentColor like Discord's own header icons (it used to be a
// red 🚫 emoji that ignored the theme). Off: shield outline. On (protecting
// the channel): filled shield with a check - the button's "selected" state
// also brightens it, same as Discord's toggles.
function AntiMoveDecoIcon({ enabled, width = 20, height = 20 }: { enabled: boolean; width?: number; height?: number; }) {
    const shield = "M12 2.5 4.5 5.3v5.9c0 4.9 3.2 9.2 7.5 10.3 4.3-1.1 7.5-5.4 7.5-10.3V5.3L12 2.5Z";
    return (
        <svg aria-hidden="true" width={width} height={height} viewBox="0 0 24 24" fill="none">
            {enabled ? (
                <>
                    <path d={shield} fill="currentColor" />
                    <path
                        d="m8.5 12.2 2.4 2.4 4.6-4.9"
                        stroke="var(--background-base-lowest, #000)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </>
            ) : (
                <path d={shield} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            )}
        </svg>
    );
}

function AntiMoveDecoButton() {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const canEnable = enabled || isInVoiceChannel();

    React.useEffect(() => {
        listeners.add(forceUpdate);

        return () => void listeners.delete(forceUpdate);
    }, []);

    return (
        <HeaderBarButton
            onClick={() => {
                if (!canEnable) return;
                toggleProtection();
            }}
            tooltip={
                enabled
                    ? "Disable AntiMoveDeco"
                    : canEnable
                        ? "Protect current voice channel"
                        : "Join a voice channel first"
            }
            icon={(p: { width?: number; height?: number; }) => <AntiMoveDecoIcon enabled={enabled} width={p.width} height={p.height} />}
            aria-label="AntiMoveDeco"
            selected={enabled}
        />
    );
}

function AntiMoveDecoSettings() {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const isInVoice = isInVoiceChannel();

    React.useEffect(() => {
        listeners.add(forceUpdate);

        return () => void listeners.delete(forceUpdate);
    }, []);

    return (
        <Forms.FormSection>
            <Forms.FormText>
                {enabled
                    ? `Protecting voice channel ${targetChannelId}. If someone moves or disconnects you, o2cord will reconnect you.`
                    : isInVoice
                        ? "Click the button to protect your current voice channel."
                        : "Join a voice channel first, then press the button to enable protection."}
            </Forms.FormText>
            <div style={{ marginTop: 12 }}>
                <Button
                    color={enabled ? Button.Colors.RED : Button.Colors.BRAND}
                    disabled={!enabled && !isInVoice}
                    onClick={() => {
                        toggleProtection();
                        forceUpdate();
                    }}
                >
                    {enabled ? "Disable AntiMoveDeco" : "Protect Current Voice Channel"}
                </Button>
            </div>
        </Forms.FormSection>
    );
}

const settings = definePluginSettings({
    controls: {
        type: OptionType.COMPONENT,
        component: AntiMoveDecoSettings
    }
});

export default definePlugin({
    name: "AntiMoveDeco",
    description: "Adds a button to prevent being moved or disconnected from a voice channel.",
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: false,
    hidden: true,
    settings,

    start() {
        if (!isDebugOwner()) return;
        addHeaderBarButton("anti-move-deco", () => <AntiMoveDecoButton />, 31);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
    },

    stop() {
        removeHeaderBarButton("anti-move-deco");
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATES", onVoiceStateUpdate);
        enabled = false;
        targetChannelId = null;
        notifyListeners();
    }
});
