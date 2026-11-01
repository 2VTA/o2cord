/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * O2 Voice - a voice changer for voice channels: chipmunk, demon, robot,
 * radio, phone, alien, underwater, cave, ghost, megaphone, live reverse and a
 * custom mix, plus "say a sentence backwards". A top-bar button opens the
 * window; right-click it for a quick voice menu. See engine.ts for how the
 * voice gets to Discord (VB-CABLE).
 */

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ContextMenuApi, Forms, MediaEngineStore, Menu, useEffect, useState } from "@webpack/common";

import {
    applyVoice, cableInputId, disposeEngine, getRecordState, hasCable, isRunning, onVoiceChange, reconcile,
    restoreDiscordMic, sendSentence, setOn, settings, startSentence
} from "./engine";
import { openVoiceModal } from "./VoiceModal";
import { getVoice, VOICES } from "./voices";

function VoiceIcon({ width = 20, height = 20, className }: { width?: number; height?: number; className?: string; }) {
    return (
        <svg aria-hidden="true" role="img" width={width} height={height} className={className} viewBox="0 0 24 24">
            <path
                fill="currentColor"
                d="M9 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-6 8h1.6a4.4 4.4 0 0 0 8.8 0H15a6 6 0 0 1-5.2 5.95V19H12v2H6v-2h2.2v-2.05A6 6 0 0 1 3 11Zm14.5-5.5 1.4-1.4a8 8 0 0 1 0 11.3l-1.4-1.4a6 6 0 0 0 0-8.5Zm-2.1 2.1 1.4-1.4a5 5 0 0 1 0 7.1l-1.4-1.4a3 3 0 0 0 0-4.3Z"
            />
        </svg>
    );
}

function VoiceMenu() {
    const { on, voice } = settings.store;
    return (
        <Menu.Menu navId="o2cord-o2-voice" onClose={ContextMenuApi.closeContextMenu} aria-label="O2 Voice">
            <Menu.MenuCheckboxItem
                id="o2-voice-on"
                label="Voice changer"
                checked={!!on && hasCable()}
                disabled={!hasCable()}
                action={() => void setOn(!on)}
            />
            <Menu.MenuSeparator />
            {VOICES.map(v => (
                <Menu.MenuRadioItem
                    key={v.id}
                    id={`o2-voice-${v.id}`}
                    group="o2-voice"
                    label={`${v.emoji}  ${v.name}`}
                    checked={voice === v.id}
                    action={() => { settings.store.voice = v.id; applyVoice(); }}
                />
            ))}
            <Menu.MenuSeparator />
            <Menu.MenuItem id="o2-voice-open" label="Open O2 Voice..." action={openVoiceModal} />
        </Menu.Menu>
    );
}

function VoiceHeaderButton() {
    const [, rerender] = useState(0);
    useEffect(() => onVoiceChange(() => rerender(n => n + 1)), []);
    const on = !!settings.store.on && hasCable();

    return (
        <HeaderBarButton
            icon={VoiceIcon}
            tooltip={on ? `O2 Voice: ${getVoice(settings.store.voice).name}${isRunning() ? "" : " (starts in a voice channel)"}` : "O2 Voice"}
            onClick={openVoiceModal}
            onContextMenu={e => ContextMenuApi.openContextMenu(e, () => <VoiceMenu />)}
            selected={on}
        />
    );
}

// ---- the sentence-reverse key (while Discord is focused)
function onKeyDown(e: KeyboardEvent) {
    const key = settings.store.reverseKey;
    if (!key || e.code !== key || e.repeat) return;
    if (getRecordState() !== "idle") return;
    startSentence();
}

function onKeyUp(e: KeyboardEvent) {
    const key = settings.store.reverseKey;
    if (key && e.code === key) sendSentence();
}

// Discord's device list arrives a little after startup - wait for it before
// checking anything, or an empty list would look like "VB-CABLE was removed".
let startTimer: ReturnType<typeof setInterval> | undefined;

function checkOnStart() {
    const started = Date.now();
    startTimer = setInterval(() => {
        const devices = Object.keys(MediaEngineStore.getInputDevices() ?? {});
        if (!devices.length && Date.now() - started < 15_000) return;
        clearInterval(startTimer);
        startTimer = undefined;
        if (!settings.store.on) return;
        const cable = cableInputId();
        // VB-CABLE removed, or Discord's mic changed by hand while o2cord was off - stay out of the way
        if (!cable || MediaEngineStore.getInputDeviceId() !== cable) {
            settings.store.on = false;
            restoreDiscordMic();
        }
        void reconcile();
    }, 500);
}

export default definePlugin({
    name: "O2Voice",
    description: "A voice changer for voice channels: chipmunk, demon, robot, radio, phone, alien, underwater, cave, ghost, megaphone, live reverse and your own mix - plus saying a whole sentence backwards. Needs the free VB-CABLE (the window walks you through it).",
    tags: ["Voice", "Fun"],
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    settings,

    settingsAboutComponent: () => (
        <>
            <Forms.FormText>Everything is set in the O2 Voice window (also the microphone button in the top bar).</Forms.FormText>
            <Button variant="primary" size="small" onClick={openVoiceModal} style={{ marginTop: 8 }}>Open O2 Voice</Button>
        </>
    ),

    flux: {
        VOICE_CHANNEL_SELECT() { void reconcile(); },
        RTC_CONNECTION_STATE() { void reconcile(); },
        AUDIO_SET_INPUT_DEVICE({ id }: { id: string; }) {
            // you picked another mic in Discord's own settings - O2 Voice steps aside
            if (settings.store.on && id && id !== cableInputId()) {
                settings.store.on = false;
                void reconcile();
            }
        }
    },

    start() {
        addHeaderBarButton("o2cord-o2-voice", () => <VoiceHeaderButton />, 894);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        checkOnStart();
    },

    stop() {
        removeHeaderBarButton("o2cord-o2-voice");
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        clearInterval(startTimer);
        // switched off: Discord gets its own mic back
        if (settings.store.on) {
            settings.store.on = false;
            restoreDiscordMic();
        }
        disposeEngine();
    }
});
