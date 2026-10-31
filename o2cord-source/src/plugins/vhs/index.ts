/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Discord as an old VHS tape: faded tape colours, red/blue colour fringing on
 * text, interlace lines, grain, a tracking band that rolls up now and then,
 * head-switching noise at the bottom edge, and the VCR's blue "PLAY" screen on
 * Discord's updater window and loading screen.
 *
 * Nothing here moves Discord's layout - no font, size, padding, border or
 * radius is touched, and nothing is drawn over Discord's boxes except the
 * see-through screen effects, so every box stays exactly where Discord puts it:
 *  - colours: Discord's colour variables are re-graded (like RetroTerminal's
 *    "ui" mode), so pictures keep their real colours;
 *  - colour fringing: one inherited text-shadow on #app-mount;
 *  - everything else: fixed, pointer-events:none layers on top that only
 *    animate transform/opacity, hide while a video plays, freeze while
 *    Discord isn't focused and stop for prefers-reduced-motion.
 * It all lives in two <style>s and one body child that are removed on stop.
 */

import { isPluginEnabled, plugins, stopPlugin } from "@api/PluginManager";
import { definePluginSettings, Settings, SettingsStore } from "@api/Settings";
import { Devs } from "@utils/constants";
import { localStorage } from "@utils/localStorage";
import { syncOwnerThemeClass } from "@utils/o2OwnerTheme";
import definePlugin, { makeRange, OptionType, StartAt } from "@utils/types";
import { onceReady } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import { BackgroundPictureSetting, getBackgroundUrl, loadBackground, onBackgroundChange, unloadBackground } from "./BackgroundPicture";

interface Grade {
    label: string;
    /** name on the o2cord Themes page */
    short: string;
    /** what the darkest colours lean towards */
    shadow: string;
    /** what the brightest colours lean towards */
    highlight: string;
    /** 0 = keep the colour, 1 = fully the shadow-highlight duotone */
    tone: number;
    /** how much colour is taken out first */
    desat: number;
    /** faded blacks, like a worn tape */
    lift: number;
}

export const GRADES: Record<string, Grade> = {
    tape: { label: "Home tape - warm, faded colours", short: "Home tape", shadow: "#22102a", highlight: "#fff2dc", tone: 0.42, desat: 0.3, lift: 0.06 },
    night: { label: "Night tape - deep blue with neon pink", short: "Night tape", shadow: "#0a1030", highlight: "#ffd8f1", tone: 0.5, desat: 0.25, lift: 0.04 },
    bluescreen: { label: "VCR blue screen", short: "Blue screen", shadow: "#0b1fae", highlight: "#f4f6ff", tone: 0.82, desat: 0.6, lift: 0 }
};

// The VCR's own blue, for the loading screen.
const VCR_BLUE = "#0b1fae";

const NOISE_TILE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const settings = definePluginSettings({
    grade: {
        type: OptionType.SELECT,
        description: "Tape colours. Pictures (avatars, server icons, images) always keep their real colours.",
        options: [
            ...Object.entries(GRADES).map(([value, g]) => ({ label: g.label, value, default: value === "tape" })),
            { label: "Discord's own colours (only the tape effects)", value: "off" }
        ]
    },
    colorBleed: {
        type: OptionType.SLIDER,
        description: "Colour fringing - the red and blue edges around text on a worn tape.",
        markers: makeRange(0, 10, 1),
        default: 4,
        stickToMarkers: false
    },
    scanlines: {
        type: OptionType.SLIDER,
        description: "Interlace lines across the screen.",
        markers: makeRange(0, 100, 10),
        default: 35,
        stickToMarkers: false
    },
    grain: {
        type: OptionType.SLIDER,
        description: "Tape grain over the screen.",
        markers: makeRange(0, 100, 10),
        default: 30,
        stickToMarkers: false
    },
    vignette: {
        type: OptionType.SLIDER,
        description: "Darker edges, like an old TV.",
        markers: makeRange(0, 100, 10),
        default: 40,
        stickToMarkers: false
    },
    backgroundPicture: {
        type: OptionType.COMPONENT,
        component: BackgroundPictureSetting
    },
    backgroundStrength: {
        type: OptionType.SLIDER,
        description: "How strongly the background picture shows through.",
        markers: makeRange(0, 100, 10),
        default: 30,
        stickToMarkers: false
    },
    backgroundBlend: {
        type: OptionType.SELECT,
        description: "How the background picture mixes with Discord.",
        options: [
            { label: "Glow - the picture lights up the dark parts, text stays bright", value: "screen", default: true },
            { label: "Fade - the picture laid over Discord, see-through", value: "normal" }
        ]
    },
    tracking: {
        type: OptionType.BOOLEAN,
        description: "Tracking noise - a band of static that rolls up the screen every few seconds, and the head-switching noise at the bottom edge.",
        default: true
    },
    pauseEffectsDuringVideo: {
        type: OptionType.BOOLEAN,
        description: "Hide the moving effects while a stream or video is playing - they are redrawn on every video frame and cost GPU.",
        default: true
    },
    pauseEffectsWhenUnfocused: {
        type: OptionType.BOOLEAN,
        description: "Freeze the moving effects while Discord isn't the active window (e.g. while you play).",
        default: true
    }
});

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

