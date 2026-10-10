/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * O2 Presence - the data and the engine behind the window: saved presets, how a
 * preset becomes a Rich Presence activity, text variables ({time}, {date}...), and
 * the timer that keeps the presence fresh and rotates between presets.
 *
 * The activity is sent with the same local update Discord uses for a game it
 * detects (LOCAL_ACTIVITY_UPDATE) under its own socket id, so it never touches the
 * real game detection. Nothing here reads or sends a Discord token.
 */

import { definePluginSettings } from "@api/Settings";
import { isTruthy } from "@utils/guards";
import { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, FluxDispatcher, UserStore } from "@webpack/common";

export type TimeMode = "none" | "elapsed" | "startup" | "midnight" | "custom";

export interface Preset {
    id: string;
    name: string;

    appId: string;
    type: number;
    activityName: string;
    streamUrl: string;

    details: string;
    detailsUrl: string;
    state: string;
    stateUrl: string;

    largeImage: string;
    largeText: string;
    largeUrl: string;
    smallImage: string;
    smallText: string;
    smallUrl: string;

    btn1Text: string;
    btn1Url: string;
    btn2Text: string;
    btn2Url: string;

    partySize: number;
    partyMax: number;

    timeMode: TimeMode;
    startAt: number;
    endAt: number;
}

export const SOCKET_ID = "o2cord-O2Presence";
export const MAX_PRESETS = 30;
const SOCKET_STARTED_AT = Math.round(performance.timeOrigin);

export const settings = definePluginSettings({}).withPrivateSettings<{
    presets: Preset[];
    activeId: string;
    on: boolean;
    rotate: boolean;
    rotateMinutes: number;
}>();

export function newId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyPreset(name = "My status"): Preset {
    return {
        id: newId(),
        name,
        appId: "",
        type: ActivityType.PLAYING,
        activityName: "O2cord",
        streamUrl: "",
        details: "",
        detailsUrl: "",
        state: "",
        stateUrl: "",
        largeImage: "",
        largeText: "",
        largeUrl: "",
        smallImage: "",
        smallText: "",
        smallUrl: "",
        btn1Text: "",
        btn1Url: "",
        btn2Text: "",
        btn2Url: "",
        partySize: 0,
        partyMax: 0,
        timeMode: "none",
        startAt: 0,
        endAt: 0
    };
}

// ---------------------------------------------------------------- sanitising
// Presets can be pasted in from somebody else, so everything is checked: only
// known fields, strings cut to the length Discord accepts, links must be http(s).

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const link = (v: unknown) => {
    const s = text(v, 512);
    return /^https?:\/\/\S+$/i.test(s) ? s : "";
};
const num = (v: unknown, min: number, max: number) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const TIME_MODES: TimeMode[] = ["none", "elapsed", "startup", "midnight", "custom"];
const TYPES = [ActivityType.PLAYING, ActivityType.STREAMING, ActivityType.LISTENING, ActivityType.WATCHING, ActivityType.COMPETING] as number[];

export function sanitizePreset(raw: any, keepId = false): Preset {
    const base = emptyPreset();
    const r = raw && typeof raw === "object" ? raw : {};
    return {
        id: keepId && typeof r.id === "string" && /^[\w-]{3,40}$/.test(r.id) ? r.id : base.id,
        name: text(r.name, 40) || "Imported",
        appId: /^\d{17,20}$/.test(String(r.appId ?? "")) ? String(r.appId) : "",
        type: TYPES.includes(Number(r.type)) ? Number(r.type) : ActivityType.PLAYING,
        activityName: text(r.activityName, 128),
        streamUrl: link(r.streamUrl),
        details: text(r.details, 128),
        detailsUrl: link(r.detailsUrl),
        state: text(r.state, 128),
        stateUrl: link(r.stateUrl),
        largeImage: text(r.largeImage, 1024),
        largeText: text(r.largeText, 128),
        largeUrl: link(r.largeUrl),
        smallImage: text(r.smallImage, 1024),
        smallText: text(r.smallText, 128),
        smallUrl: link(r.smallUrl),
        btn1Text: text(r.btn1Text, 32),
        btn1Url: link(r.btn1Url),
        btn2Text: text(r.btn2Text, 32),
        btn2Url: link(r.btn2Url),
        partySize: num(r.partySize, 0, 1000),
        partyMax: num(r.partyMax, 0, 1000),
        timeMode: TIME_MODES.includes(r.timeMode) ? r.timeMode : "none",
        startAt: num(r.startAt, 0, 8.64e15),
        endAt: num(r.endAt, 0, 8.64e15)
    };
}

