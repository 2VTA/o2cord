/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { FluxDispatcher, UserStore } from "@webpack/common";

// One-off test at Ryder's request: hide the Soundboard button for a single
// specific user, to see how it lands before deciding whether to build this
// into a real toggleable feature. Not meant to stick around - delete this
// whole plugin once the test is done.
const TEST_USER_ID = "1228145726240854067";
const ACTIVE_CLASS = "o2-hide-soundboard-test";

function applyClass() {
    const isTestUser = UserStore.getCurrentUser()?.id === TEST_USER_ID;
    document.documentElement.classList.toggle(ACTIVE_CLASS, isTestUser);
}

export default definePlugin({
    name: "TestHideSoundboard",
    description: "Debug-only: hides the Soundboard button for one specific user, for a one-off test.",
    tags: ["Voice"],
    authors: [Devs.Ryder],
    hidden: true,
    enabledByDefault: true,

    start() {
        applyClass();
        FluxDispatcher.subscribe("CONNECTION_OPEN", applyClass);
    },

    stop() {
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", applyClass);
        document.documentElement.classList.remove(ACTIVE_CLASS);
    }
});
