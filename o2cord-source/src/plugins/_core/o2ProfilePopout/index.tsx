/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * One hook into the profile popout for o2cord's own extras, so they don't fight
 * over the same spot: ProfileSong's player and the profile frames. Each extra
 * renders nothing visible inside the popout itself (the frame draws on the
 * popout's outer box through a portal).
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { SongTrigger } from "@plugins/profileSong";
import { Devs } from "@utils/constants";
import { getOwnProfileFrame, loadOwnProfileFrame, PROFILE_FRAME_CHANGED_EVENT, PROFILE_FRAME_OWNER_ID, type ProfileFrameId } from "@utils/o2ProfileFrame";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { createRoot, useEffect, UserStore, useState } from "@webpack/common";

import { CHIBI_ART } from "./art";

// who wears which frame (only Ryder for now): on his own client it is whatever he
// picked in the debug o2 tab, everywhere else the default one
function frameFor(userId: string): Exclude<ProfileFrameId, "none"> | undefined {
    if (userId !== PROFILE_FRAME_OWNER_ID) return undefined;
    const choice = UserStore.getCurrentUser()?.id === userId ? getOwnProfileFrame() : "terminal";
    return choice === "none" ? undefined : choice;
}

function useCardSize(host: HTMLElement) {
    const [size, setSize] = useState({ w: host.offsetWidth, h: host.offsetHeight });
    useEffect(() => {
        const ro = new ResizeObserver(() => setSize({ w: host.offsetWidth, h: host.offsetHeight }));
        ro.observe(host);
        return () => ro.disconnect();
    }, [host]);
    return size;
}

const boxStyle = (h: number) => ({ position: "absolute", inset: -5, zIndex: 5, pointerEvents: "none", "--o2-frame-h": `${h}px` } as React.CSSProperties);

// Chibi: an orange-to-pink glowing edge with a light running round it, twinkling
// sparkles in the corners, and the little headphones girl peeking over the top.
function ChibiFrame({ host }: { host: HTMLElement; }) {
    const size = useCardSize(host);
    const w = size.w + 10, h = size.h + 10;
    return (
        <div className="o2-frame o2-frame-chibi" aria-hidden="true" style={boxStyle(size.h)}>
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                <defs>
                    <linearGradient id="o2-chibi-edge" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#ff9a2e" />
                        <stop offset="0.5" stopColor="#ff4f9a" />
                        <stop offset="1" stopColor="#ff9a2e" />
                    </linearGradient>
                </defs>
                <rect className="o2-chibi-edge" x="2" y="2" width={w - 4} height={h - 4} rx="12" fill="none" stroke="url(#o2-chibi-edge)" strokeWidth="3.5" />
                <rect className="o2-chibi-run" x="2" y="2" width={w - 4} height={h - 4} rx="12" fill="none" stroke="#fff3df" strokeWidth="2.5" pathLength={1000} strokeDasharray="60 940" />
            </svg>
            <span className="o2-chibi-spark o2-chibi-s1">✦</span>
            <span className="o2-chibi-spark o2-chibi-s2">✦</span>
            <span className="o2-chibi-spark o2-chibi-s3">✦</span>
            <span className="o2-chibi-spark o2-chibi-s4">✦</span>
            <img className="o2-chibi-girl" src={CHIBI_ART} alt="" draggable={false} />
        </div>
    );
}

// Smoke: a heavy black edge with silver corner caps, white smoke rising from the
// bottom, and the name on top.
function SmokeFrame({ host }: { host: HTMLElement; }) {
    const size = useCardSize(host);
    const w = size.w + 10, h = size.h + 10;
    return (
        <div className="o2-frame o2-frame-smoke" aria-hidden="true" style={boxStyle(size.h)}>
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                <rect x="2.5" y="2.5" width={w - 5} height={h - 5} rx="11" fill="none" stroke="#050505" strokeWidth="5" />
                <rect x="5" y="5" width={w - 10} height={h - 10} rx="9" fill="none" stroke="#9a9a9a" strokeWidth="1" />
            </svg>
            <span className="o2-smoke-cap o2-smoke-tl" />
            <span className="o2-smoke-cap o2-smoke-tr" />
            <span className="o2-smoke-cap o2-smoke-bl" />
            <span className="o2-smoke-cap o2-smoke-br" />
            <span className="o2-smoke-puff o2-smoke-p1" />
            <span className="o2-smoke-puff o2-smoke-p2" />
            <span className="o2-smoke-puff o2-smoke-p3" />
            <span className="o2-smoke-puff o2-smoke-p4" />
            <span className="o2-smoke-tag">RYDER</span>
        </div>
    );
}

// Terminal: white corner brackets, a light running round the edge, a slow scan
// line, and "> O2 _" on top - same look as RetroTerminal.
function TerminalFrame({ host }: { host: HTMLElement; }) {
    const size = useCardSize(host);

    const pad = 5;
    const w = size.w + pad * 2, h = size.h + pad * 2;
    return (
        <div className="o2-frame o2-frame-terminal" aria-hidden="true" style={boxStyle(size.h)}>
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                <rect x="1.5" y="1.5" width={w - 3} height={h - 3} rx="11" fill="none" stroke="#e8e8e8" strokeWidth="2" />
                <rect className="o2-frame-run" x="1.5" y="1.5" width={w - 3} height={h - 3} rx="11" fill="none" stroke="#fff" strokeWidth="3" pathLength={1000} strokeDasharray="70 930" />
            </svg>
            <span className="o2-frame-corner o2-frame-tl" />
            <span className="o2-frame-corner o2-frame-tr" />
            <span className="o2-frame-corner o2-frame-bl" />
            <span className="o2-frame-corner o2-frame-br" />
            <span className="o2-frame-scan" />
            <span className="o2-frame-tag">&gt; O2 <span className="o2-frame-caret">_</span></span>
        </div>
    );
}

// Frames are found on screen rather than through one component: Discord shows
// a profile card in several places (the popout when you click someone, your own
// account popout bottom-left, ...), and every one of them is a .user-profile-popout
// with the user's avatar inside. A card for someone with a frame gets one.
const AVATAR_ID = /\/(?:avatars|users)\/(\d{17,20})\//;
const mounted = new Map<HTMLElement, { root: ReturnType<typeof createRoot>; holder: HTMLElement; }>();
const retries = new WeakMap<HTMLElement, number>();
let observer: MutationObserver | undefined;
let scanQueued = false;

function cardUserId(card: HTMLElement) {
    // your own account popout (bottom-left): always you - and its avatar is often a
    // picture CustomProfile swapped in, which carries no id to read
    if (card.closest("[class*='accountPopout']")) return UserStore.getCurrentUser()?.id;

    for (const img of card.querySelectorAll<HTMLImageElement>("img[class*='avatar'], [class*='avatar'] img")) {
        const id = img.src.match(AVATAR_ID)?.[1];
        if (id) return id;
    }
    return undefined;
}

function scan() {
    scanQueued = false;
    for (const [card, { root, holder }] of mounted) {
        if (!card.isConnected) { root.unmount(); holder.remove(); mounted.delete(card); }
    }
    let waiting = false;
    for (const card of document.querySelectorAll<HTMLElement>(".user-profile-popout")) {
        if (mounted.has(card)) continue;
        const id = cardUserId(card);
        if (!id) {
            // the avatar comes in a moment after the card - look again shortly
            const tries = (retries.get(card) ?? 0) + 1;
            retries.set(card, tries);
            if (tries < 12) waiting = true;
            continue;
        }
        const frame = frameFor(id);
        if (!frame) continue;
        // the frame is laid out against the card; some cards (your own account
        // popout) aren't positioned, which would throw it off somewhere else
        if (getComputedStyle(card).position === "static") card.style.position = "relative";
        const holder = document.createElement("div");
        holder.className = "o2-frame-holder";
        // covers the card exactly (Discord makes the card's children position:relative)
        holder.style.cssText = "position:absolute !important;inset:0;z-index:5;pointer-events:none;";
        card.append(holder);
        const root = createRoot(holder);
        const Frame = frame === "chibi" ? ChibiFrame : frame === "smoke" ? SmokeFrame : TerminalFrame;
        root.render(<Frame host={card} />);
        mounted.set(card, { root, holder });
    }
    if (waiting) setTimeout(queueScan, 250);
}

// the debug o2 tab switched the frame: take every drawn frame down and draw the chosen one
function redraw() {
    for (const { root, holder } of mounted.values()) { root.unmount(); holder.remove(); }
    mounted.clear();
    queueScan();
}

function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
}

function Extras(props: { user?: User; }) {
    return <SongTrigger user={props.user} />;
}

export default definePlugin({
    name: "O2ProfilePopout",
    description: "o2cord's extras in the profile popout (profile songs, profile frames).",
    authors: [Devs.Ryder],
    required: true,
    hidden: true,

    patches: [
        {
            // same spot as ShowConnections' row in the profile popout
            find: '"UserProfilePopout");',
            replacement: {
                match: /userId:\i\.id,guild:\i\}\)(?=])/,
                replace: "$&,$self.Extras(arguments[0])"
            }
        }
    ],

    Extras: ErrorBoundary.wrap(Extras, { noop: true }),

    start() {
        observer = new MutationObserver(queueScan);
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener(PROFILE_FRAME_CHANGED_EVENT, redraw);
        void loadOwnProfileFrame();
        queueScan();
    },

    stop() {
        observer?.disconnect();
        window.removeEventListener(PROFILE_FRAME_CHANGED_EVENT, redraw);
        for (const { root, holder } of mounted.values()) { root.unmount(); holder.remove(); }
        mounted.clear();
    }
});
