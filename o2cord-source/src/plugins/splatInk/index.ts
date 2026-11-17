/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * SplatInk - Ryder's private ink theme: Discord in two bright ink colours
 * (pink and lime by default) on a deep night-blue, bubbly fonts, ink splats
 * soaked into the panels, a splash of ink where you click and when you send a
 * message, and two characters (pictures Ryder picks) standing in the chat, on
 * the loading screen and in Discord's updater window.
 *
 * Discord's boxes never move: colours come from Discord's colour variables,
 * the splats and characters are backgrounds BEHIND the panels' content, and
 * the click / send splashes are short-lived pointer-events:none drops that
 * fade out in under a second. The only size change is the font, on purpose.
 */

import { isPluginEnabled, plugins, stopPlugin } from "@api/PluginManager";
import { definePluginSettings, Settings, SettingsStore } from "@api/Settings";
import { Devs } from "@utils/constants";
import { localStorage } from "@utils/localStorage";
import { syncOwnerThemeClass } from "@utils/o2OwnerTheme";
import definePlugin, { makeRange, OptionType, StartAt } from "@utils/types";
import { onceReady } from "@webpack";
import { FluxDispatcher, UserStore } from "@webpack/common";

import { CharactersSetting, FontFileSetting, getAspect, getUrl, loadFiles, nextPictures, onFilesChange, smallDataUrl, unloadFiles } from "./Pictures";
import { logoUrl, splatUrl } from "./splat";

interface Ink {
    label: string;
    /** the main ink: buttons, mentions, the picked channel */
    a: string;
    /** the second ink: links and the other half of the splats */
    b: string;
    /** the deep night colour Discord's greys lean towards */
    base: string;
}

export const INKS: Record<string, Ink> = {
    sisters: { label: "Pink and lime (the Squid Sisters)", a: "#f22d9a", b: "#b6f01f", base: "#120c26" },
    orangeBlue: { label: "Orange and blue", a: "#ff6a10", b: "#3a63ff", base: "#0d0f26" },
    purpleYellow: { label: "Purple and yellow", a: "#9440ff", b: "#e6ff1f", base: "#100a20" },
    tealRed: { label: "Turquoise and red", a: "#14e0c4", b: "#ff3a5e", base: "#071a20" }
};

/*
 * SplatInk ships inside the normal update but is for two accounts only: Ryder's and Alosh's. Nobody else sees the
 * theme card, the plugin is hidden from the plugin list, and if it is ever switched on for another account it
 * turns itself off again as soon as Discord knows who is signed in.
 */
const ALLOWED_ACCOUNTS = new Set([String(Devs.Ryder.id), "1542531988727140477"]);
export const splatAllowed = () => ALLOWED_ACCOUNTS.has(String(UserStore.getCurrentUser()?.id));