const hexToRgb = (hex: string) => [16, 8, 0].map(s => (parseInt(hex.slice(1), 16) >> s) & 255);

function getGrade(): Grade | null {
    const { grade } = settings.store;
    if (grade === "off") return null;
    return (grade && GRADES[grade]) || GRADES.tape;
}

/*
 * Every colour variable Discord defines, resolved once to rgba (a probe
 * element + a 1x1 canvas, which also understands Discord's oklab() and
 * color-mix() values). Same idea as RetroTerminal's "ui" mode: ~2,300
 * variables, ~250 ms once - so it runs when the browser is idle, not while
 * Discord is still starting.
 */
const VAR_SKIP = /^--(o2|vc-|profile|custom|user-profile|status|font|elevation|space|radius)/;
let harvested: [name: string, r: number, g: number, b: number, a: number][] = [];

function harvestColorVars() {
    const names = new Set<string>();
    const walk = (rules: CSSRuleList) => {
        for (const rule of rules as any) {
            if (rule.cssRules) walk(rule.cssRules);
            const st: CSSStyleDeclaration | undefined = rule.style;
            if (!st) continue;
            for (let i = 0; i < st.length; i++) if (st[i].startsWith("--")) names.add(st[i]);
        }
    };
    for (const sheet of document.styleSheets) {
        // our own overrides would feed back into the probe
        if ((sheet.ownerNode as Element | null)?.id === "o2-vhs-vars") continue;
        try { walk(sheet.cssRules); } catch { /* cross-origin sheet */ }
    }

    const themed = document.querySelector("[class*='layer_'][class*='theme-']") ?? document.documentElement;
    const host = document.createElement("div");
    host.className = [...themed.classList].filter(c => c.startsWith("theme-")).join(" ");
    host.style.cssText = "position:absolute;left:-9999px;top:0;color:rgb(1, 2, 3)";
    const probe = document.createElement("span");
    host.appendChild(probe);
    document.body.appendChild(host);

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const ownSheet = varsStyle?.sheet;
    if (ownSheet) ownSheet.disabled = true;

    const out: typeof harvested = [];
    for (const name of names) {
        if (VAR_SKIP.test(name)) continue;
        probe.style.color = `var(${name})`;
        const { color } = getComputedStyle(probe);
        if (!color || color === "rgb(1, 2, 3)") continue; // not a colour
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        out.push([name, r, g, b, a / 255]);
    }
    host.remove();
    if (ownSheet) ownSheet.disabled = false;
    harvested = out;
}

/** One colour through the tape grade: less colour, split-toned by brightness, faded blacks. */
export function gradeColor(r: number, g: number, b: number, grade: Grade): [number, number, number] {
    const c = [r / 255, g / 255, b / 255];
    const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const sh = hexToRgb(grade.shadow).map(v => v / 255), hi = hexToRgb(grade.highlight).map(v => v / 255);
    return c.map((v, i) => {
        const flat = v + (y - v) * grade.desat;
        const toned = flat + ((sh[i] * (1 - y) + hi[i] * y) - flat) * grade.tone;
        const lifted = grade.lift + toned * (1 - grade.lift);
        return Math.round(Math.min(1, Math.max(0, lifted)) * 255);
    }) as [number, number, number];
}

function buildVarsCss() {
    const grade = getGrade();
    if (!grade || !harvested.length) return "";
    const lines = harvested.map(([name, r, g, b, a]) => {
        const [R, G, B] = gradeColor(r, g, b, grade);
        return `    ${name}: rgba(${R}, ${G}, ${B}, ${+a.toFixed(3)}) !important;`;
    });
    return `:root, :root [class*="theme-"] {\n${lines.join("\n")}\n}`;
}

