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
import { Devs } from "@utils/constants";
import { isTruthy } from "@utils/guards";
import { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, FluxDispatcher, RestAPI, SnowflakeUtils, UserStore } from "@webpack/common";

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
    /** where pictures from the computer are sent (Ryder only) */
    pictureChannelId: string;
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

// ------------------------------------------------------ Discord picture links
// A picture sent in Discord has a signed link that stops working after about a
// day ("ex" in the link is when). Discord itself hands out a fresh link for the
// same picture while its message still exists, so the presence asks for one
// shortly before the old one runs out and keeps the picture showing.

const ATTACHMENT_LINK = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i;
const RENEW_BEFORE = 30 * 60_000;
const RETRY_AFTER = 10 * 60_000;
const renewFailedAt = new Map<string, number>();

export function linkExpiresAt(url: string) {
    if (!ATTACHMENT_LINK.test(url)) return Infinity;
    try {
        const ex = new URL(url).searchParams.get("ex");
        return ex && /^[0-9a-f]{1,8}$/i.test(ex) ? parseInt(ex, 16) * 1000 : Infinity;
    } catch {
        return Infinity;
    }
}

function needsRenewing(url: string) {
    return linkExpiresAt(url) - Date.now() < RENEW_BEFORE && Date.now() - (renewFailedAt.get(url) ?? 0) > RETRY_AFTER;
}

/** Swaps expiring Discord picture links in a saved preset for fresh ones. */
export async function renewLinks(preset: Preset) {
    const fields = (["largeImage", "smallImage"] as const).filter(f => needsRenewing(preset[f]));
    if (!fields.length) return;
    const urls = fields.map(f => preset[f]);

    let fresh = new Map<string, string>();
    try {
        const { body } = await RestAPI.post({ url: "/attachments/refresh-urls", body: { attachment_urls: urls } });
        fresh = new Map((body?.refreshed_urls ?? []).map((r: any) => [r.original, r.refreshed]));
    } catch { }

    const list = getPresets();
    const saved = list.find(p => p.id === preset.id);
    let changed = false;
    for (const f of fields) {
        const url = fresh.get(preset[f]);
        // the message was deleted (or Discord said no): try again later, not every tick
        if (typeof url !== "string" || !ATTACHMENT_LINK.test(url) || linkExpiresAt(url) <= Date.now()) {
            renewFailedAt.set(preset[f], Date.now());
            continue;
        }
        preset[f] = url;
        if (saved) saved[f] = url;
        changed = true;
    }
    if (changed && saved) {
        settings.store.presets = list;
        notify();
    }
}

// ------------------------------------------------- pictures from the computer
// Ryder only: the picture is sent as a message to a channel he picked, and that
// message's link is used (and kept fresh by renewLinks above).

export const canUploadPictures = () => UserStore.getCurrentUser()?.id === String(Devs.Ryder.id);

export async function uploadPicture(file: File): Promise<string> {
    if (!canUploadPictures()) throw new Error("not allowed");
    const channelId = settings.store.pictureChannelId;
    if (!channelId) throw new Error("Pick a channel for the pictures first.");

    const { body: slots } = await RestAPI.post({
        url: `/channels/${channelId}/attachments`,
        body: { files: [{ filename: file.name, file_size: file.size, id: "0" }] }
    });
    const slot = slots?.attachments?.[0];
    if (!slot?.upload_url) throw new Error("Discord didn't give an upload slot.");
    const put = await fetch(slot.upload_url, { method: "PUT", body: file });
    if (!put.ok) throw new Error(`Upload failed (${put.status}).`);

    const { body: message } = await RestAPI.post({
        url: `/channels/${channelId}/messages`,
        body: {
            content: "O2 Presence picture - keep this message, the picture stops showing if it's deleted.",
            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
            attachments: [{ id: "0", filename: file.name, uploaded_filename: slot.upload_filename }]
        }
    });
    const url = message?.attachments?.[0]?.url;
    if (typeof url !== "string") throw new Error("The picture was sent but Discord didn't return its link.");
    return url;
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
        case "custom": {
            // Discord drops the whole activity (silently - it still shows on your
            // side) when a time is before 1970, so the oldest start it gets is 1970
            const start = p.startAt ? Math.max(1, p.startAt) : 0;
            const end = p.endAt > 0 ? p.endAt : 0;
            if (start || end) {
                activity.timestamps = {};
                if (start) activity.timestamps.start = start;
                if (end) activity.timestamps.end = end;
            }
            break;
        }
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
        if (settings.store.on && preset) await renewLinks(preset);
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

    // variables like {time} and Discord picture links change on their own;
    // everything else only on edits
    const preset = getActivePreset();
    if (on && preset && (presetUsesVariables(preset) || needsRenewing(preset.largeImage) || needsRenewing(preset.smallImage))) void pushPresence();
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