const settings = definePluginSettings({
    ink: {
        type: OptionType.SELECT,
        description: "The two ink colours. Pictures, avatars and videos always keep their real colours.",
        options: [
            ...Object.entries(INKS).map(([value, ink]) => ({ label: ink.label, value, default: value === "sisters" })),
            { label: "Discord's own colours (only splats, fonts and characters)", value: "off" }
        ]
    },
    inkStrength: {
        type: OptionType.SLIDER,
        description: "How far Discord's greys are pulled into the night colour of the ink.",
        markers: makeRange(0, 100, 10),
        default: 75,
        stickToMarkers: false
    },
    font: {
        type: OptionType.SELECT,
        description: "Font. Ink: a round, bold font for text and a chunky one for headings.",
        options: [
            { label: "Ink (round text, chunky headings)", value: "ink", default: true },
            { label: "My font file (pick it below)", value: "custom" },
            { label: "Discord's own font", value: "discord" }
        ]
    },
    fontFile: {
        type: OptionType.COMPONENT,
        component: FontFileSetting
    },
    characters: {
        type: OptionType.COMPONENT,
        component: CharactersSetting
    },
    charactersInChat: {
        type: OptionType.BOOLEAN,
        description: "Show the two characters in the corners of the chat, behind the messages.",
        default: true
    },
    characterPlace: {
        type: OptionType.SELECT,
        description: "Where the two stand in the chat. Messages sit on the left, so the right side is the empty one.",
        options: [
            { label: "Side by side on the right", value: "right", default: true },
            { label: "One on each side", value: "sides" }
        ]
    },
    characterSize: {
        type: OptionType.SLIDER,
        description: "How tall the characters are in the chat (part of the chat's height).",
        markers: makeRange(20, 80, 10),
        default: 55,
        stickToMarkers: false
    },
    characterVisibility: {
        type: OptionType.SLIDER,
        description: "How clearly the characters (and splats) show behind the messages. Lower keeps text easier to read.",
        markers: makeRange(10, 100, 10),
        default: 45,
        stickToMarkers: false
    },
    pictureMinutes: {
        type: OptionType.SLIDER,
        description: "When a place has several pictures: minutes before the next one shows.",
        markers: [1, 2, 5, 10, 15, 30],
        default: 5,
        stickToMarkers: true
    },
    heads: {
        type: OptionType.BOOLEAN,
        description: "Show the heads: Callie at the bottom of the server list, Marie at the bottom of the member list.",
        default: true
    },
    headSize: {
        type: OptionType.SLIDER,
        description: "How big Marie's head in the member list is (pixels). Callie's, in the narrow server list, stops at 64.",
        markers: [40, 60, 80, 100, 120, 140, 160, 180],
        default: 100,
        stickToMarkers: false
    },
    togetherOnFriends: {
        type: OptionType.BOOLEAN,
        description: "Show \"the two together\" behind the friends list.",
        default: true
    },
    inkLogo: {
        type: OptionType.BOOLEAN,
        description: "Replace Discord's spinning logo on the loading screens with a spinning, squishing blob of ink.",
        default: true
    },
    charactersOnLoading: {
        type: OptionType.BOOLEAN,
        description: "Show the characters on Discord's loading screen and in the updater window.",
        default: true
    },
    splats: {
        type: OptionType.BOOLEAN,
        description: "Ink splats soaked into the server list, channel list, chat and member list.",
        default: true
    },
    clickInk: {
        type: OptionType.BOOLEAN,
        description: "A small splash of ink where you click. It fades away in half a second.",
        default: true
    },
    sendInk: {
        type: OptionType.BOOLEAN,
        description: "A burst of ink over the message box when you send a message.",
        default: true
    }
});

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

const hexToRgb = (hex: string) => [16, 8, 0].map(s => (parseInt(hex.slice(1), 16) >> s) & 255) as [number, number, number];

function getInk(): Ink | null {
    const { ink } = settings.store;
    if (ink === "off") return null;
    return (ink && INKS[ink]) || INKS.sisters;
}

/** The colours used for splats even when Discord keeps its own colours. */
const splatInk = () => getInk() ?? INKS.sisters;

// ---------------------------------------------------------------- colours

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const fn = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [fn(0), fn(8), fn(4)].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)) as [number, number, number];
}

/**
 * One Discord colour in ink: greys lean into the night colour (by strength),
 * Discord's blurple becomes the main ink, its link blue the second ink, and
 * everything else (green online dots, red warnings...) keeps its meaning.
 */
export function inkColor(r: number, g: number, b: number, ink: Ink, strength: number): [number, number, number] {
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.22) {
        const [bh] = rgbToHsl(...hexToRgb(ink.base));
        // dark greys are lifted a little so they read as night-blue instead of black
        const sat = l < 0.5 ? 0.5 : 0.22;
        const t = hslToRgb(bh, sat, l < 0.3 ? l + 0.045 * (1 - l / 0.3) + 0.02 : l);
        return [0, 1, 2].map(i => Math.round([r, g, b][i] + (t[i] - [r, g, b][i]) * strength)) as [number, number, number];
    }
    if (h >= 190 && h < 265) {
        const target = h < 215 ? ink.b : ink.a;
        const [th, ts, tl] = rgbToHsl(...hexToRgb(target));
        return hslToRgb(th, ts, Math.min(0.92, Math.max(0.12, tl + (l - 0.6) * 0.8)));
    }
    return [r, g, b];
}

