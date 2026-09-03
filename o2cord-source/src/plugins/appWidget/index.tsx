/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Broadcasts a Rich Presence activity for a Discord Application Ryder
 * registered himself (with a custom profile widget configured in the
 * Developer Portal) - same LOCAL_ACTIVITY_UPDATE mechanism proven by
 * CustomRPC/FakePlaying, just pared down to the one field this needs.
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ActivityType } from "@vencord/discord-types/enums";
import { FluxDispatcher } from "@webpack/common";

const SOCKET_ID = "o2cord-AppWidget";

function applyActivity() {
    const { applicationId, activityName } = settings.store;

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: applicationId ? {
            application_id: applicationId,
            name: activityName || "o2cord",
            type: ActivityType.PLAYING,
            flags: 1 << 0
        } : null,
        socketId: SOCKET_ID
    });
}

const settings = definePluginSettings({
    applicationId: {
        type: OptionType.STRING,
        description: "Discord Application ID (Developer Portal - the app with your custom widget configured)",
        default: "",
        onChange: applyActivity
    },
    activityName: {
        type: OptionType.STRING,
        description: "Activity name (Discord requires a non-empty name - doesn't need to match anything)",
        default: "",
        onChange: applyActivity
    }
});

export default definePlugin({
    name: "AppWidget",
    description: "Broadcasts a Rich Presence activity for a custom Discord Application, so its configured profile widget shows up.",
    authors: [Devs.Ryder],
    settings,

    start: applyActivity,
    stop() {
        FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: null, socketId: SOCKET_ID });
    }
});
