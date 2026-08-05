/*!
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// DO NOT REMOVE UNLESS YOU WISH TO FACE THE WRATH OF THE CIRCULAR DEPENDENCY DEMON!!!!!!!
import "~plugins";
import "./fixWeirdAppRegionBug.css";

export * as Api from "./api";
export * as Plugins from "./api/PluginManager";
export * as Components from "./components";
export * as Util from "./utils";
export * as Updater from "./utils/updater";
export * as Webpack from "./webpack";
export * as WebpackPatcher from "./webpack/patchWebpack";
export { PlainSettings, Settings };

import { coreStyleRootNode, initStyles } from "@api/Styles";
import { popNotice, showNotice } from "@api/Notices";
import { openSettingsTabModal, UpdaterTab } from "@components/settings";
import { IS_WINDOWS } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { relaunch } from "@utils/native";
import { StartAt } from "@utils/types";
import { React } from "@webpack/common";

import { NotificationData, showNotification } from "./api/Notifications";
import { initPluginManager, PMLogger, startAllPlugins } from "./api/PluginManager";
import { PlainSettings, Settings, SettingsStore } from "./api/Settings";
import { changes, checkForUpdates, update as applyO2Update, UpdateLogger } from "./utils/updater";
import { onceReady } from "./webpack";
import { patches } from "./webpack/patchWebpack";

if (IS_REPORTER) {
    require("./debug/runReporter");
}

async function syncSettings() {
    SettingsStore.addGlobalChangeListener(() => {
        // Cloud sync is disabled in o2cord so settings stay local-only.
    });
}

const O2_UPDATE_NOTICE_KEY = "o2cord-last-notified-update";

let notifiedForUpdatesThisSession: string | null = null;

function ensureO2UpdateNoticeStyle() {
    if (document.getElementById("o2-update-notice-style")) return;

    createAndAppendStyle("o2-update-notice-style", coreStyleRootNode).textContent = `
        [class*="notice"]:has(.o2-update-notice-message) {
            background: linear-gradient(90deg, #7f1d1d, #be123c, #dc2626) !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.18) !important;
            color: #fff !important;
            box-shadow: 0 8px 26px rgba(127, 29, 29, 0.32) !important;
        }

        [class*="notice"]:has(.o2-update-notice-message) [class*="button"],
        [class*="notice"]:has(.o2-update-notice-message) button {
            background: linear-gradient(180deg, #3b82f6, #2563eb) !important;
            border: 1px solid rgba(255, 255, 255, 0.28) !important;
            border-radius: 4px !important;
            color: #fff !important;
            font-weight: 700 !important;
            box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35) !important;
        }

        [class*="notice"]:has(.o2-update-notice-message) [class*="button"]:hover,
        [class*="notice"]:has(.o2-update-notice-message) button:hover {
            background: linear-gradient(180deg, #60a5fa, #2563eb) !important;
        }

        .o2-update-notice-message {
            color: #fff;
            font-weight: 700;
        }
    `;
}

function showO2UpdateNotice(applied: boolean) {
    ensureO2UpdateNoticeStyle();

    if (applied) {
        showNotice(
            React.createElement(
                "span",
                { className: "o2-update-notice-message" },
                "o2cord update installed. Relaunch Discord to finish."
            ),
            "Relaunch Now",
            () => {
                popNotice();
                relaunch();
            }
        );
        return;
    }

    showNotice(
        React.createElement(
            "span",
            { className: "o2-update-notice-message" },
            "o2cord update is available. Open the updater to install it."
        ),
        "Open Updater",
        () => {
            popNotice();
            openSettingsTabModal(UpdaterTab!);
        }
    );
}

function getAvailableUpdateKey() {
    return changes?.map(c => c.hash).filter(Boolean).join("|") || "unknown";
}

function shouldShowO2UpdateNotice(updateKey: string) {
    if (notifiedForUpdatesThisSession === updateKey) return false;

    try {
        if (localStorage.getItem(O2_UPDATE_NOTICE_KEY) === updateKey) return false;
        localStorage.setItem(O2_UPDATE_NOTICE_KEY, updateKey);
    } catch (err) {
        UpdateLogger.warn("Failed to save o2cord update notice state", err);
    }

    notifiedForUpdatesThisSession = updateKey;
    return true;
}

async function runUpdateCheck() {
    if (IS_UPDATER_DISABLED) return;

    const notify = (data: NotificationData) => {
        setTimeout(() => showNotification({
            permanent: true,
            noPersist: true,
            ...data
        }), 10_000);
    };

    try {
        const isOutdated = await checkForUpdates();
        if (!isOutdated) return;

        const updateKey = getAvailableUpdateKey();
        if (!shouldShowO2UpdateNotice(updateKey)) return;

        let applied = false;
        try {
            applied = await applyO2Update();
        } catch (err) {
            UpdateLogger.error("Failed to auto-apply o2cord update", err);
        }

        showO2UpdateNotice(applied);

        notify(applied
            ? {
                title: "o2cord updated!",
                body: "Click here to relaunch Discord and finish",
                onClick: relaunch
            }
            : {
                title: "An o2cord update is available!",
                body: "Click here to install it",
                onClick: () => openSettingsTabModal(UpdaterTab!)
            });
    } catch (err) {
        UpdateLogger.error("Failed to check for updates", err);
    }
}

async function init() {
    await onceReady;
    startAllPlugins(StartAt.WebpackReady);

    syncSettings();

    if (!IS_WEB && !IS_UPDATER_DISABLED) {
        runUpdateCheck();

        setInterval(runUpdateCheck, 1000 * 60 * 30); // 30 minutes
    }

    if (IS_DEV) {
        const pendingPatches = patches.filter(p => !p.all && p.predicate?.() !== false);
        if (pendingPatches.length)
            PMLogger.warn(
                "Webpack has finished initialising, but some patches haven't been applied yet.",
                "This might be expected since some Modules are lazy loaded, but please verify",
                "that all plugins are working as intended.",
                "You are seeing this warning because this is a Development build of o2cord.",
                "\nThe following patches have not been applied:",
                "\n\n" + pendingPatches.map(p => `${p.plugin}: ${p.find}`).join("\n")
            );
    }
}

initPluginManager();
initStyles();
startAllPlugins(StartAt.Init);
init();

document.addEventListener("DOMContentLoaded", () => {
    startAllPlugins(StartAt.DOMContentLoaded);

    if (IS_DISCORD_DESKTOP && Settings.winNativeTitleBar && IS_WINDOWS) {
        createAndAppendStyle("vencord-native-titlebar-style", coreStyleRootNode).textContent = `
            [class*=winButtons],
            [class*=winButton],
            [class*=windowControls] {
                display: none !important;
            }

            [class*=titleBar] {
                height: 32px !important;
                min-height: 32px !important;
                padding-right: 150px !important;
                -webkit-app-region: drag;
            }

            [class*=titleBar] button,
            [class*=titleBar] a,
            [class*=toolbar],
            [class*=searchBar] {
                -webkit-app-region: no-drag;
            }
        `;
    }
}, { once: true });