// Discord's loading screen (spinning logo + "Did you know").
const LOADER = "[class*=\"container_\"][class*=\"fixClipping_\"]:has(video[class*=\"spinner_\"])";

function vcrDate() {
    const d = new Date();
    const month = ["JAN.", "FEB.", "MAR.", "APR.", "MAY", "JUN.", "JUL.", "AUG.", "SEP.", "OCT.", "NOV.", "DEC."][d.getMonth()];
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${month} ${pad(d.getDate())} ${d.getFullYear()}   ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildCss() {
    const s = settings.store;
    const bleed = clamp(s.colorBleed, 0, 10, 4);
    const scan = clamp(s.scanlines, 0, 100, 35) / 100;
    const grain = clamp(s.grain, 0, 100, 30) / 100;
    const vignette = clamp(s.vignette, 0, 100, 40) / 100;
    const tracking = s.tracking !== false;
    const off = (0.3 + bleed * 0.18).toFixed(2);
    const fringe = (0.25 + bleed * 0.04).toFixed(3);
    const osdShadow = "-2px 0 rgba(255, 40, 90, 0.6), 2px 0 rgba(40, 210, 255, 0.6)";

    return `@import url("https://fonts.googleapis.com/css2?family=VT323&display=swap");

/* Colour fringing: red to the left, blue to the right. A shadow only - the
   text itself, and so every box around it, keeps its size and place. */
${bleed > 0 ? `#app-mount {
    text-shadow: -${off}px 0 rgba(255, 40, 90, ${fringe}), ${off}px 0 rgba(40, 210, 255, ${fringe});
}` : ""}

/* Discord's loading screen: the VCR's blue "PLAY" screen with the date. Logo
   and tip hidden; Discord's own "trouble connecting?" links stay. The PLAY
   and the date are only drawn here, on the empty loading screen, so they
   never sit over Discord's boxes - and nothing waits on this screen, it goes
   the moment Discord is ready. */
${LOADER} {
    background: radial-gradient(ellipse at 50% 45%, #1730d0 0%, ${VCR_BLUE} 60%, #06107a 100%) !important;
}

${LOADER} > [class*="content_"] {
    opacity: 0 !important;
}

${LOADER}::before,
${LOADER}::after {
    position: fixed;
    left: 52px;
    font-family: "VT323", Consolas, monospace;
    color: #fff;
    white-space: pre;
    text-shadow: ${osdShadow};
    pointer-events: none;
}

${LOADER}::before {
    content: "PLAY \\25BA";
    top: 40px;
    font-size: 44px;
}

${LOADER}::after {
    content: "${vcrDate()}";
    bottom: 36px;
    font-size: 34px;
}

/* The background picture: under the tape effects (so the lines, grain and
   tracking run over it too), over Discord, never catching clicks. */
#o2-vhs-bg {
    position: fixed;
    inset: 0;
    z-index: 2147483644;
    pointer-events: none;
    background: center / cover no-repeat;
    opacity: ${(clamp(s.backgroundStrength, 0, 100, 30) / 100 * (s.backgroundBlend === "normal" ? 0.6 : 1)).toFixed(3)};
    mix-blend-mode: ${s.backgroundBlend === "normal" ? "normal" : "screen"};
}

#o2-vhs-bg.o2-vhs-video {
    display: none;
}

#o2-vhs-fx {
    position: fixed;
    inset: 0;
    z-index: 2147483645;
    pointer-events: none;
    overflow: hidden;
}

#o2-vhs-fx > div {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

/* see refreshFxState(): the moving / blended layers cost GPU over a video and while unfocused */
#o2-vhs-fx.o2-vhs-video > .o2-vhs-grain,
#o2-vhs-fx.o2-vhs-video > .o2-vhs-track,
#o2-vhs-fx.o2-vhs-video > .o2-vhs-head {
    display: none;
}

#o2-vhs-fx.o2-vhs-unfocused > div {
    animation-play-state: paused !important;
}

.o2-vhs-scan {
    display: ${scan > 0 ? "block" : "none"};
    background: repeating-linear-gradient(to bottom,
        rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 2px,
        rgba(0, 0, 0, ${(scan * 0.45).toFixed(3)}) 3px, rgba(0, 0, 0, 0) 4px);
}

.o2-vhs-grain {
    display: ${grain > 0 ? "block" : "none"};
    background-image: ${NOISE_TILE};
    opacity: ${(grain * 0.55).toFixed(3)};
    mix-blend-mode: overlay;
}

/* A band of static rolling up the screen: 1.4s across, then gone for the rest of the 11s cycle. */
.o2-vhs-track {
    display: ${tracking ? "block" : "none"};
    top: auto !important;
    height: 7vh;
    opacity: 0;
    background:
        repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0) 0px, rgba(255, 255, 255, 0.10) 1px, rgba(255, 255, 255, 0) 3px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.10) 40%, rgba(255, 255, 255, 0.16) 55%, rgba(255, 255, 255, 0) 100%),
        ${NOISE_TILE};
    background-size: auto, auto, 160px 160px;
    mix-blend-mode: screen;
    animation: o2-vhs-track 11s linear infinite;
}

@keyframes o2-vhs-track {
    0% { transform: translateY(10vh); opacity: 0; }
    1% { opacity: 0.85; }
    13% { transform: translateY(-104vh); opacity: 0.85; }
    14%, 100% { transform: translateY(-104vh); opacity: 0; }
}

/* Head-switching noise: the torn strip along the bottom edge of every VHS picture. */
.o2-vhs-head {
    display: ${tracking ? "block" : "none"};
    top: auto !important;
    height: 6px;
    background:
        linear-gradient(to right, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.35) 12%, rgba(255, 255, 255, 0.05) 30%, rgba(255, 255, 255, 0.28) 64%, rgba(255, 255, 255, 0) 100%),
        ${NOISE_TILE};
    background-size: auto, 160px 160px;
    opacity: 0.55;
    mix-blend-mode: screen;
}

.o2-vhs-vignette {
    display: ${vignette > 0 ? "block" : "none"};
    background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) ${Math.round(70 - vignette * 25)}%, rgba(0, 0, 0, ${(0.2 + vignette * 0.55).toFixed(3)}) 100%);
}

@media (prefers-reduced-motion: reduce) {
    .o2-vhs-track { display: none; }
}`;
}