// ----------------------------------------------------------------- variables
// {time} 9:41 PM   {date} Sat, Oct 11   {day} Saturday   {user} your username

export const VARIABLES: [string, string][] = [
    ["{time}", "the clock, e.g. 9:41 PM"],
    ["{date}", "today, e.g. Sat, Oct 11"],
    ["{day}", "the weekday, e.g. Saturday"],
    ["{user}", "your username"]
];

export function hasVariables(s: string) {
    return /\{(time|date|day|user)\}/.test(s);
}

export function applyVariables(s: string) {
    if (!s.includes("{")) return s;
    const now = new Date();
    return s
        .replace(/\{time\}/g, now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }))
        .replace(/\{date\}/g, now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }))
        .replace(/\{day\}/g, now.toLocaleDateString("en-US", { weekday: "long" }))
        .replace(/\{user\}/g, UserStore.getCurrentUser()?.username ?? "");
}

function presetUsesVariables(p: Preset) {
    return [p.activityName, p.details, p.state, p.largeText, p.smallText, p.btn1Text, p.btn2Text].some(hasVariables);
}

// -------------------------------------------------------------- the activity

// Image links (or an asset key of the application) -> the id Discord wants. A link
// works with any application id, even none, so the id is optional.
const assetCache = new Map<string, string | undefined>();

