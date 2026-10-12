/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Puts "debug o2" behind a button in the top bar (instead of a page in User
 * Settings) and opens it as a big window. The button only renders for Ryder and
 * the people he gave access to (Callie's -debug-access) - same check that guards
 * the debug tools themselves - so everyone else's top bar is untouched.
 */

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { DebugO2Tab } from "@components/settings/tabs";
import { Devs } from "@utils/constants";
import { DEBUG_ACCESS_UPDATED_EVENT, isDebugOwner, loadDebugAccess } from "@utils/o2Debug";
import definePlugin from "@utils/types";
import { Modal, openModal, useEffect, useState } from "@webpack/common";

function TerminalIcon({ width = 20, height = 20, className }: { width?: number; height?: number; className?: string; }) {
    return (
        <svg aria-hidden="true" role="img" width={width} height={height} className={className} viewBox="0 0 24 24">
            <path
                fill="currentColor"
                d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h16V6H4Zm2.3 2.3 3.7 3.7-3.7 3.7-1.4-1.4 2.3-2.3-2.3-2.3 1.4-1.4ZM11 15h6v2h-6v-2Z"
            />
        </svg>
    );
}

export function openDebugO2Window() {
    openModal(props => (
        <Modal {...props} size="lg" title="debug o2">
            <div className="o2-con-window">
                <DebugO2Tab />
            </div>
        </Modal>
    ));
}

function DebugButton() {
    // the access list arrives a moment after start; show the button once it does
    const [, rerender] = useState(0);
    useEffect(() => {
        const onUpdate = () => rerender(n => n + 1);
        window.addEventListener(DEBUG_ACCESS_UPDATED_EVENT, onUpdate);
        return () => window.removeEventListener(DEBUG_ACCESS_UPDATED_EVENT, onUpdate);
    }, []);

    if (!isDebugOwner()) return null;
    return <HeaderBarButton icon={TerminalIcon} tooltip="debug o2" onClick={openDebugO2Window} />;
}

export default definePlugin({
    name: "O2DebugButton",
    description: "Top-bar button that opens debug o2 (only for the debug owner).",
    authors: [Devs.Ryder],
    required: true,
    hidden: true,
    dependencies: ["HeaderBarAPI"],

    start() {
        void loadDebugAccess();
        addHeaderBarButton("o2cord-debug-o2", () => <DebugButton />, 1000);
    },

    stop() {
        removeHeaderBarButton("o2cord-debug-o2");
    }
});
