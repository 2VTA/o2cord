/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * CRT look for all of Discord, after cool-retro-term
 * (github.com/Swordfish90/cool-retro-term). Profile colours and default
 * effect levels are taken from its built-in profiles
 * (app/qml/ApplicationSettings.qml).
 *
 * How it's drawn, and why, so it stays cheap:
 *  - Default "ui" colour mode recolours Discord's colour variables only, so
 *    pictures keep their colours (see harvestColorVars below).
 *  - "Everything" mode: #app-mount gets grayscale(); a fixed layer on top multiplies
 *    it by (phosphor - background), and a second one adds the background
 *    colour back with plus-lighter - so black -> background and white ->
 *    phosphor exactly. Both are GPU blend layers, no SVG filter, so
 *    scrolling doesn't re-rasterise anything.
 *  - Bloom is a text-shadow in currentColor, set once on #app-mount and
 *    inherited - no per-element rules.
 *  - Scanlines, noise, flicker, the rolling bright band and the dark curved
 *    corners are pointer-events:none layers; the moving ones only animate
 *    transform/opacity, and stop for prefers-reduced-motion.
 * Everything lives in one <style> and a few body children that are removed
 * again on stop - nothing is left behind.
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings, SettingsStore } from "@api/Settings";
import { Devs } from "@utils/constants";
import { syncOwnerThemeClass } from "@utils/o2OwnerTheme";
import definePlugin, { makeRange, OptionType, StartAt } from "@utils/types";
import { onceReady } from "@webpack";
import { FluxDispatcher, UserStore } from "@webpack/common";

import { BOOT_ART, O2_LOGO, O2CORD_LOGO } from "./bootArt";

// Private for now, at Ryder's request: only these accounts can see or use
// the theme. Everyone else gets nothing - the plugin is hidden from the
// Plugins list, o2Settings leaves it out of the Themes panel, and even if its
// `enabled` flag is set by hand, activate() never runs for them.
export const RETRO_USER_IDS: readonly string[] = [
    String(Devs.Ryder.id),
    "1542531988727140477", // @aloshsaudi
    "793236817893785601" // @abolbnh
];

// Turned on once automatically on first launch after the update ("publish
// the theme on this account"); after that their own panel choice sticks.
export const RETRO_AUTO_ENABLE_IDS: readonly string[] = [
    "1542531988727140477", // @aloshsaudi
    "793236817893785601" // @abolbnh
];

export function canUseRetro() {
    const id = UserStore?.getCurrentUser?.()?.id;
    return !!id && RETRO_USER_IDS.includes(id);
}

interface Profile { label: string; short: string; fg: string; bg: string; }

// Also used by o2Settings' quick panel. It shows `short` names, not bare
// colour dots: in monochrome every dot turns the same colour.
export const PROFILES: Record<string, Profile> = {
    amber: { label: "Default Amber", short: "Amber", fg: "#ff8100", bg: "#000000" },
    green: { label: "Monochrome Green", short: "Green", fg: "#0ccc68", bg: "#000000" },
    apple: { label: "Apple ][", short: "Apple ][", fg: "#4dff6b", bg: "#001100" },
    blue: { label: "Deep Blue", short: "Blue", fg: "#7fb4ff", bg: "#000000" },
    cyan: { label: "Neon Cyan", short: "Cyan", fg: "#52f7ff", bg: "#001018" },
    plasma: { label: "Plasma", short: "Plasma", fg: "#ff9bd6", bg: "#070014" },
    c64: { label: "Commodore 64", short: "C64", fg: "#a9a7ff", bg: "#3b3b8f" },
    vga: { label: "IBM VGA 8x16", short: "VGA", fg: "#c0c0c0", bg: "#000000" }
};

// hasBold: false for single-weight faces - Chromium would otherwise fake bold
// by smearing the glyphs, which made bold headings unreadable in VT323.
const FONTS: Record<string, { label: string; family: string | null; import: string | null; hasBold: boolean; }> = {
    vt323: { label: "VT323 (terminal)", family: "\"VT323\"", import: "VT323", hasBold: false },
    shareTech: { label: "Share Tech Mono", family: "\"Share Tech Mono\"", import: "Share+Tech+Mono", hasBold: false },
    plex: { label: "IBM Plex Mono", family: "\"IBM Plex Mono\"", import: "IBM+Plex+Mono:wght@400;600", hasBold: true },
    none: { label: "Discord's own font", family: null, import: null, hasBold: true }
};