/*
 * Discord's small updater window ("Checking for updates...", 300x350) opens
 * before this renderer exists, so it's styled from the main process. That
 * part is RetroTerminal's native helper (it only puts a saved stylesheet into
 * that window) - the two themes never run together, so they share it. DOM of
 * that window: #splash > .splash-inner > img + .splash-text > .splash-status,
 * and while downloading .progress > .progress-bar > .complete.
 */
function splashCss() {
    const fringe = "-2px 0 rgba(255, 40, 90, 0.6), 2px 0 rgba(40, 210, 255, 0.6)";
    return `@import url("https://fonts.googleapis.com/css2?family=VT323&display=swap");

html, body { background: #06107a !important; }

#splash {
    position: fixed !important;
    inset: 0 !important;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 45%, #1730d0 0%, ${VCR_BLUE} 60%, #06107a 100%) !important;
    font-family: "VT323", Consolas, monospace !important;
}

/* interlace lines, darker edges, and the head-switching strip along the bottom */
#splash::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    background:
        linear-gradient(to top, rgba(255, 255, 255, 0.35) 0px, rgba(255, 255, 255, 0.08) 4px, rgba(255, 255, 255, 0) 5px),
        repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 2px, rgba(0, 0, 0, 0.22) 3px, rgba(0, 0, 0, 0) 4px),
        radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 60%, rgba(0, 0, 0, 0.45) 100%);
}

#splash::before {
    content: "PLAY \\25BA";
    position: absolute;
    top: 22px;
    left: 24px;
    font-size: 34px;
    line-height: 1;
    color: #fff;
    text-shadow: ${fringe};
    animation: o2-vhs-splash-play 1s steps(1) infinite;
}

@keyframes o2-vhs-splash-play {
    0%, 74% { opacity: 1; }
    75%, 100% { opacity: 0.35; }
}

.splash-inner img { display: none !important; }

/* the tape counter where Discord's logo was (not the date - this sheet is
   written during the previous session, so a clock would be stale) */
.splash-inner::before {
    content: "SP\\A 0:00:00";
    display: block;
    white-space: pre;
    font-size: 30px;
    line-height: 1.1;
    text-align: center;
    color: #fff;
    text-shadow: ${fringe};
    margin: 0 auto 24px;
}

/* Discord's own status text, in the corner like a VCR's on-screen display */
.splash-status {
    position: fixed !important;
    left: 24px;
    bottom: 26px;
    max-width: calc(100vw - 48px);
    text-align: left !important;
    font-family: "VT323", Consolas, monospace !important;
    font-size: 20px !important;
    line-height: 1.1 !important;
    text-transform: uppercase;
    color: #fff !important;
    text-shadow: ${fringe};
}

.progress {
    background: transparent !important;
    border: 2px solid #fff !important;
    border-radius: 0 !important;
}

.progress .progress-bar {
    background: transparent !important;
    border-radius: 0 !important;
}

.progress .complete {
    background: repeating-linear-gradient(90deg, #fff 0px, #fff 8px, rgba(255, 255, 255, 0) 8px, rgba(255, 255, 255, 0) 11px) !important;
    border-radius: 0 !important;
}

.splash-build-override {
    font-family: "VT323", Consolas, monospace !important;
    color: #fff !important;
}

@media (prefers-reduced-motion: reduce) {
    #splash::before { animation: none; }
}
`;
}

