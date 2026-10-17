/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * A joke: when somebody else uses an o2cord image viewer (ViewIcons' "View
 * Avatar/Banner", Server Info, ...) on Ryder's own avatar or banner, they get a
 * blurred picture and a "Show anyway" button that runs away from the mouse.
 * Only the full-size viewer is swapped; Discord itself shows the avatar as usual.
 */

import { Devs } from "@utils/constants";
import { Modal, openModal, useState } from "@webpack/common";

const RYDER = String(Devs.Ryder.id);

// cdn paths that carry the user id: /avatars/<id>/, /banners/<id>/, /guilds/<g>/users/<id>/...
const RYDER_ASSET = new RegExp(`/(?:avatars|banners|users)/${RYDER}/`);

export function isRyderPicture(url: string | undefined, viewerId: string | undefined) {
    return !!url && viewerId !== RYDER && RYDER_ASSET.test(url);
}

const LINES = [
    "تبي تشوف صورة Ryder؟ 😂",
    "nice try 😏",
    "الصورة محمية بقوة o2cord 🛡️",
    "Ryder يقول: لا 🙅"
];

function RunawayButton() {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [tries, setTries] = useState(0);
    const dodge = () => {
        setTries(t => t + 1);
        setPos({ x: (Math.random() - 0.5) * 360, y: (Math.random() - 0.5) * 160 });
    };
    return (
        <>
            <button
                style={{
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    transition: "transform 0.18s ease",
                    padding: "10px 22px",
                    border: "none",
                    borderRadius: 8,
                    background: "var(--brand-500, #5865f2)",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer"
                }}
                onMouseEnter={dodge}
                onFocus={dodge}
                onClick={dodge}
            >
                Show anyway
            </button>
            {tries > 3 && <div style={{ marginTop: 12, color: "var(--text-muted)" }}>{tries} محاولة... استسلم 😂</div>}
        </>
    );
}

export function openRyderPrank(url: string) {
    const line = LINES[Math.floor(Math.random() * LINES.length)];
    openModal(props => (
        <Modal {...props} size="sm" title={line}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "8px 0 20px", overflow: "hidden" }}>
                <div style={{ width: 200, height: 200, borderRadius: "50%", backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(18px) saturate(1.4)" }} />
                <RunawayButton />
            </div>
        </Modal>
    ));
}