/*
 * Every colour variable Discord defines, resolved once to rgba (a probe element
 * and a 1x1 canvas, which also understands oklab() and color-mix()). ~250 ms,
 * so it runs when the browser is idle.
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
        if ((sheet.ownerNode as Element | null)?.id === "o2-ink-vars") continue;
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
    const ink = getInk();
    if (!ink || !harvested.length) return "";
    const strength = clamp(settings.store.inkStrength, 0, 100, 75) / 100;
    const lines = harvested.map(([name, r, g, b, a]) => {
        const [R, G, B] = inkColor(r, g, b, ink, strength);
        return `    ${name}: rgba(${R}, ${G}, ${B}, ${+a.toFixed(3)}) !important;`;
    });
    return `:root, :root [class*="theme-"] {\n${lines.join("\n")}\n}`;
}

// ---------------------------------------------------------------- the stylesheet

// Discord's loading screen (spinning logo + "Did you know").
const LOADER = "[class*=\"container_\"][class*=\"fixClipping_\"]:has(video[class*=\"spinner_\"])";
const FONT_IMPORT = "@import url(\"https://fonts.googleapis.com/css2?family=Lilita+One&family=Rubik:wght@400;500;600;700&display=swap\");";
const INK_TEXT = "\"Rubik\", \"gg sans\", \"Noto Sans\", sans-serif";
const INK_HEAD = "\"Lilita One\", \"Rubik\", \"gg sans\", sans-serif";

function fontCss() {
    const choice = settings.store.font ?? "ink";
    const file = getUrl("font");
    if (choice === "custom" && file) {
        return `@font-face { font-family: "o2-ink-font"; src: url("${file}"); font-display: swap; }
:root, :root [class*="theme-"] {
    --font-primary: "o2-ink-font", ${INK_TEXT} !important;
    --font-display: "o2-ink-font", ${INK_HEAD} !important;
    --font-headline: "o2-ink-font", ${INK_HEAD} !important;
}`;
    }
    if (choice === "discord") return "";
    return `:root, :root [class*="theme-"] {
    --font-primary: ${INK_TEXT} !important;
    --font-display: ${INK_HEAD} !important;
    --font-headline: ${INK_HEAD} !important;
}`;
}

const rgba = (hex: string, a: number) => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** A background layer: picture, where it sits, how big it is. */
type Layer = [image: string, position: string, size: string];

/** One panel's background layers (Discord's own background colour stays underneath). */
function panelCss(selector: string, layers: Layer[]) {
    if (!layers.length) return "";
    return `${selector} {
    background-image: ${layers.map(l => l[0]).join(", ")} !important;
    background-position: ${layers.map(l => l[1]).join(", ")} !important;
    background-size: ${layers.map(l => l[2]).join(", ")} !important;
    background-repeat: ${layers.map(() => "no-repeat").join(", ")} !important;
}`;
}