// Discord's own stacks, kept after the retro font so anything it can't draw
// (Arabic, emoji, CJK...) falls back exactly as before.
const DISCORD_SANS = "\"gg sans\",\"Noto Sans\",\"Helvetica Neue\",Helvetica,Arial,sans-serif";
const DISCORD_MONO = "\"gg mono\",\"Source Code Pro\",Consolas,monospace";

const NOISE_TILE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const LAYER_IDS = ["o2-retro-fx", "o2-retro-tint", "o2-retro-lift"] as const;

const settings = definePluginSettings({
    profile: {
        type: OptionType.SELECT,
        description: "Colour profile (from cool-retro-term).",
        options: Object.entries(PROFILES).map(([value, p]) => ({ label: p.label, value, default: value === "amber" }))
    },
    colorMode: {
        type: OptionType.SELECT,
        description: "What gets the phosphor colour.",
        options: [
            { label: "Retro interface, real pictures (avatars, server icons, profiles, images keep their colours)", value: "ui", default: true },
            { label: "Everything in phosphor, pictures too", value: "all" },
            { label: "Discord's own colours (only the CRT effects)", value: "off" }
        ]
    },
    font: {
        type: OptionType.SELECT,
        description: "Font for all text. Arabic, emoji and anything else it can't draw keep Discord's own font.",
        options: Object.entries(FONTS).map(([value, f]) => ({ label: f.label, value, default: value === "vt323" }))
    },
    brightness: {
        type: OptionType.SLIDER,
        description: "Overall screen brightness.",
        markers: makeRange(70, 150, 10),
        default: 110,
        stickToMarkers: false
    },
    bloom: {
        type: OptionType.SLIDER,
        description: "Bloom - how much the text glows.",
        markers: makeRange(0, 10, 1),
        default: 6,
        stickToMarkers: false
    },
    scanlines: {
        type: OptionType.SLIDER,
        description: "Dark lines between the rows of the screen, like a real tube.",
        markers: makeRange(0, 100, 10),
        default: 30,
        stickToMarkers: false
    },
    staticNoise: {
        type: OptionType.SLIDER,
        description: "Moving grain over the screen, like analogue static.",
        markers: makeRange(0, 100, 10),
        default: 10,
        stickToMarkers: false
    },
    flickering: {
        type: OptionType.SLIDER,
        description: "Random small brightness dips, like an old monitor.",
        markers: makeRange(0, 100, 10),
        default: 10,
        stickToMarkers: false
    },
    curvature: {
        type: OptionType.SLIDER,
        description: "Screen curvature - darker, rounded edges like curved glass.",
        markers: makeRange(0, 100, 10),
        default: 20,
        stickToMarkers: false
    },
    glowingLine: {
        type: OptionType.BOOLEAN,
        description: "Glowing line - a faint bright band that slowly rolls down the screen.",
        default: true
    }
});

let style: HTMLStyleElement | null = null;
let varsStyle: HTMLStyleElement | null = null;

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

function hexToRgb(hex: string) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// Per-channel a - b, clamped at 0 (e.g. #a9a7ff - #3b3b8f = #6e6c70).
function subtractHex(a: string, b: string) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const ch = (shift: number) => Math.max(0, ((x >> shift) & 255) - ((y >> shift) & 255));
    return "#" + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, "0")).join("");
}

type ColorMode = "ui" | "all" | "off";

function getColorMode(): ColorMode {
    const m = settings.store.colorMode;
    return m === "all" || m === "off" ? m : "ui";
}

