/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Runs in the Electron main process (native.ts convention - Vencord exposes
 * this file's exports to the renderer as VencordNative.pluginHelpers.
 * AccountSwitcher.<name>()). Spawns a second, detached instance of the
 * currently-running Discord executable so a different account can be
 * signed into it independently of the current window.
 *
 * Not verified live yet - built the same night it was requested, but
 * deployment/testing was explicitly left for next time. Whether this
 * actually produces a second usable window (rather than Electron's default
 * single-instance lock just focusing the existing one) depends on how this
 * Discord build's app.requestSingleInstanceLock() is set up, which hasn't
 * been checked.
 */

import { spawn } from "child_process";
import { openSync } from "fs";
import { join } from "path";

// A bare relaunch of the same exe hits Discord's own single-instance lock -
// the second process just notifies the first one and exits, so no second
// window ever appears. --user-data-dir points Electron at a separate
// profile directory, which is what actually gets a real second instance to
// stay up; the tradeoff is that second window has its own separate profile
// (not the same "known accounts" list) and needs its own login the first
// time. This is the same technique multi-account browser profiles use.
//
// DIAGNOSTIC BUILD: the previous silent version's child process was
// confirmed (via tasklist, live) to vanish with no window and no error
// visible anywhere - stdio was "ignore" so whatever it printed on its way
// out was lost. This version pipes stdout/stderr to a log file instead of
// discarding them, purely to find out why, before attempting a heavier fix
// (e.g. a genuinely separate app copy). No behavior change beyond that.
export async function openNewInstance() {
    const secondaryProfile = join(process.env.APPDATA || "", "o2cord-secondary-profile");
    const logPath = join(process.env.TEMP || process.env.APPDATA || "", "o2cord-new-window-debug.log");
    const out = openSync(logPath, "w");
    spawn(process.execPath, [`--user-data-dir=${secondaryProfile}`], {
        detached: true,
        stdio: ["ignore", out, out]
    }).unref();
}