function buildCss() {
    const s = settings.store;
    const ink = splatInk();
    const showSplats = s.splats !== false;
    const left = getUrl("left"), right = getUrl("right");
    const inChat = s.charactersInChat !== false && (left || right);
    const onLoading = s.charactersOnLoading !== false;
    const size = clamp(s.characterSize, 20, 80, 55);
    const veil = rgba(ink.base, +(1 - clamp(s.characterVisibility, 10, 100, 45) / 100).toFixed(3));
    const loadingPic = onLoading ? getUrl("loading") : null;

    // the chat's background layers: veil on top, then characters, then splats
    const chatLayers: string[] = [];
    if (inChat || showSplats) chatLayers.push(`linear-gradient(${veil}, ${veil}) 0 0 / 100% 100% no-repeat`);
    if (inChat && (s.characterPlace ?? "right") === "right") {
        // right picture in the corner, the left one just beside it, overlapping a little;
        // their height is a share of the chat's height (the window minus the bars around the chat)
        const h = `((100vh - 170px) * ${size / 100})`;
        if (right) chatLayers.push(`url("${right}") right 10px bottom 64px / auto ${size}% no-repeat`);
        if (left) chatLayers.push(`url("${left}") right calc(10px + ${right ? `${h} * ${(getAspect("right") * 0.78).toFixed(3)}` : "0px"}) bottom 64px / auto ${size}% no-repeat`);
    } else if (inChat) {
        if (left) chatLayers.push(`url("${left}") left 6px bottom 64px / auto ${size}% no-repeat`);
        if (right) chatLayers.push(`url("${right}") right 6px bottom 64px / auto ${size}% no-repeat`);
    }
    if (showSplats) {
        chatLayers.push(`${splatUrl(ink.b, 11, 0.55)} right -60px top -50px / 300px 300px no-repeat`);
        chatLayers.push(`${splatUrl(ink.a, 23, 0.5)} left 38% bottom 30px / 260px 260px no-repeat`);
    }

    // heads have see-through backgrounds, so they sit straight on the panel (no box around them)
    const head = clamp(s.headSize, 40, 180, 100);
    const headL = s.heads !== false ? getUrl("headLeft") : null;
    const headR = s.heads !== false ? getUrl("headRight") : null;
    const together = s.togetherOnFriends !== false ? getUrl("together") : null;

    const veilOf = (c: string): string => `linear-gradient(${c}, ${c})`;

    const guildLayers: Layer[] = [];
    // the account panel at the bottom-left reaches over the end of the server list, so the head sits above it
    if (headL) guildLayers.push([`url("${headL}")`, "center bottom 104px", `${Math.min(head, 64)}px auto`]);
    if (showSplats) guildLayers.push([splatUrl(ink.a, 5, 0.35), "center bottom -40px", "150px 150px"]);

    const sidebarLayers: Layer[] = [];
    if (showSplats) sidebarLayers.push([splatUrl(ink.b, 37, 0.22), "right -70px top 40%", "220px 220px"], [splatUrl(ink.a, 41, 0.2), "left -60px bottom 40px", "180px 180px"]);

    const memberLayers: Layer[] = [];
    // a little above the bottom edge, so the whole head shows
    if (headR) memberLayers.push([`url("${headR}")`, "right 8px bottom 36px", `auto ${head}px`]);
    if (showSplats) memberLayers.push([splatUrl(ink.b, 53, 0.28), "right -50px bottom -30px", "240px 240px"], [splatUrl(ink.a, 59, 0.22), "left -70px top 30%", "190px 190px"]);

    const friendsLayers: Layer[] = [];
    if (together) friendsLayers.push([veilOf(veil), "0 0", "100% 100%"], [`url("${together}")`, "right 20px bottom 10px", "auto 52%"]);

    return `${FONT_IMPORT}

${fontCss()}

/* ---- ink in the corners of the chat: behind the messages, under a veil so text stays readable */
${chatLayers.length ? `[class*="chatContent_"] {
    background: ${chatLayers.join(",\n        ")}, var(--background-base-lower, var(--background-primary)) !important;
}` : ""}

/* ---- ink soaked into the other panels, and the heads peeking out of them */
${panelCss("nav[class*=\"guilds_\"]", guildLayers)}

/* the channel list only - its neighbour nav in the same sidebar is the server list */
${panelCss("[class*=\"sidebarList_\"]", sidebarLayers)}

/* the member list paints its own background, so its layers go on it (they stay put while it scrolls) */
${panelCss("div[class*=\"members_\"][class*=\"scrollerBase_\"]", memberLayers)}

/* each member row paints the list colour over the head - let it through (hover still shows Discord's highlight) */
${headR ? `div[class*="members_"] div[class*="member_"][class*="container_"]:not(:hover) {
    background-color: transparent !important;
}` : ""}

/* the friends list: the two together in the corner */
${panelCss("[class*=\"peopleColumn_\"]", friendsLayers)}

/* ---- ink accents */
::selection {
    background: ${rgba(ink.a, 0.75)};
    color: #fff;
}

[class*="scroller"]::-webkit-scrollbar-thumb,
[class*="thin_"]::-webkit-scrollbar-thumb,
[class*="auto_"]::-webkit-scrollbar-thumb {
    background-color: ${rgba(ink.a, 0.55)} !important;
    border-radius: 8px !important;
}

/* ---- Discord's loading screen: deep night, big splats, the loading picture in the middle (or the two
   characters at the sides), and the ink logo in place of Discord's spinner */
${LOADER} {
    background:
        ${loadingPic ? `url("${loadingPic}") center top 9% / auto 46vh no-repeat,` : ""}
        ${!loadingPic && onLoading && left ? `url("${left}") left 3% bottom 0 / auto 62% no-repeat,` : ""}
        ${!loadingPic && onLoading && right ? `url("${right}") right 3% bottom 0 / auto 62% no-repeat,` : ""}
        ${splatUrl(ink.a, 71, 0.95)} left -8% top -12% / 46vmin 46vmin no-repeat,
        ${splatUrl(ink.b, 79, 0.95)} right -6% top 18% / 38vmin 38vmin no-repeat,
        ${splatUrl(ink.a, 83, 0.5)} 52% 135% / 30vmin 30vmin no-repeat,
        radial-gradient(ellipse at 50% 40%, ${rgba(ink.base, 0.6)} 0%, ${ink.base} 70%) !important;
}

/* the logo and the tip move down under the picture (only on this screen, nothing else is there) */
${loadingPic ? `${LOADER} > [class*="content_"] {
    transform: translateY(17vh);
}` : ""}

/* The spinner's own video is pushed out of its box (so its frames aren't drawn) and the ink logo is its
   background - only the spinner turns, the "Did you know" text under it stays still. */
${s.inkLogo !== false ? `${LOADER} video[class*="spinner_"] {
    object-fit: none !important;
    object-position: -99999px -99999px !important;
    background: ${logoUrl(ink.a, ink.b)} center / contain no-repeat !important;
    animation: o2-ink-logo 2.4s ease-in-out infinite;
}` : ""}

@keyframes o2-ink-logo {
    0% { transform: rotate(0deg) scale(1, 1); }
    25% { transform: rotate(90deg) scale(1.1, 0.9); }
    50% { transform: rotate(180deg) scale(0.92, 1.08); }
    75% { transform: rotate(270deg) scale(1.08, 0.94); }
    100% { transform: rotate(360deg) scale(1, 1); }
}

@media (prefers-reduced-motion: reduce) {
    ${LOADER} video[class*="spinner_"] { animation: none; }
}

${LOADER} [class*="text_"],
${LOADER} [class*="title_"] {
    font-family: ${INK_HEAD} !important;
}

/* ---- the click / send splashes */
#o2-ink-fx {
    position: fixed;
    inset: 0;
    z-index: 2147483645;
    pointer-events: none;
    overflow: hidden;
}

#o2-ink-fx > i {
    position: absolute;
    display: block;
    pointer-events: none;
    background-size: 100% 100%;
    animation: o2-ink-pop var(--o2-ink-time, 0.55s) cubic-bezier(.2, .9, .3, 1.2) forwards;
}

@keyframes o2-ink-pop {
    0% { transform: scale(0.25) rotate(var(--o2-ink-rot, 0deg)); opacity: 0.95; }
    35% { transform: scale(1) rotate(var(--o2-ink-rot, 0deg)); opacity: 0.9; }
    100% { transform: scale(1.08) rotate(var(--o2-ink-rot, 0deg)); opacity: 0; }
}`;
}