let splashTimer: ReturnType<typeof setTimeout> | undefined;

function pushSplashCss() {
    clearTimeout(splashTimer);
    // after RetroTerminal's own clear, if it was just switched off for this
    splashTimer = setTimeout(() => {
        void VencordNative.pluginHelpers.RetroTerminal?.setSplashCss(splashCss()).catch(() => { });
    }, 400);
}

function clearSplashCss() {
    clearTimeout(splashTimer);
    void VencordNative.pluginHelpers.RetroTerminal?.setSplashCss(null).catch(() => { });
}

let style: HTMLStyleElement | null = null;
let varsStyle: HTMLStyleElement | null = null;
let active = false;

function applyBackground() {
    const url = active ? getBackgroundUrl() : null;
    let bg = document.getElementById("o2-vhs-bg");
    if (!url) return void bg?.remove();
    if (!bg) {
        bg = document.createElement("div");
        bg.id = "o2-vhs-bg";
        bg.setAttribute("aria-hidden", "true");
        document.body.appendChild(bg);
    }
    bg.style.backgroundImage = `url("${url}")`;
    refreshFxState();
}

function addLayers() {
    if (document.getElementById("o2-vhs-fx")) return;
    const fx = document.createElement("div");
    fx.id = "o2-vhs-fx";
    fx.setAttribute("aria-hidden", "true");
    for (const cls of ["o2-vhs-scan", "o2-vhs-grain", "o2-vhs-track", "o2-vhs-head", "o2-vhs-vignette"]) {
        const layer = document.createElement("div");
        layer.className = cls;
        fx.appendChild(layer);
    }
    document.body.appendChild(fx);
}

// ---- keeping the effects cheap (same rules as RetroTerminal)
function videoPlaying(): boolean {
    for (const v of document.querySelectorAll("video")) {
        if (!v.paused && !v.ended && v.readyState > 2 && v.clientWidth >= 320 && v.clientHeight >= 180) return true;
    }
    return false;
}

function refreshFxState() {
    const fx = document.getElementById("o2-vhs-fx");
    if (!fx) return;
    const s = settings.store;
    const video = s.pauseEffectsDuringVideo !== false && videoPlaying();
    fx.classList.toggle("o2-vhs-video", video);
    // a picture over a stream would cover it, and re-blend every frame
    document.getElementById("o2-vhs-bg")?.classList.toggle("o2-vhs-video", video);
    fx.classList.toggle("o2-vhs-unfocused", s.pauseEffectsWhenUnfocused !== false && !document.hasFocus());
}

const MEDIA_EVENTS = ["playing", "pause", "ended", "emptied"];
let fxTimer: ReturnType<typeof setInterval> | undefined;

function watchFx() {
    if (fxTimer) return;
    // media events don't bubble, so listen in the capture phase
    for (const e of MEDIA_EVENTS) document.addEventListener(e, refreshFxState, true);
    window.addEventListener("focus", refreshFxState);
    window.addEventListener("blur", refreshFxState);
    // a stream can also just leave the screen (call closed) without an event
    fxTimer = setInterval(refreshFxState, 5000);
    refreshFxState();
}

function unwatchFx() {
    for (const e of MEDIA_EVENTS) document.removeEventListener(e, refreshFxState, true);
    window.removeEventListener("focus", refreshFxState);
    window.removeEventListener("blur", refreshFxState);
    clearInterval(fxTimer);
    fxTimer = undefined;
}

// The graded colours from last time, so Discord comes up in tape colours right
// away instead of flashing its own colours until the idle re-read below.
const VARS_CACHE_KEY = "o2cord-vhs-vars";

function readCachedVars() {
    try {
        const cached = JSON.parse(localStorage.getItem(VARS_CACHE_KEY) ?? "null");
        return cached?.grade === settings.store.grade && typeof cached.css === "string" ? cached.css as string : "";
    } catch {
        return "";
    }
}

