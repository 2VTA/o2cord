/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * O2 Voice's engine. Discord desktop records the mic in its own native voice
 * engine, out of o2cord's reach, so the changed voice gets to Discord the way
 * voice changer apps do it - through a virtual cable (VB-CABLE):
 *
 *   real mic -> o2cord (worklet + voice nodes) -> "CABLE Input" (a speaker)
 *   "CABLE Output" (a mic) -> Discord
 *
 * Turning it on remembers Discord's mic and switches Discord to CABLE Output;
 * turning it off puts the old mic back. The mic is only opened while you're in
 * a voice channel (or testing), so nothing runs - and Windows shows no mic in
 * use - the rest of the time.
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { MediaEngineStore, SelectedChannelStore, showToast, Toasts } from "@webpack/common";

import { CustomParams, getVoice } from "./voices";
import { WORKLET_NAME, WORKLET_SOURCE } from "./worklet";

const logger = new Logger("O2Voice", "#c792ea");
const AudioActions = findByPropsLazy("setInputDevice", "setOutputDevice");

export const settings = definePluginSettings({
    on: { type: OptionType.BOOLEAN, description: "", default: false, hidden: true },
    voice: { type: OptionType.STRING, description: "", default: "normal", hidden: true },
    volume: { type: OptionType.NUMBER, description: "", default: 100, hidden: true },
    reverseChunkMs: { type: OptionType.NUMBER, description: "", default: 450, hidden: true },
    micLabel: { type: OptionType.STRING, description: "", default: "", hidden: true },
    savedInputId: { type: OptionType.STRING, description: "", default: "", hidden: true },
    reverseKey: { type: OptionType.STRING, description: "", default: "", hidden: true },
    customPitch: { type: OptionType.NUMBER, description: "", default: 100, hidden: true },
    customEcho: { type: OptionType.NUMBER, description: "", default: 0, hidden: true },
    customReverb: { type: OptionType.NUMBER, description: "", default: 0, hidden: true },
    customGrit: { type: OptionType.NUMBER, description: "", default: 0, hidden: true },
    customRobot: { type: OptionType.NUMBER, description: "", default: 0, hidden: true }
});

export const VB_CABLE_URL = "https://vb-audio.com/Cable/";
const CABLE_MIC = /CABLE Output/i; // what Discord records from
const CABLE_SPEAKER = /CABLE Input/i; // what o2cord plays into

// ---------------------------------------------------------------- listeners (UI refresh)

const listeners = new Set<() => void>();
export function onVoiceChange(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}
const emit = () => listeners.forEach(fn => fn());

// ---------------------------------------------------------------- devices

interface DiscordDevice { id: string; name: string; }

function discordInputs(): DiscordDevice[] {
    return Object.values(MediaEngineStore.getInputDevices() ?? {}) as DiscordDevice[];
}

/** Discord's id for VB-CABLE's mic side, if VB-CABLE is installed. */
export function cableInputId() {
    return discordInputs().find(d => CABLE_MIC.test(d.name))?.id ?? null;
}

export const hasCable = () => !!cableInputId();

/** Real microphones the browser side can open (VB-CABLE's own mic left out). */
export async function listMics() {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    return devices.filter(d => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications" && !CABLE_MIC.test(d.label));
}

async function pickMicId(): Promise<string | undefined> {
    const mics = await listMics();
    const wanted = settings.store.micLabel;
    if (wanted) {
        const m = mics.find(d => d.label === wanted);
        if (m) return m.deviceId;
    }
    // Windows' default mic, unless that's the cable itself
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const def = all.find(d => d.kind === "audioinput" && d.deviceId === "default");
    if (def && !CABLE_MIC.test(def.label)) return "default";
    return mics[0]?.deviceId;
}

async function cableSpeakerId() {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    return devices.find(d => d.kind === "audiooutput" && CABLE_SPEAKER.test(d.label))?.deviceId ?? null;
}

// ---------------------------------------------------------------- the audio graph

let ctx: AudioContext | null = null;
let micStream: MediaStream | null = null;
let worklet: AudioWorkletNode | null = null;
let post: GainNode | null = null;
let voiceOut: GainNode | null = null;
let stopVoice: (() => void) | null = null;
let monitorAudio: HTMLAudioElement | null = null;
let monitorDest: MediaStreamAudioDestinationNode | null = null;
let workletUrl: string | null = null;
let building: Promise<void> | null = null;
let sendingTo: "cable" | "speakers" | null = null;

let recording = false;
let playingBack = false;
export const getRecordState = () => (recording ? "recording" : playingBack ? "playing" : "idle");

const inVoice = () => !!SelectedChannelStore.getVoiceChannelId();
export const isRunning = () => !!ctx;

function customParams(): CustomParams {
    const s = settings.store;
    return { pitch: s.customPitch, echo: s.customEcho, reverb: s.customReverb, grit: s.customGrit, robot: s.customRobot };
}

/** Puts the chosen voice between the worklet and the volume. */
export function applyVoice() {
    if (!ctx || !worklet || !post) return;
    stopVoice?.();
    worklet.disconnect();
    voiceOut?.disconnect();

    const voice = getVoice(settings.store.voice);
    const custom = customParams();
    const pitch = typeof voice.pitch === "function" ? voice.pitch(custom) : voice.pitch ?? 1;
    worklet.port.postMessage({ ratio: pitch, liveReverse: !!voice.liveReverse, chunkMs: settings.store.reverseChunkMs });

    voiceOut = ctx.createGain();
    voiceOut.connect(post);
    try {
        stopVoice = voice.build({ ctx, input: worklet, output: voiceOut, custom });
    } catch (e) {
        logger.error("Couldn't build voice", voice.id, e);
        worklet.connect(voiceOut);
        stopVoice = null;
    }
    emit();
}

export function applyVolume() {
    if (post) post.gain.value = Math.max(0, Math.min(2, settings.store.volume / 100));
}

async function applyMonitor() {
    if (!ctx || !post) return;
    // testing while the voice goes to the cable: also play it in your headphones
    const want = testing && sendingTo === "cable";
    if (want && !monitorAudio) {
        monitorDest = ctx.createMediaStreamDestination();
        post.connect(monitorDest);
        monitorAudio = new Audio();
        monitorAudio.srcObject = monitorDest.stream;
        await monitorAudio.play().catch(() => { });
    } else if (!want && monitorAudio) {
        monitorAudio.pause();
        monitorAudio.srcObject = null;
        monitorAudio = null;
        if (monitorDest) post.disconnect(monitorDest);
        monitorDest = null;
    }
}

async function build(target: "cable" | "speakers") {
    const micId = await pickMicId();
    micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            deviceId: micId && micId !== "default" ? { exact: micId } : undefined,
            // Discord does its own noise suppression and echo cancelling on the cable
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1
        }
    });

    ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
    workletUrl ??= URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(workletUrl);

    const src = ctx.createMediaStreamSource(micStream);
    worklet = new AudioWorkletNode(ctx, WORKLET_NAME, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    worklet.port.onmessage = ({ data }) => {
        if (data?.done) {
            playingBack = false;
            emit();
        }
    };
    src.connect(worklet);
    post = ctx.createGain();
    post.connect(ctx.destination);

    await setTarget(target);
    applyVolume();
    applyVoice();
}

