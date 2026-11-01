/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Renderer side of the YouTube player (Ryder only): what's playing, and the
 * calls into native.ts. The player itself lives in the main process, so it
 * keeps going when the O2 Voice window is closed.
 */

import { Devs } from "@utils/constants";
import { PluginNative } from "@utils/types";
import { UserStore } from "@webpack/common";

import { headphonesName, settings } from "./engine";

const Native = VencordNative.pluginHelpers.O2Voice as PluginNative<typeof import("./native")>;

export const canUseYoutube = () => UserStore.getCurrentUser()?.id === String(Devs.Ryder.id);

export interface YtState {
    title: string;
    playing: boolean;
    paused: boolean;
    time: number;
    duration: number;
    loading: boolean;
    error: string;
}

const state: YtState = { title: "", playing: false, paused: false, time: 0, duration: 0, loading: false, error: "" };
export const getYt = () => state;

const listeners = new Set<() => void>();
export function onYtChange(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}
const emit = () => listeners.forEach(fn => fn());

let poll: ReturnType<typeof setInterval> | undefined;

function startPoll() {
    clearInterval(poll);
    poll = setInterval(async () => {
        const s = await Native.ytStatus().catch(() => null);
        if (!s) return stopLocal();
        Object.assign(state, { time: s.time, duration: s.duration, paused: s.paused });
        if (s.ended) {
            void ytStop();
            return;
        }
        emit();
    }, 1000);
}

function stopLocal() {
    clearInterval(poll);
    poll = undefined;
    Object.assign(state, { title: "", playing: false, paused: false, time: 0, duration: 0, loading: false });
    emit();
}

const volume = () => settings.store.ytVolume / 100;

export async function ytPlay(link: string) {
    if (!canUseYoutube()) return;
    Object.assign(state, { loading: true, error: "" });
    emit();
    try {
        const title = await Native.ytPlay(link, { volume: volume(), hear: settings.store.ytHear, headphones: await headphonesName() });
        Object.assign(state, { title: title || "YouTube", playing: true, paused: false, loading: false });
        startPoll();
    } catch (e: any) {
        const msg = String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
        Object.assign(state, { loading: false, playing: false, error: msg });
        void Native.ytStop().catch(() => { });
    }
    emit();
}

export async function ytStop() {
    await Native.ytStop().catch(() => { });
    stopLocal();
}

export async function ytPause(paused: boolean) {
    await Native.ytPause(paused).catch(() => { });
    state.paused = paused;
    emit();
}

export async function ytApplySettings() {
    if (state.playing) await Native.ytSettings(volume(), settings.store.ytHear).catch(() => { });
}
