/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * O2 Presence: a Rich Presence editor that lives in a window. Keep several
 * presets (type, name, lines, pictures, links, time, party, buttons), switch
 * between them with a click or rotate on a timer, and see exactly how the card
 * will look while you type. The engine is in model.ts, the window in
 * PresenceModal.tsx.
 */

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { useEffect, useState } from "@webpack/common";

import { onPresenceChange, settings, startEngine, stopEngine } from "./model";
import { openPresenceModal } from "./PresenceModal";

function PresenceIcon({ width = 20, height = 20, className }: { width?: number; height?: number; className?: string; }) {
    return (
        <svg aria-hidden="true" role="img" width={width} height={height} className={className} viewBox="0 0 24 24">
            <path
                fill="currentColor"
                d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 14.2a7.2 7.2 0 0 1-5.2-2.2c.1-1.7 3.5-2.6 5.2-2.6s5.1.9 5.2 2.6A7.2 7.2 0 0 1 12 19.2Z"
            />
        </svg>
    );
}

function PresenceHeaderButton() {
    const [, rerender] = useState(0);
    useEffect(() => onPresenceChange(() => rerender(n => n + 1)), []);

    return (
        <HeaderBarButton
            icon={PresenceIcon}
            tooltip={settings.store.on ? "O2 Presence (showing)" : "O2 Presence"}
            onClick={openPresenceModal}
            selected={settings.store.on}
        />
    );
}

export default definePlugin({
    name: "O2Presence",
    description: "Your own Rich Presence in a window: several saved presets, a live preview, game-ID lookup, rotation, live clock text, buttons and links.",
    tags: ["Activity", "Customisation"],
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: false,
    settings,

    toolboxActions: {
        "O2 Presence": openPresenceModal
    },

    start() {
        addHeaderBarButton("o2cord-o2-presence", () => <PresenceHeaderButton />, 895);
        startEngine();
    },

    stop() {
        removeHeaderBarButton("o2cord-o2-presence");
        stopEngine();
    }
});