async function setTarget(target: "cable" | "speakers") {
    if (!ctx) return;
    const sink = target === "cable" ? await cableSpeakerId() : "";
    if (target === "cable" && !sink) throw new Error("VB-CABLE's speaker (CABLE Input) wasn't found.");
    await (ctx as any).setSinkId(sink ?? "");
    sendingTo = target;
    await applyMonitor();
}

function teardown() {
    stopVoice?.();
    stopVoice = null;
    monitorAudio?.pause();
    monitorAudio = null;
    monitorDest = null;
    micStream?.getTracks().forEach(t => t.stop());
    micStream = null;
    void ctx?.close().catch(() => { });
    ctx = null;
    worklet = post = voiceOut = null;
    sendingTo = null;
    recording = playingBack = false;
}

// ---------------------------------------------------------------- what should be running

let testing = false;
export const isTesting = () => testing;

/** Brings the audio graph in line with the settings: built, re-targeted or torn down. */
export async function reconcile() {
    if (building) await building.catch(() => { });

    const s = settings.store;
    const sending = s.on && hasCable() && inVoice();
    const target: "cable" | "speakers" | null = sending ? "cable" : testing ? "speakers" : null;

    if (!target) {
        if (ctx) teardown();
        emit();
        return;
    }

    building = (async () => {
        if (!ctx) await build(target);
        else if (sendingTo !== target) await setTarget(target);
        else await applyMonitor();
    })();

    try {
        await building;
    } catch (e: any) {
        logger.error("Couldn't start", e);
        teardown();
        showToast(`O2 Voice couldn't start: ${e?.message ?? e}`, Toasts.Type.FAILURE);
    } finally {
        building = null;
        emit();
    }
}

// ---------------------------------------------------------------- on / off

export async function setOn(on: boolean) {
    const cable = cableInputId();
    if (on) {
        if (!cable) {
            showToast("Install VB-CABLE first (see the O2 Voice window).", Toasts.Type.FAILURE);
            return;
        }
        const current = MediaEngineStore.getInputDeviceId();
        // remember the real mic - unless Discord is already on the cable (e.g. after a crash)
        if (current && current !== cable) settings.store.savedInputId = current;
        settings.store.on = true;
        if (current !== cable) AudioActions.setInputDevice(cable);
    } else {
        settings.store.on = false;
        restoreDiscordMic();
    }
    await reconcile();
}

/** Puts Discord back on the mic it had before O2 Voice switched it to the cable. */
export function restoreDiscordMic() {
    const cable = cableInputId();
    if (!cable || MediaEngineStore.getInputDeviceId() !== cable) return;
    const saved = settings.store.savedInputId;
    const exists = saved && discordInputs().some(d => d.id === saved);
    AudioActions.setInputDevice(exists ? saved : "default");
}

/** Opens the mic again (another mic was picked). */
export async function reopenMic() {
    if (building) await building.catch(() => { });
    if (ctx) teardown();
    await reconcile();
}

export async function setTesting(on: boolean) {
    testing = on;
    await reconcile();
}

// ---------------------------------------------------------------- reverse a sentence

export function startSentence() {
    if (!worklet || recording || playingBack) {
        if (!worklet) showToast("Join a voice channel (or press Test) first.", Toasts.Type.MESSAGE);
        return;
    }
    recording = true;
    worklet.port.postMessage({ record: true });
    emit();
}

export function sendSentence() {
    if (!worklet || !recording) return;
    recording = false;
    playingBack = true;
    worklet.port.postMessage({ record: false });
    emit();
}

export function disposeEngine() {
    teardown();
    if (workletUrl) URL.revokeObjectURL(workletUrl);
    workletUrl = null;
}
