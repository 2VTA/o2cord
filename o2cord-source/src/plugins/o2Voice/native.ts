/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * O2 Voice's YouTube player (Ryder's own button): a hidden window plays the
 * video, and inside that page its sound is taken off the <video> and sent two
 * ways - into VB-CABLE (so the voice channel hears it through your mic, mixed
 * with your voice) and into your headphones (so you hear it too). Devices are
 * picked by name: device ids differ per site, names don't.
 *
 * No ads: the embed player is used first (AdGuard's blocker is put into it,
 * like the YoutubeAdblock plugin does), and if an ad still starts it is muted
 * for everyone and skipped - nobody in the call hears it.
 */

import { BrowserWindow, IpcMainInvokeEvent, session } from "electron";
// AdGuard's YouTube ad blocker, the same file the YoutubeAdblock plugin uses
import adguard from "file://../youtubeAdblock.desktop/adguard.js?minify";

const PARTITION = "persist:o2voice-youtube";
let win: BrowserWindow | null = null;

/** The 11-character video id from any usual YouTube link, or null. */
function videoId(raw: string): string | null {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com") {
        id = url.searchParams.get("v")
            ?? /^\/(shorts|live|embed)\/([\w-]{11})/.exec(url.pathname)?.[2]
            ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
}

interface PlayOptions {
    volume: number; // 0-1.5
    hear: boolean;
    headphones: string; // device name to hear it on ("" = default)
}

// Runs inside the YouTube page.
const routeScript = (o: PlayOptions) => `(async () => {
    const opts = ${JSON.stringify(o)};
    let video = null;
    for (let i = 0; i < 100 && !video; i++) {
        video = document.querySelector("video.html5-main-video") || document.querySelector("video");
        if (!video) await new Promise(r => setTimeout(r, 150));
    }
    if (!video) throw new Error("The video didn't load.");

    // device names only show after one mic permission (granted for this hidden window only)
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); } catch {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cable = devices.find(d => d.kind === "audiooutput" && /CABLE Input/i.test(d.label));
    if (!cable) throw new Error("VB-CABLE wasn't found.");
    const head = opts.headphones ? devices.find(d => d.kind === "audiooutput" && d.label === opts.headphones) : null;

    const ctx = new AudioContext({ latencyHint: "playback" });
    await ctx.setSinkId(cable.deviceId);
    const src = ctx.createMediaElementSource(video);
    const toCable = ctx.createGain();
    toCable.gain.value = opts.volume;
    src.connect(toCable).connect(ctx.destination);

    const toMe = ctx.createGain();
    toMe.gain.value = opts.hear ? opts.volume : 0;
    const mine = ctx.createMediaStreamDestination();
    src.connect(toMe).connect(mine);
    const out = new Audio();
    if (head) await out.setSinkId(head.deviceId).catch(() => {});
    out.srcObject = mine.stream;
    await out.play().catch(() => {});

    const o = window.__o2voice = { video, toCable, toMe, volume: opts.volume, hear: opts.hear, ad: false };
    o.apply = () => {
        toCable.gain.value = o.ad ? 0 : o.volume;
        toMe.gain.value = o.ad || !o.hear ? 0 : o.volume;
    };

    // an ad that got through: silent for everyone, fast-forwarded, skipped
    setInterval(() => {
        const player = document.querySelector(".html5-video-player");
        const ad = !!player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"));
        if (ad) {
            video.muted = true;
            if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration;
            video.playbackRate = 16;
            document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button")?.click();
        } else if (o.ad) {
            video.muted = false;
            video.playbackRate = 1;
        }
        if (ad !== o.ad) {
            o.ad = ad;
            o.apply();
        }
    }, 200);

    video.loop = false;
    video.muted = false;
    o.apply();
    await video.play().catch(() => {});
    return document.title.replace(/ - YouTube$/, "");
})()`;

/**
 * YouTube redirects some first loads (adds &themeRefresh=1 and the like), which
 * makes loadURL give up with ERR_ABORTED - wait for the page it lands on instead.
 */
async function load(page: BrowserWindow, url: string) {
    const landed = new Promise<void>(resolve => {
        page.webContents.once("did-finish-load", () => resolve());
        setTimeout(resolve, 20_000);
    });
    await page.loadURL(url).catch(e => {
        if (!String(e).includes("ERR_ABORTED")) throw e;
        return landed;
    });
}

/** Waits for the embed player: true once its video has loaded, false if it shows an error. */
function embedPlays(page: BrowserWindow): Promise<boolean> {
    return page.webContents.executeJavaScript(`new Promise(resolve => {
        const started = Date.now();
        const t = setInterval(() => {
            const video = document.querySelector("video");
            const error = document.querySelector(".ytp-error, .ytp-embed-error");
            if (error || Date.now() - started > 10000) { clearInterval(t); resolve(false); }
            else if (video && video.readyState >= 1) { clearInterval(t); resolve(true); }
        }, 200);
    })`, true).catch(() => false);
}

export async function ytPlay(_: IpcMainInvokeEvent, link: string, opts: PlayOptions) {
    const id = videoId(String(link ?? ""));
    if (!id) throw new Error("That isn't a YouTube link.");
    ytStop();

    const ses = session.fromPartition(PARTITION);
    // the hidden window only needs the mic permission, to read device names
    ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === "media"));
    ses.setPermissionCheckHandler((_wc, permission) => permission === "media");

    win = new BrowserWindow({
        show: false,
        width: 960,
        height: 540,
        webPreferences: {
            partition: PARTITION,
            autoplayPolicy: "no-user-gesture-required",
            backgroundThrottling: false,
            sandbox: true,
            contextIsolation: true
        }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.on("closed", () => { win = null; });

    const page = win;
    // the ad blocker goes into every page this window loads, as early as it can
    page.webContents.on("dom-ready", () => {
        page.webContents.executeJavaScript(adguard).catch(() => { });
    });

    await load(page, `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&playsinline=1`);
    // some videos can't be embedded - use the normal page for those
    if (!await embedPlays(page)) await load(page, `https://www.youtube.com/watch?v=${id}`);
    if (page !== win || page.isDestroyed()) throw new Error("Stopped.");
    const safe = {
        volume: Math.max(0, Math.min(1.5, Number(opts?.volume) || 1)),
        hear: !!opts?.hear,
        headphones: typeof opts?.headphones === "string" ? opts.headphones.slice(0, 200) : ""
    };
    return await win.webContents.executeJavaScript(routeScript(safe), true) as string;
}

export function ytStop() {
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
}

async function inPage<T>(code: string): Promise<T | null> {
    if (!win || win.isDestroyed()) return null;
    return await win.webContents.executeJavaScript(`(() => { const o = window.__o2voice; if (!o) return null; ${code} })()`, true).catch(() => null);
}

export function ytPause(_: IpcMainInvokeEvent, paused: boolean) {
    return inPage(paused ? "o.video.pause(); return true;" : "o.video.play(); return true;");
}

export function ytSettings(_: IpcMainInvokeEvent, volume: number, hear: boolean) {
    const v = Math.max(0, Math.min(1.5, Number(volume) || 0));
    return inPage(`o.volume = ${v}; o.hear = ${!!hear}; o.apply(); return true;`);
}

export function ytStatus() {
    return inPage<{ time: number; duration: number; paused: boolean; ended: boolean; }>(
        "return { time: o.video.currentTime, duration: o.video.duration || 0, paused: o.video.paused, ended: o.video.ended };"
    );
}