// ---------------------------------------------------------------- updater window

/*
 * Discord's small updater window opens before this renderer exists, so it's
 * styled from the main process by RetroTerminal's native helper (it only puts a
 * saved stylesheet into that window; the screen themes never run together, so
 * they share it). DOM: #splash > .splash-inner > img + .splash-text > .splash-status.
 */
async function splashCss() {
    const ink = splatInk();
    const show = settings.store.charactersOnLoading !== false;
    const middle = show ? await smallDataUrl("loading", 300) : null;
    const [left, right] = show && !middle ? await Promise.all([smallDataUrl("left", 170), smallDataUrl("right", 170)]) : [null, null];
    const logo = settings.store.inkLogo !== false;
    return `${FONT_IMPORT}

html, body { background: ${ink.base} !important; }

#splash {
    position: fixed !important;
    inset: 0 !important;
    overflow: hidden;
    background:
        ${middle ? `url("${middle}") center top 14px / 86% auto no-repeat,` : ""}
        ${left ? `url("${left}") left -6px bottom -4px / auto 46% no-repeat,` : ""}
        ${right ? `url("${right}") right -6px bottom -4px / auto 46% no-repeat,` : ""}
        ${splatUrl(ink.a, 71, 0.95)} left -70px top -60px / 220px 220px no-repeat,
        ${splatUrl(ink.b, 79, 0.95)} right -80px top 40px / 200px 200px no-repeat,
        radial-gradient(ellipse at 50% 40%, ${rgba(ink.base, 0.7)} 0%, ${ink.base} 75%) !important;
    font-family: ${INK_HEAD} !important;
}

${logo ? `/* the ink logo in place of Discord's */
.splash-inner img { display: none !important; }

.splash-inner::before {
    content: "";
    display: block;
    width: 64px;
    height: 64px;
    margin: 0 auto 10px;
    background: ${logoUrl(ink.a, ink.b)} center / contain no-repeat;
    animation: o2-ink-logo 2.4s ease-in-out infinite;
}

@keyframes o2-ink-logo {
    0% { transform: rotate(0deg) scale(1, 1); }
    25% { transform: rotate(90deg) scale(1.1, 0.9); }
    50% { transform: rotate(180deg) scale(0.92, 1.08); }
    75% { transform: rotate(270deg) scale(1.08, 0.94); }
    100% { transform: rotate(360deg) scale(1, 1); }
}` : ""}

${middle ? `/* the logo and the text sit under the picture */
.splash-inner { margin-top: 150px !important; }` : ""}

.splash-status {
    font-family: ${INK_HEAD} !important;
    font-size: 17px !important;
    letter-spacing: 0.02em;
    color: #fff !important;
    text-shadow: 2px 2px 0 ${ink.a};
}

.progress {
    background: ${rgba("#ffffff", 0.12)} !important;
    border-radius: 99px !important;
}

.progress .progress-bar,
.progress .complete {
    border-radius: 99px !important;
}

.progress .complete {
    background: linear-gradient(90deg, ${ink.a}, ${ink.b}) !important;
}

.splash-build-override {
    font-family: ${INK_TEXT} !important;
    color: ${ink.b} !important;
}
`;
}

