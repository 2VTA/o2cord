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
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { createRoot, useEffect, useState } from "@webpack/common";

// who wears which frame (only Ryder for now)
const FRAMES: Record<string, "terminal"> = {
    "719085334989897750": "terminal"
};

// Terminal: white corner brackets, a light running round the edge, a slow scan
// line, and "> O2 _" on top - same look as RetroTerminal.
function TerminalFrame({ host }: { host: HTMLElement; }) {
    const [size, setSize] = useState({ w: host.offsetWidth, h: host.offsetHeight });
    useEffect(() => {
        const ro = new ResizeObserver(() => setSize({ w: host.offsetWidth, h: host.offsetHeight }));
        ro.observe(host);
        return () => ro.disconnect();
    }, [host]);

    const pad = 5;
    const w = size.w + pad * 2, h = size.h + pad * 2;
    return (
        <div className="o2-frame o2-frame-terminal" aria-hidden="true" style={{ position: "absolute", inset: -5, zIndex: 5, pointerEvents: "none", "--o2-frame-h": `${size.h}px` } as React.CSSProperties}>
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
const mounted = new Map<HTMLElement, ReturnType<typeof createRoot>>();
const retries = new WeakMap<HTMLElement, number>();
let observer: MutationObserver | undefined;
let scanQueued = false;

function cardUserId(card: HTMLElement) {
    for (const img of card.querySelectorAll<HTMLImageElement>("img[class*='avatar'], [class*='avatar'] img")) {
        const id = img.src.match(AVATAR_ID)?.[1];
        if (id) return id;
    }
    return undefined;
}

function scan() {
    scanQueued = false;
    for (const [card, root] of mounted) {
        if (!card.isConnected) { root.unmount(); mounted.delete(card); }
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
        if (!FRAMES[id]) continue;
        // the frame is laid out against the card; some cards (your own account
        // popout) aren't positioned, which would throw it off somewhere else
        if (getComputedStyle(card).position === "static") card.style.position = "relative";
        const holder = document.createElement("div");
        holder.className = "o2-frame-holder";
        // covers the card exactly (Discord makes the card's children position:relative)
        holder.style.cssText = "position:absolute !important;inset:0;z-index:5;pointer-events:none;";
        card.append(holder);
        const root = createRoot(holder);
        root.render(<TerminalFrame host={card} />);
        mounted.set(card, root);
    }
    if (waiting) setTimeout(queueScan, 250);
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
        queueScan();
    },

    stop() {
        observer?.disconnect();
        for (const root of mounted.values()) root.unmount();
        mounted.clear();
    }
});