async function resolveAsset(appId: string, key: string): Promise<string | undefined> {
    const cacheKey = `${appId}|${key}`;
    if (assetCache.has(cacheKey)) return assetCache.get(cacheKey);

    // A picture copied from a Discord chat. Discord's own asset lookup throws away
    // the "?ex=&is=&hm=" signature of such links, and without it the picture is
    // refused. "mp:" + path + signature is read by the client as
    // media.discordapp.net/<path>?<signature>, so keep the signature that way.
    const discord = key.match(/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(attachments\/\d+\/\d+\/[^?#\s]+)(\?[^#\s]*)?/i);
    if (discord) {
        const asset = `mp:${discord[1]}${(discord[2] ?? "").replace(/&$/, "")}`;
        assetCache.set(cacheKey, asset);
        return asset;
    }

    try {
        const [id] = await ApplicationAssetUtils.fetchAssetIds(appId || "0", [key]);
        assetCache.set(cacheKey, id);
        return id;
    } catch {
        return undefined;
    }
}

// When the current presence started, for the "elapsed" clock.
let presenceStartedAt = Date.now();

export async function buildActivity(p: Preset): Promise<Activity | null> {
    const name = applyVariables(p.activityName).trim();
    if (!name) return null;

    const activity: Activity = {
        application_id: p.appId || "0",
        name,
        type: p.type,
        flags: 1 << 0
    };

    const details = applyVariables(p.details).trim();
    const state = applyVariables(p.state).trim();
    if (details) activity.details = details;
    if (state) activity.state = state;
    if (p.detailsUrl && details) activity.details_url = p.detailsUrl;
    if (p.stateUrl && state) activity.state_url = p.stateUrl;
    if (p.type === ActivityType.STREAMING && p.streamUrl) activity.url = p.streamUrl;

    switch (p.timeMode) {
        case "elapsed":
            activity.timestamps = { start: presenceStartedAt };
            break;
        case "startup":
            activity.timestamps = { start: SOCKET_STARTED_AT };
            break;
        case "midnight": {
            const midnight = new Date();
            midnight.setHours(0, 0, 0, 0);
            activity.timestamps = { start: midnight.getTime() };
            break;
        }
        case "custom":
            if (p.startAt || p.endAt) {
                activity.timestamps = {};
                if (p.startAt) activity.timestamps.start = p.startAt;
                if (p.endAt) activity.timestamps.end = p.endAt;
            }
            break;
    }

    const buttons = [
        [applyVariables(p.btn1Text).trim(), p.btn1Url],
        [applyVariables(p.btn2Text).trim(), p.btn2Url]
    ].filter(([label, url]) => label && url);
    if (buttons.length) {
        activity.buttons = buttons.map(([label]) => label);
        activity.metadata = { button_urls: buttons.map(([, url]) => url).filter(isTruthy) };
    }

    const [large, small] = await Promise.all([
        p.largeImage ? resolveAsset(p.appId, p.largeImage) : undefined,
        p.smallImage ? resolveAsset(p.appId, p.smallImage) : undefined
    ]);
    if (large || small) {
        activity.assets = {};
        if (large) {
            activity.assets.large_image = large;
            if (p.largeText) activity.assets.large_text = applyVariables(p.largeText);
            if (p.largeUrl) activity.assets.large_url = p.largeUrl;
        }
        if (small) {
            activity.assets.small_image = small;
            if (p.smallText) activity.assets.small_text = applyVariables(p.smallText);
            if (p.smallUrl) activity.assets.small_url = p.smallUrl;
        }
    }

    if (p.partySize > 0 && p.partyMax >= p.partySize) activity.party = { size: [p.partySize, p.partyMax] };

    return activity;
}

// ------------------------------------------------------------------- engine

const listeners = new Set<() => void>();
export const onPresenceChange = (fn: () => void) => { listeners.add(fn); return () => void listeners.delete(fn); };
const notify = () => listeners.forEach(fn => fn());

let timer: ReturnType<typeof setInterval> | undefined;
let lastSent = "";
let lastRotateAt = Date.now();
let pushing = false;

export function getPresets(): Preset[] {
    // Plain copies: the store hands out proxies, and a proxy inside a list that is
    // written back can't be cloned for saving (the save would throw half-way).
    return Array.isArray(settings.store.presets) ? JSON.parse(JSON.stringify(settings.store.presets)) : [];
}

export function getActivePreset(): Preset | undefined {
    const list = getPresets();
    return list.find(p => p.id === settings.store.activeId) ?? list[0];
}

function send(activity: Activity | null) {
    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity, socketId: SOCKET_ID });
}

// Sends what should be showing right now. Skips the update when it is identical to
// the last one, so the refresh timer doesn't keep poking Discord.
export async function pushPresence(force = false) {
    if (pushing) return;
    pushing = true;
    try {
        const preset = getActivePreset();
        const activity = settings.store.on && preset ? await buildActivity(preset) : null;
        const key = JSON.stringify(activity);
        if (!force && key === lastSent) return;
        lastSent = key;
        send(activity);
        notify();
    } finally {
        pushing = false;
    }
}

export function usePreset(id: string) {
    settings.store.activeId = id;
    settings.store.on = true;
    presenceStartedAt = Date.now();
    lastRotateAt = Date.now();
    return pushPresence(true);
}

export function turnOff() {
    settings.store.on = false;
    return pushPresence(true);
}

function tick() {
    const { on, rotate, rotateMinutes } = settings.store;
    const presets = getPresets();
    if (on && rotate && presets.length > 1 && Date.now() - lastRotateAt >= Math.max(1, rotateMinutes || 5) * 60_000) {
        const i = presets.findIndex(p => p.id === settings.store.activeId);
        settings.store.activeId = presets[(i + 1) % presets.length].id;
        presenceStartedAt = Date.now();
        lastRotateAt = Date.now();
        void pushPresence(true);
        return;
    }

    // variables like {time} change on their own; everything else only on edits
    const preset = getActivePreset();
    if (on && preset && presetUsesVariables(preset)) void pushPresence();
}

export function startEngine() {
    if (!Array.isArray(settings.store.presets) || !settings.store.presets.length) {
        const first = emptyPreset();
        settings.store.presets = [first];
        settings.store.activeId = first.id;
    }
    if (typeof settings.store.rotateMinutes !== "number") settings.store.rotateMinutes = 5;
    presenceStartedAt = Date.now();
    lastRotateAt = Date.now();
    timer = setInterval(tick, 20_000);
    void pushPresence(true);
}

export function stopEngine() {
    if (timer) clearInterval(timer);
    timer = undefined;
    lastSent = "";
    send(null);
}