let splashTimer: ReturnType<typeof setTimeout> | undefined;

function pushSplashCss() {
    clearTimeout(splashTimer);
    // after RetroTerminal's / VHS's own clear, if one was just switched off for this
    splashTimer = setTimeout(async () => {
        if (!active) return;
        const css = await splashCss();
        if (!active) return;
        void VencordNative.pluginHelpers.RetroTerminal?.setSplashCss(css).catch(() => { });
    }, 600);
}

function clearSplashCss() {
    clearTimeout(splashTimer);
    void VencordNative.pluginHelpers.RetroTerminal?.setSplashCss(null).catch(() => { });
}

// ---------------------------------------------------------------- click / send splashes

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let fx: HTMLElement | null = null;
const dropCache = new Map<string, string>();

function dropUrl(color: string, seed: number) {
    const key = color + seed;
    let url = dropCache.get(key);
    if (!url) dropCache.set(key, url = splatUrl(color, seed, 0.95));
    return url;
}

let flip = false;
function splash(x: number, y: number, size: number, time = 0.55) {
    if (!fx || reducedMotion()) return;
    const ink = splatInk();
    flip = !flip;
    const drop = document.createElement("i");
    drop.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;`
        + `background-image:${dropUrl(flip ? ink.a : ink.b, 100 + Math.floor(Math.random() * 8))};`
        + `--o2-ink-rot:${Math.floor(Math.random() * 360)}deg;--o2-ink-time:${time}s`;
    const done = () => drop.remove();
    drop.addEventListener("animationend", done, { once: true });
    setTimeout(done, time * 1000 + 300);
    fx.appendChild(drop);
}

let lastClick = 0;
function onPointerDown(e: PointerEvent) {
    if (settings.store.clickInk === false || e.button !== 0) return;
    const now = performance.now();
    if (now - lastClick < 70) return;
    lastClick = now;
    splash(e.clientX, e.clientY, 44 + Math.random() * 16);
}

function onMessageCreate(action: any) {
    if (settings.store.sendInk === false || !action?.optimistic) return;
    const me = UserStore.getCurrentUser()?.id;
    if (!me || action.message?.author?.id !== me) return;
    const box = document.querySelector("[class*='channelTextArea_']")?.getBoundingClientRect();
    if (!box || !box.width) return;
    for (let i = 0; i < 5; i++) {
        setTimeout(() => splash(
            box.left + 30 + Math.random() * Math.max(0, box.width - 60),
            box.top + box.height / 2 + (Math.random() - 0.5) * box.height,
            70 + Math.random() * 60,
            0.9
        ), i * 60);
    }
}

// ---------------------------------------------------------------- lifecycle

let style: HTMLStyleElement | null = null;
let varsStyle: HTMLStyleElement | null = null;
let active = false;

const VARS_CACHE_KEY = "o2cord-splatink-vars";

function readCachedVars() {
    try {
        const cached = JSON.parse(localStorage.getItem(VARS_CACHE_KEY) ?? "null");
        return cached?.ink === settings.store.ink && cached.strength === settings.store.inkStrength && typeof cached.css === "string" ? cached.css as string : "";
    } catch {
        return "";
    }
}

function update() {
    if (!style || !varsStyle) return;
    style.textContent = buildCss();
    if (harvested.length) {
        const vars = buildVarsCss();
        varsStyle.textContent = vars;
        try { localStorage.setItem(VARS_CACHE_KEY, JSON.stringify({ ink: settings.store.ink, strength: settings.store.inkStrength, css: vars })); } catch { /* optional */ }
    } else {
        varsStyle.textContent = getInk() ? readCachedVars() : "";
    }
}

let idleHandle: number | undefined;
function reinkWhenIdle() {
    if (idleHandle != null || !active) return;
    idleHandle = requestIdleCallback(() => {
        idleHandle = undefined;
        if (!active || !getInk()) return;
        harvestColorVars();
        update();
    }, { timeout: 1500 });
}

const SETTINGS_PREFIX = "plugins.SplatInk";
let reinkTimer: ReturnType<typeof setTimeout> | undefined;
let stopFilesWatch: (() => void) | undefined;

// albums with several pictures move on every few minutes
let pictureTimer: ReturnType<typeof setInterval> | undefined;
let pictureMinutes = 0;
function startPictureTimer() {
    const minutes = clamp(settings.store.pictureMinutes, 1, 30, 5);
    if (pictureTimer && minutes === pictureMinutes) return;
    clearInterval(pictureTimer);
    pictureMinutes = minutes;
    pictureTimer = setInterval(() => {
        // a hidden window doesn't need new pictures; the next look will get them
        if (active && !document.hidden) nextPictures();
    }, minutes * 60_000);
}

function onSettingsChange() {
    startPictureTimer();
    if (getInk() && !harvested.length) reinkWhenIdle();
    update();
    pushSplashCss();
}

function onFilesChanged() {
    update();
    pushSplashCss();
}

function activate() {
    if (active) return;
    active = true;
    style = document.createElement("style");
    style.id = "o2-ink";
    varsStyle = document.createElement("style");
    varsStyle.id = "o2-ink-vars";
    document.head.append(style, varsStyle);
    harvested = [];
    update();

    fx = document.createElement("div");
    fx.id = "o2-ink-fx";
    fx.setAttribute("aria-hidden", "true");
    document.body.appendChild(fx);
    document.addEventListener("pointerdown", onPointerDown, true);

    stopFilesWatch = onFilesChange(onFilesChanged);
    void loadFiles().then(() => pushSplashCss());
    SettingsStore.addPrefixChangeListener(SETTINGS_PREFIX, onSettingsChange);
    // Discord adds some stylesheets a little after startup - read the colours once more then
    reinkTimer = setTimeout(reinkWhenIdle, 8000);
    startPictureTimer();
    setTimeout(syncOwnerThemeClass, 0);
}

function deactivate() {
    if (!active) return;
    active = false;
    clearTimeout(reinkTimer);
    clearInterval(pictureTimer);
    pictureTimer = undefined;
    if (idleHandle != null) cancelIdleCallback(idleHandle);
    idleHandle = undefined;
    SettingsStore.removePrefixChangeListener(SETTINGS_PREFIX, onSettingsChange);
    document.removeEventListener("pointerdown", onPointerDown, true);
    style?.remove();
    varsStyle?.remove();
    fx?.remove();
    style = varsStyle = fx = null;
    harvested = [];
    stopFilesWatch?.();
    stopFilesWatch = undefined;
    unloadFiles();
    clearSplashCss();
    setTimeout(syncOwnerThemeClass, 0);
}

/** RetroTerminal, VHS and SplatInk each own the whole screen - turning one on turns the others off. */
function turnOffOtherScreenThemes() {
    for (const name of ["RetroTerminal", "VHS"]) {
        const p = plugins[name];
        if (!p || !isPluginEnabled(name)) continue;
        if (p.started) stopPlugin(p);
        Settings.plugins[name].enabled = false;
    }
}

let subscribed = false;

export default definePlugin({
    name: "SplatInk",
    description: "The Squid Sisters ink theme (for two accounts): two bright ink colours, bubbly fonts, ink splats, a splash where you click or send, and two characters in the chat, on the loading screen and in the updater window. Turns RetroTerminal and VHS off.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    enabledByDefault: false,
    // not in the plugin list: it is chosen from the o2cord theme cards (only the two accounts see that card)
    hidden: true,
    settings,

    // Early, so the loading screen is already in ink.
    startAt: StartAt.DOMContentLoaded,

    start() {
        turnOffOtherScreenThemes();
        activate();
        void onceReady.then(() => {
            // a wrong account never keeps this theme on
            if (UserStore.getCurrentUser() && !splatAllowed()) {
                if (Settings.plugins.SplatInk) Settings.plugins.SplatInk.enabled = false;
                stopPlugin(plugins.SplatInk);
                return;
            }
            if (!active || subscribed) return;
            subscribed = true;
            FluxDispatcher.subscribe("CONNECTION_OPEN", reinkWhenIdle);
            FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
            reinkWhenIdle();
        });
    },

    stop() {
        if (subscribed) {
            FluxDispatcher.unsubscribe("CONNECTION_OPEN", reinkWhenIdle);
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        }
        subscribed = false;
        deactivate();
    }
});