/*
 * "ui" mode: recolour Discord's own colour variables instead of the whole
 * screen, so pictures (avatars, server icons, profile images, attachments)
 * keep their real colours. Every custom property Discord defines is resolved
 * once to an actual colour (a probe element + a 1x1 canvas, which also
 * understands the oklab()/color-mix() values Discord uses), then each one is
 * mapped by brightness onto the same duotone as the full-screen mode:
 * black -> profile background, white -> phosphor. Measured live: ~2,300
 * colour variables, ~250 ms once; after that a profile/brightness change only
 * re-maps the cached list.
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
        // Our own overrides would feed back into the probe.
        if ((sheet.ownerNode as Element | null)?.id === "o2-retro-vars") continue;
        try { walk(sheet.cssRules); } catch { /* cross-origin sheet */ }
    }

    // Resolve inside the same theme classes Discord's layers use.
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

    // Our own overrides must be off while reading, or a re-harvest would read
    // back the already-recoloured values instead of Discord's.
    const ownSheet = varsStyle?.sheet;
    if (ownSheet) ownSheet.disabled = true;

    const out: typeof harvested = [];
    for (const name of names) {
        if (VAR_SKIP.test(name)) continue;
        probe.style.color = `var(${name})`;
        const { color } = getComputedStyle(probe);
        // Not a colour -> the probe inherits the host's sentinel.
        if (!color || color === "rgb(1, 2, 3)") continue;
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

function buildVarsCss() {
    if (getColorMode() !== "ui") return "";
    if (!harvested.length) harvestColorVars();

    const s = settings.store;
    const profile = PROFILES[s.profile] ?? PROFILES.amber;
    const bright = clamp(s.brightness, 70, 150, 110) / 100;
    const hex = (h: string) => [16, 8, 0].map(sh => (parseInt(h.slice(1), 16) >> sh) & 255);
    const fg = hex(profile.fg), bg = hex(profile.bg);
    // A light Discord theme would otherwise come out as a bright screen.
    const invert = !!document.querySelector("[class*='layer_'].theme-light");

    const lines = harvested.map(([name, r, g, b, a]) => {
        let y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (invert) y = 1 - y;
        y = Math.min(1, Math.max(0, ((y - 0.5) * 1.25 + 0.5) * bright));
        const c = fg.map((f, i) => Math.round(bg[i] + y * (f - bg[i])));
        return `    ${name}: rgba(${c[0]}, ${c[1]}, ${c[2]}, ${+a.toFixed(3)}) !important;`;
    });

    return `:root, :root [class*="theme-"] {\n${lines.join("\n")}\n}`;
}

/*
 * Discord's loading screen (spinning logo + "Did you know") becomes a
 * terminal boot, like cool-retro-term's: lines type out top-left one by one,
 * then a blinking block cursor after the prompt. Only the logo and the tip
 * are hidden - Discord's own "having trouble connecting?" links below stay.
 */
const LOADER = "[class*=\"container_\"][class*=\"fixClipping_\"]:has(video[class*=\"spinner_\"])";

// Seconds the boot text takes to type out, set by loaderCss(). The boot
// screen stays up at least that long plus BOOT_HOLD, so it can be seen even
// on a quick reload (Discord's own loading screen is gone after 1-3s).
let bootTypeSeconds = 3;
const BOOT_HOLD = 1.6;
const BOOT_MAX_MS = 15_000;

function loaderCss(profile: Profile, font: typeof FONTS[string], mode: ColorMode) {
    const version = typeof O2CORD_VERSION === "string" && O2CORD_VERSION ? " " + O2CORD_VERSION.replace(/-debug$/, "") : "";
    // Text lines type at 0.16s each; the rows of the O2CORD logo (top) and of
    // Ryder's picture (between the connect line and the prompt) scroll in at
    // 0.05s each.
    const text = (s: string) => ({ s, t: 0.16 });
    // Ryder's "O2CORD" logo comes first, then the text.
    const logo = (s: string) => ({ s, t: 0.05 });
    const lines = [
        ...O2CORD_LOGO.map(logo),
        text(""),
        text(`O2CORD BIOS${version}`),
        text("(C) o2cord. All rights reserved."),
        text(""),
        text("Memory test ........... 640K OK"),
        text("Loading DISCORD.EXE ...... OK"),
        text("Connecting to gateway ..."),
        text(""),
        ...BOOT_ART.map(s => ({ s, t: 0.05 })),
        text(""),
        text("C:\\\\>") // CSS "\\" = one backslash on screen
    ];
    const n = lines.length;
    const fg = hexToRgb(profile.fg);
    const family = font.family ? `${font.family}, Consolas, monospace` : "Consolas, monospace";

    // One keyframe per line, held with steps(1) between them, so each line
    // appears at its own pace.
    let elapsed = 0;
    const stops = lines.map(({ t }, i) => {
        elapsed += t;
        return { at: elapsed, height: `calc(${i + 1} * 1.35em)` };
    });
    bootTypeSeconds = elapsed;
    const typeTime = elapsed.toFixed(2);
    const keyframes = stops.map(k => `    ${(k.at / elapsed * 100).toFixed(3)}% { height: ${k.height}; }`).join("\n");

    // ~40 lines: shrink the font on short screens so the prompt stays in view.
    const fontSize = `min(24px, calc((100vh - 96px) / ${(n * 1.35).toFixed(2)}))`;
    // Under the CRT effect layers normally; in "everything" mode above the
    // tint layers too, or the already-coloured text would be tinted twice.
    const z = mode === "all" ? 2147483647 : 2147483600;

    return `
/* Discord's own loading screen: logo + tip hidden, same background, in case
   it outlives the boot screen on a slow connection. */
${LOADER} {
    background:
        radial-gradient(ellipse at 50% 45%, rgba(${fg}, 0.10) 0%, rgba(${fg}, 0.03) 45%, rgba(0, 0, 0, 0) 75%),
        ${profile.bg} !important;
}

${LOADER} > [class*="content_"] {
    opacity: 0 !important;
}

#o2-retro-boot {
    position: fixed;
    inset: 0;
    z-index: ${z};
    pointer-events: none;
    background:
        radial-gradient(ellipse at 50% 45%, rgba(${fg}, 0.10) 0%, rgba(${fg}, 0.03) 45%, rgba(0, 0, 0, 0) 75%),
        ${profile.bg};
    transition: opacity 0.45s ease;
}

#o2-retro-boot.o2-retro-boot-out {
    opacity: 0;
}

#o2-retro-boot::before,
#o2-retro-boot::after {
    position: absolute;
    font-family: ${family};
    font-size: ${fontSize};
    line-height: 1.35;
    color: ${profile.fg};
    text-shadow: 0 0 2px rgba(${fg}, 0.9), 0 0 10px rgba(${fg}, 0.55);
}

/* The boot text, revealed one line at a time. */
#o2-retro-boot::before {
    content: "${lines.map(l => l.s).join("\\A ")}";
    white-space: pre;
    top: 48px;
    left: 56px;
    overflow: hidden;
    height: 0;
    animation: o2-retro-boot ${typeTime}s steps(1, end) 0.1s forwards;
}

@keyframes o2-retro-boot {
    0% { height: 0; }
${keyframes}
}

/* Block cursor right after the "C:\\>" prompt on the last line. */
#o2-retro-boot::after {
    content: "";
    top: calc(48px + ${n - 1} * 1.35em + 0.15em);
    left: calc(56px + 4ch + 0.15ch);
    width: 0.62ch;
    height: 1.05em;
    background: ${profile.fg};
    box-shadow: 0 0 10px rgba(${fg}, 0.6);
    opacity: 0;
    animation: o2-retro-cursor 1.06s steps(1) ${(+typeTime + 0.1).toFixed(2)}s infinite;
}

@keyframes o2-retro-cursor {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
    #o2-retro-boot::before { animation: none; height: calc(${n} * 1.35em); }
    #o2-retro-boot::after { animation: none; opacity: 1; }
}`;
}

/*
 * Discord's small updater window (300x350, logo + "Checking for updates…")
 * opens before this renderer exists, so it's styled from the main process
 * (native.ts) using a stylesheet this side leaves in a file. DOM of that
 * window, read live: #splash > .splash-inner > img + .splash-text >
 * .splash-status, and while downloading .progress > .progress-bar > .complete.
 */
// Logo in the updater window. O2CORD_LOGO was tried here and moved to the big
// boot screen instead - at 300px wide it came out ~5px a character.
const SPLASH_LOGO: readonly string[] = O2_LOGO;

function splashCss(profile: Profile, font: typeof FONTS[string]) {
    const logoCols = Math.max(...SPLASH_LOGO.map(l => [...l].length));
    const fg = hexToRgb(profile.fg);
    const family = font.family ? `${font.family}, Consolas, monospace` : "Consolas, monospace";
    const version = typeof O2CORD_VERSION === "string" && O2CORD_VERSION ? " " + O2CORD_VERSION.replace(/-debug$/, "") : "";
    const glow = `0 0 2px rgba(${fg}, 0.9), 0 0 8px rgba(${fg}, 0.5)`;

    return `${font.import ? `@import url("https://fonts.googleapis.com/css2?family=${font.import}&display=swap");\n` : ""}
/* Ryder's reference: a curved CRT screen set into a darker bezel, prompt in
   the top-left corner, faintly lit phosphor glass. The window itself is the
   bezel; #splash becomes the screen inside it. */
html, body { background: #0a0806 !important; }

#splash {
    position: fixed !important;
    inset: 10px !important;
    border-radius: 18px;
    overflow: hidden;
    background:
        radial-gradient(ellipse at 50% 45%, rgba(${fg}, 0.13) 0%, rgba(${fg}, 0.05) 50%, rgba(${fg}, 0.02) 80%),
        ${profile.bg} !important;
    box-shadow:
        inset 0 0 28px rgba(0, 0, 0, 0.85),
        inset 0 0 2px rgba(${fg}, 0.25),
        0 0 0 1px rgba(255, 255, 255, 0.04);
    font-family: ${family} !important;
}

/* Scanlines, darker curved edges and a faint glass reflection. */
#splash::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    border-radius: inherit;
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 38%),
        repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0.3) 2px, rgba(0, 0, 0, 0) 3px),
        radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.55) 100%);
}

#splash::before {
    content: "O2CORD${version}";
    position: absolute;
    right: 16px;
    bottom: 12px;
    font-size: 11px;
    color: ${profile.fg};
    opacity: 0.45;
    text-shadow: ${glow};
}

/* The "o2" block logo instead of the Discord logo, scanning in top to
   bottom. Its backslashes are doubled for the CSS string. */
.splash-inner img { display: none !important; }

.splash-inner::before {
    content: "${SPLASH_LOGO.map(l => l.replaceAll("\\", "\\\\")).join("\\A ")}";
    display: block;
    white-space: pre;
    /* Fonts that all have the full-block and box-drawing glyphs at one width,
       so the letters line up - a retro font missing them would fall back
       per glyph and skew the rows. */
    font-family: "Cascadia Mono", Consolas, "Courier New", monospace !important;
    /* Sized to the logo's width so a wide one still fits the 300px window
       (~0.55em per character in these fonts, 22px screen padding a side). */
    font-size: min(19px, calc((100vw - 44px) / ${(logoCols * 0.55).toFixed(2)}));
    line-height: ${SPLASH_LOGO === O2_LOGO ? 1 : 1.15};
    color: ${profile.fg};
    text-shadow: 0 0 3px rgba(${fg}, 0.9), 0 0 12px rgba(${fg}, 0.5);
    margin: 0 auto 22px;
    animation: o2-splash-art 0.9s steps(${SPLASH_LOGO.length}, end) both;
}

@keyframes o2-splash-art {
    from { clip-path: inset(0 0 100% 0); }
    to { clip-path: inset(0 0 0 0); }
}

/* Discord's live status text as a "> " prompt in the top-left corner, with a
   big glowing block cursor like the reference. */
.splash-status {
    /* fixed, not absolute: .splash-text is itself positioned, so absolute
       landed under the logo instead of in the screen's corner. */
    position: fixed !important;
    top: 30px;
    left: 32px;
    max-width: calc(100vw - 64px);
    text-align: left !important;
    font-family: ${family} !important;
    font-size: 14px !important;
    line-height: 1.3 !important;
    color: ${profile.fg} !important;
    text-shadow: ${glow};
}

.splash-status::before { content: "> "; opacity: 0.9; }

.splash-status::after {
    content: "";
    display: inline-block;
    width: 0.62em;
    height: 1.15em;
    margin-left: 0.25em;
    vertical-align: -0.22em;
    border-radius: 2px;
    background: ${profile.fg};
    box-shadow: 0 0 8px rgba(${fg}, 0.85), 0 0 18px rgba(${fg}, 0.45);
    animation: o2-splash-cursor 1.06s steps(1) infinite;
}

@keyframes o2-splash-cursor {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
}

/* Download bar as a row of phosphor blocks. */
.progress {
    background: transparent !important;
    border: 1px solid rgba(${fg}, 0.7) !important;
    border-radius: 0 !important;
    box-shadow: 0 0 6px rgba(${fg}, 0.35);
}

.progress .progress-bar {
    background: transparent !important;
    border-radius: 0 !important;
}

.progress .complete {
    background: repeating-linear-gradient(90deg, ${profile.fg} 0px, ${profile.fg} 6px, rgba(0, 0, 0, 0) 6px, rgba(0, 0, 0, 0) 8px) !important;
    border-radius: 0 !important;
    box-shadow: 0 0 8px rgba(${fg}, 0.6);
}

.splash-build-override {
    font-family: ${family} !important;
    color: ${profile.fg} !important;
}

@media (prefers-reduced-motion: reduce) {
    .splash-inner::before, .splash-status::after { animation: none; }
}
`;
}

// Written on every settings change while active, so debounce slider drags.
let splashTimer: ReturnType<typeof setTimeout> | undefined;

function pushSplashCss() {
    clearTimeout(splashTimer);
    splashTimer = setTimeout(() => {
        const s = settings.store;
        const css = splashCss(PROFILES[s.profile] ?? PROFILES.amber, FONTS[s.font] ?? FONTS.vt323);
        void VencordNative.pluginHelpers.RetroTerminal?.setSplashCss(css).catch(() => { });
    }, 400);
}

function clearSplashCss() {
    clearTimeout(splashTimer);
    void VencordNative.pluginHelpers.RetroTerminal?.setSplashCss(null).catch(() => { });
}

// Boot screen: shown once per launch, only while Discord is still loading
// (turning the theme on later from the panel doesn't replay it). Leaves once
// it has typed out and held for BOOT_HOLD *and* Discord has finished loading
// - or after BOOT_MAX_MS, so Discord's "trouble connecting?" help can show.
let bootEl: HTMLElement | null = null;
let bootShown = false;
let bootTimer: ReturnType<typeof setInterval> | undefined;

function showBoot() {
    if (bootShown) return;
    bootShown = true;
    const stillLoading = !!document.querySelector(LOADER) || !UserStore?.getCurrentUser?.();
    if (!stillLoading) return;

    bootEl = document.createElement("div");
    bootEl.id = "o2-retro-boot";
    bootEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(bootEl);

    const started = performance.now();
    const minMs = (bootTypeSeconds + 0.1 + BOOT_HOLD) * 1000;
    bootTimer = setInterval(() => {
        const t = performance.now() - started;
        const loaded = !document.querySelector(LOADER) && !!UserStore?.getCurrentUser?.();
        if ((t >= minMs && loaded) || t > BOOT_MAX_MS) hideBoot(false);
    }, 150);
}

function hideBoot(instant: boolean) {
    clearInterval(bootTimer);
    const el = bootEl;
    bootEl = null;
    if (!el) return;
    if (instant) return el.remove();
    el.classList.add("o2-retro-boot-out");
    setTimeout(() => el.remove(), 500);
}

function buildCss() {
    const s = settings.store;
    const profile = PROFILES[s.profile] ?? PROFILES.amber;
    const font = FONTS[s.font] ?? FONTS.vt323;
    const mode = getColorMode();
    const mono = mode === "all";

    const bright = clamp(s.brightness, 70, 150, 110) / 100;
    const bloom = clamp(s.bloom, 0, 10, 6);
    const scan = clamp(s.scanlines, 0, 100, 30) / 100;
    const noise = clamp(s.staticNoise, 0, 100, 10) / 100;
    const flicker = clamp(s.flickering, 0, 100, 10) / 100;
    const curve = clamp(s.curvature, 0, 100, 20) / 100;

    // In monochrome the effect layers sit under the tint, so plain white is
    // turned into phosphor for free; with colours kept they need the phosphor
    // colour themselves.
    const fx = mono ? "255, 255, 255" : hexToRgb(profile.fg);

    // Exact duotone: out = bg + gray * (fg - bg), so black -> bg and white ->
    // fg. Multiply by (fg - bg), then add bg with plus-lighter. (A "screen"
    // lift added bg on top of the text too and washed out C64's text.)
    const hasBg = profile.bg.toLowerCase() !== "#000000";
    const tint = hasBg ? subtractHex(profile.fg, profile.bg) : profile.fg;

    const css: string[] = [];

    // @import has to come first in the sheet.
    if (font.import) css.push(`@import url("https://fonts.googleapis.com/css2?family=${font.import}&display=swap");`);

    if (font.family) {
        css.push(`
:root {
    --font-primary: ${font.family}, ${DISCORD_SANS} !important;
    --font-display: ${font.family}, ${DISCORD_SANS} !important;
    --font-headline: ${font.family}, ${DISCORD_SANS} !important;
    --font-code: ${font.family}, ${DISCORD_MONO} !important;
}
/* VT323 is a small face - match gg sans' x-height so sizes and line breaks
   stay where Discord's layout expects them. */
body { font-size-adjust: ex-height 0.53;${font.hasBold ? "" : " font-synthesis-weight: none;"} }`);
    }

    css.push(`
#app-mount {
    ${mono ? `filter: grayscale(1) contrast(1.25) brightness(${bright});` : mode === "off" && bright !== 1 ? `filter: brightness(${bright});` : ""}
    ${bloom > 0 ? `text-shadow: 0 0 ${(bloom * 0.35).toFixed(2)}px currentColor, 0 0 ${(bloom * 1.1).toFixed(2)}px currentColor;` : ""}
}

${mode !== "off" ? `
/* One-colour UI makes "on" (blurple) and "off" (gray) the same brightness, so
   switches stopped reading at a glance - dim the off state instead. Covers
   Vencord's switch and Discord's own (hidden input + indicator). */
.vc-switch-container:not(.vc-switch-checked),
[class*="container_"]:has(> [class*="hiddenVisually"] > input[type="checkbox"]:not(:checked)) > [class*="switchIndicator"] {
    filter: brightness(0.45);
}
` : ""}
${loaderCss(profile, font, mode)}

#o2-retro-fx, #o2-retro-tint, #o2-retro-lift {
    position: fixed;
    inset: 0;
    pointer-events: none;
}

#o2-retro-fx {
    z-index: 2147483645;
    overflow: hidden;
}

#o2-retro-tint {
    z-index: 2147483646;
    display: ${mono ? "block" : "none"};
    background: ${tint};
    mix-blend-mode: multiply;
}

#o2-retro-lift {
    z-index: 2147483647;
    display: ${mono && hasBg ? "block" : "none"};
    background: ${profile.bg};
    mix-blend-mode: plus-lighter;
}

#o2-retro-fx > div {
    position: absolute;
    inset: 0;
}

.o2-retro-scan {
    display: ${scan > 0 ? "block" : "none"};
    background: repeating-linear-gradient(to bottom,
        rgba(0, 0, 0, 0) 0px, rgba(0, 0, 0, 0) 1px,
        rgba(0, 0, 0, ${(scan * 0.7).toFixed(3)}) 2px, rgba(0, 0, 0, 0) 3px);
}

.o2-retro-noise {
    display: ${noise > 0 ? "block" : "none"};
    inset: -180px !important;
    background-image: ${NOISE_TILE};
    opacity: ${(noise * 0.55).toFixed(3)};
    mix-blend-mode: ${mono ? "screen" : "overlay"};
    animation: o2-retro-noise 0.5s steps(5) infinite;
}

@keyframes o2-retro-noise {
    0% { transform: translate(0, 0); }
    20% { transform: translate(-63px, 41px); }
    40% { transform: translate(52px, -77px); }
    60% { transform: translate(-29px, -48px); }
    80% { transform: translate(84px, 22px); }
    100% { transform: translate(0, 0); }
}

.o2-retro-flicker {
    display: ${flicker > 0 ? "block" : "none"};
    background: rgba(0, 0, 0, ${(flicker * 0.35).toFixed(3)});
    opacity: 0;
    animation: o2-retro-flicker 3.7s steps(1) infinite;
}

@keyframes o2-retro-flicker {
    0%, 100% { opacity: 0; }
    6% { opacity: 1; }
    7% { opacity: 0.2; }
    31% { opacity: 0.7; }
    32% { opacity: 0; }
    58% { opacity: 0.5; }
    59% { opacity: 0; }
    83% { opacity: 1; }
    84% { opacity: 0.3; }
    85% { opacity: 0; }
}

.o2-retro-line {
    display: ${s.glowingLine !== false ? "block" : "none"};
    bottom: auto !important;
    height: 22vh;
    background: linear-gradient(to bottom,
        rgba(${fx}, 0) 0%, rgba(${fx}, 0.045) 45%, rgba(${fx}, 0.07) 50%, rgba(${fx}, 0.045) 55%, rgba(${fx}, 0) 100%);
    transform: translateY(-30vh);
    animation: o2-retro-line 7s linear infinite;
}

@keyframes o2-retro-line {
    from { transform: translateY(-30vh); }
    to { transform: translateY(130vh); }
}

.o2-retro-curve {
    display: ${curve > 0 ? "block" : "none"};
    background: radial-gradient(ellipse at center,
        rgba(0, 0, 0, 0) ${Math.round(100 - curve * 45)}%, rgba(0, 0, 0, ${(0.25 + curve * 0.6).toFixed(3)}) 100%);
}

/* Rounded dark corners: the part outside a rounded rectangle is filled by
   its own spread shadow. */
.o2-retro-curve::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: ${Math.round(curve * 60)}px;
    box-shadow: 0 0 0 80px #000, inset 0 0 ${Math.round(20 + curve * 60)}px rgba(0, 0, 0, ${(curve * 0.8).toFixed(3)});
}

@media (prefers-reduced-motion: reduce) {
    .o2-retro-noise, .o2-retro-flicker, .o2-retro-line { animation: none !important; }
    .o2-retro-flicker, .o2-retro-line { display: none; }
}`);

    return css.join("\n");
}

function addLayers() {
    if (document.getElementById("o2-retro-fx")) return;

    const fx = document.createElement("div");
    fx.id = "o2-retro-fx";
    fx.setAttribute("aria-hidden", "true");
    for (const cls of ["o2-retro-scan", "o2-retro-noise", "o2-retro-flicker", "o2-retro-line", "o2-retro-curve"]) {
        const layer = document.createElement("div");
        layer.className = cls;
        fx.appendChild(layer);
    }

    const tint = document.createElement("div");
    tint.id = "o2-retro-tint";
    tint.setAttribute("aria-hidden", "true");

    const lift = document.createElement("div");
    lift.id = "o2-retro-lift";
    lift.setAttribute("aria-hidden", "true");

    // Order matters for blending: fx, then multiply, then screen on top.
    document.body.append(fx, tint, lift);
}

function removeLayers() {
    for (const id of LAYER_IDS) document.getElementById(id)?.remove();
}

function update() {
    if (!style || !varsStyle) return;
    style.textContent = buildCss();
    varsStyle.textContent = buildVarsCss();
    pushSplashCss();
}

let reharvestTimer: ReturnType<typeof setTimeout> | undefined;

// Settings can change from this plugin's own window or from o2Settings' quick
// panel - listen on the store itself so both apply immediately.
const SETTINGS_PREFIX = "plugins.RetroTerminal";

let active = false;

function activate() {
    if (active) return;
    active = true;
    style = document.createElement("style");
    style.id = "o2-retro-terminal";
    varsStyle = document.createElement("style");
    varsStyle.id = "o2-retro-vars";
    document.head.append(style, varsStyle);
    harvested = [];
    update();
    addLayers();
    showBoot();
    SettingsStore.addPrefixChangeListener(SETTINGS_PREFIX, update);
    // Discord loads some stylesheets a little after startup - read the
    // colours once more then so late-defined variables get recoloured too.
    reharvestTimer = setTimeout(() => {
        if (getColorMode() !== "ui") return;
        harvestColorVars();
        update();
    }, 8000);
    // The owner glass theme switches itself off while this is on. Deferred:
    // the plugin manager flips `enabled` only after start()/stop() return.
    setTimeout(syncOwnerThemeClass, 0);
}

function deactivate() {
    if (!active) return;
    active = false;
    clearTimeout(reharvestTimer);
    SettingsStore.removePrefixChangeListener(SETTINGS_PREFIX, update);
    style?.remove();
    varsStyle?.remove();
    style = varsStyle = null;
    harvested = [];
    hideBoot(true);
    // Next launch's updater window goes back to Discord's own look.
    clearSplashCss();
    removeLayers();
    setTimeout(syncOwnerThemeClass, 0);
}

// Re-checked on every login too, so switching to an account that isn't
// allowed drops the theme straight away.
// The loading screen shows before Discord knows who's logged in, so the
// account check alone would leave it untouched. Remember the last allowed
// account on this device and switch on straight away for it; CONNECTION_OPEN
// then confirms (or drops it if a different account logged in).
const LAST_USER_KEY = "o2cord.retro.lastAllowedUser";

function syncAccess() {
    const id = UserStore?.getCurrentUser?.()?.id;
    if (!id) return;
    if (RETRO_USER_IDS.includes(id)) {
        activate();
        void DataStore.set(LAST_USER_KEY, id);
    } else {
        deactivate();
        void DataStore.del(LAST_USER_KEY);
    }
}

let pluginRunning = false;
let subscribed = false;

function onConnectionOpen() {
    syncAccess();
    // Activated during the loading screen, some of Discord's stylesheets
    // weren't in yet - read the colours again now that the app is up.
    if (active && getColorMode() === "ui") {
        harvestColorVars();
        update();
    }
}

async function activateEarly() {
    if (UserStore?.getCurrentUser?.()) return syncAccess();
    const last = await DataStore.get<string>(LAST_USER_KEY).catch(() => undefined);
    // Still logged-out at this point -> trust the remembered account for the
    // loading screen; the real check follows on CONNECTION_OPEN.
    if (UserStore?.getCurrentUser?.()) return syncAccess();
    if (last && RETRO_USER_IDS.includes(last)) activate();
}

export default definePlugin({
    name: "RetroTerminal",
    description: "Turns Discord into an old CRT screen, after cool-retro-term: phosphor colours, glow, scanlines, static, flicker and a curved screen.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    enabledByDefault: false,
    // Not in the Plugins list for anyone; allowed users reach it from the
    // o2cord Settings panel (Themes -> Retro Terminal -> More settings).
    hidden: true,
    settings,

    syncAccess,

    // Before Discord's webpack is ready, so the theme (and the terminal boot
    // screen) are up while the loading screen shows - at WebpackReady that
    // screen was already on for ~3s before anything changed. Only the DOM is
    // touched here; Flux and the account check wait for onceReady.
    startAt: StartAt.DOMContentLoaded,

    start() {
        pluginRunning = true;
        void activateEarly();
        void onceReady.then(() => {
            if (!pluginRunning || subscribed) return;
            subscribed = true;
            FluxDispatcher.subscribe("CONNECTION_OPEN", onConnectionOpen);
            syncAccess();
        });
    },

    stop() {
        pluginRunning = false;
        if (subscribed) FluxDispatcher.unsubscribe("CONNECTION_OPEN", onConnectionOpen);
        subscribed = false;
        deactivate();
        setTimeout(syncOwnerThemeClass, 0);
    }
});