function update() {
    if (!style || !varsStyle) return;
    style.textContent = buildCss();
    const vars = buildVarsCss();
    if (harvested.length) {
        varsStyle.textContent = vars;
        try { localStorage.setItem(VARS_CACHE_KEY, JSON.stringify({ grade: settings.store.grade, css: vars })); } catch { /* cache is optional */ }
    } else {
        varsStyle.textContent = getGrade() ? readCachedVars() : "";
    }
    refreshFxState();
}

// Reading the colours takes ~250 ms, so it waits for an idle moment instead of
// holding up Discord's first frames.
let idleHandle: number | undefined;
function regradeWhenIdle() {
    if (idleHandle != null || !active) return;
    idleHandle = requestIdleCallback(() => {
        idleHandle = undefined;
        if (!active || !getGrade()) return;
        harvestColorVars();
        update();
    }, { timeout: 1500 });
}

const SETTINGS_PREFIX = "plugins.VHS";
let regradeTimer: ReturnType<typeof setTimeout> | undefined;
let stopBackgroundWatch: (() => void) | undefined;

function onSettingsChange() {
    // a grade picked after "off" needs the colours read first
    if (getGrade() && !harvested.length) regradeWhenIdle();
    update();
}

function activate() {
    if (active) return;
    active = true;
    style = document.createElement("style");
    style.id = "o2-vhs";
    varsStyle = document.createElement("style");
    varsStyle.id = "o2-vhs-vars";
    document.head.append(style, varsStyle);
    harvested = [];
    update();
    addLayers();
    watchFx();
    stopBackgroundWatch = onBackgroundChange(applyBackground);
    pushSplashCss();
    void loadBackground();
    SettingsStore.addPrefixChangeListener(SETTINGS_PREFIX, onSettingsChange);
    // Discord adds some stylesheets a little after startup - read the colours once more then
    regradeTimer = setTimeout(regradeWhenIdle, 8000);
    // The owner glass theme switches itself off while this is on. Deferred:
    // the plugin manager flips `enabled` only after start()/stop() return.
    setTimeout(syncOwnerThemeClass, 0);
}

function deactivate() {
    if (!active) return;
    active = false;
    clearTimeout(regradeTimer);
    if (idleHandle != null) cancelIdleCallback(idleHandle);
    idleHandle = undefined;
    SettingsStore.removePrefixChangeListener(SETTINGS_PREFIX, onSettingsChange);
    unwatchFx();
    style?.remove();
    varsStyle?.remove();
    style = varsStyle = null;
    harvested = [];
    document.getElementById("o2-vhs-fx")?.remove();
    stopBackgroundWatch?.();
    stopBackgroundWatch = undefined;
    unloadBackground();
    // next launch's updater window goes back to Discord's own look
    clearSplashCss();
    document.getElementById("o2-vhs-bg")?.remove();
    setTimeout(syncOwnerThemeClass, 0);
}

function onConnectionOpen() {
    regradeWhenIdle();
}

/** RetroTerminal and VHS both own the whole screen - turning one on turns the other off. */
function turnOffRetroTerminal() {
    const retro = plugins.RetroTerminal;
    if (!retro || !isPluginEnabled("RetroTerminal")) return;
    if (retro.started) stopPlugin(retro);
    Settings.plugins.RetroTerminal.enabled = false;
}

let subscribed = false;

export default definePlugin({
    name: "VHS",
    description: "Turns Discord into an old VHS tape: faded tape colours, colour fringing, interlace lines, grain, tracking noise and a blue PLAY loading screen. Pictures keep their colours and nothing in Discord's layout moves. Turns RetroTerminal off - they don't mix.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    enabledByDefault: false,
    settings,

    // Early, so Discord's loading screen is already the blue PLAY screen. Only
    // the DOM is touched here; the colours and Flux wait for Discord to be ready.
    startAt: StartAt.DOMContentLoaded,

    start() {
        turnOffRetroTerminal();
        activate();
        void onceReady.then(() => {
            if (!active || subscribed) return;
            subscribed = true;
            FluxDispatcher.subscribe("CONNECTION_OPEN", onConnectionOpen);
            regradeWhenIdle();
        });
    },

    stop() {
        if (subscribed) FluxDispatcher.unsubscribe("CONNECTION_OPEN", onConnectionOpen);
        subscribed = false;
        deactivate();
    }
});
