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

import "./o2ProfilePopout.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { SongTrigger } from "@plugins/profileSong";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { ReactDOM, useEffect, useRef, useState } from "@webpack/common";

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

function FrameOverlay({ user }: { user?: User; }) {
    const anchor = useRef<HTMLSpanElement>(null);
    const [host, setHost] = useState<HTMLElement | null>(null);
    const frame = user ? FRAMES[user.id] : undefined;

    useEffect(() => {
        if (!frame) return;
        const card = anchor.current?.closest<HTMLElement>(".user-profile-popout");
        if (!card) return;
        // (a Discord shop frame on the same card is hidden by CSS while ours is there)
        setHost(card);
    }, [frame]);

    if (!frame) return null;
    return (
        <>
            <span ref={anchor} style={{ display: "none" }} />
            {host && ReactDOM.createPortal(<TerminalFrame host={host} />, host)}
        </>
    );
}

function Extras(props: { user?: User; }) {
    return (
        <>
            <SongTrigger user={props.user} />
            <FrameOverlay user={props.user} />
        </>
    );
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

    Extras: ErrorBoundary.wrap(Extras, { noop: true })
});
