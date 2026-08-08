/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { openSettingsTabModal } from "@components/settings/tabs/BaseTab";
import { debounce } from "@shared/debounce";
import { Devs } from "@utils/constants";
import { isTruthy } from "@utils/guards";
import definePlugin, { OptionType } from "@utils/types";
import { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, FluxDispatcher } from "@webpack/common";

import CustomRPCFullTab from "./FullTab";
import { RPCSettings } from "./RpcSettings";

export const enum TimestampMode {
    NONE,
    SINCE_START,
    SINCE_UPDATE,
    LOCAL_TIME,
    CUSTOM,
}

export const enum StatusDisplayType {
    NAME,
    STATE,
    DETAILS,
}

export const settings = definePluginSettings({
    config: {
        type: OptionType.COMPONENT,
        component: RPCSettings
    },
}).withPrivateSettings<{
    appID?: string;
    name?: string;
    displayType?: StatusDisplayType;
    type?: ActivityType;
    details?: string;
    detailsURL?: string;
    state?: string;
    stateURL?: string;
    streamLink?: string;
    timestampMode?: TimestampMode;
    startTime?: number;
    endTime?: number;
    imageBig?: string;
    imageBigURL?: string;
    imageBigTooltip?: string;
    imageSmall?: string;
    imageSmallURL?: string;
    imageSmallTooltip?: string;
    buttonOneText?: string;
    buttonOneURL?: string;
    buttonTwoText?: string;
    buttonTwoURL?: string;
    partySize?: number;
    partyMaxSize?: number;
}>();

/** When the plugin's RPC session "started" - for the "Since last connection" timestamp mode. */
export let sessionStartTime = Date.now();
/** When the activity was last actually pushed with real changes - for "Since presence update". */
export let lastUpdateTime = Date.now();

async function getApplicationAsset(key: string): Promise<string> {
    return (await ApplicationAssetUtils.fetchAssetIds(settings.store.appID!, [key]))[0];
}

export async function createActivity(): Promise<Activity | undefined> {
    const {
        appID,
        name,
        displayType,
        details,
        detailsURL,
        state,
        stateURL,
        type,
        streamLink,
        startTime,
        endTime,
        imageBig,
        imageBigURL,
        imageBigTooltip,
        imageSmall,
        imageSmallURL,
        imageSmallTooltip,
        buttonOneText,
        buttonOneURL,
        buttonTwoText,
        buttonTwoURL,
        partyMaxSize,
        partySize,
        timestampMode
    } = settings.store;

    if (!name) return;

    const activity: Activity = {
        application_id: appID || "0",
        name,
        state,
        details,
        type: type ?? ActivityType.PLAYING,
        flags: 1 << 0,
    };

    if (displayType != null) (activity as any).status_display_type = displayType;
    if (type === ActivityType.STREAMING) activity.url = streamLink;

    switch (timestampMode) {
        case TimestampMode.SINCE_START:
            activity.timestamps = { start: sessionStartTime };
            break;
        case TimestampMode.SINCE_UPDATE:
            activity.timestamps = { start: lastUpdateTime };
            break;
        case TimestampMode.LOCAL_TIME:
            activity.timestamps = {
                start: Date.now() - (new Date().getHours() * 3600 + new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000
            };
            break;
        case TimestampMode.CUSTOM:
            if (startTime || endTime) {
                activity.timestamps = {};
                if (startTime) activity.timestamps.start = startTime;
                if (endTime) activity.timestamps.end = endTime;
            }
            break;
        case TimestampMode.NONE:
        default:
            break;
    }

    if (detailsURL) activity.details_url = detailsURL;
    if (stateURL) activity.state_url = stateURL;

    if (buttonOneText) {
        activity.buttons = [buttonOneText, buttonTwoText].filter(isTruthy);
        activity.metadata = {
            button_urls: [buttonOneURL, buttonTwoURL].filter(isTruthy)
        };
    }

    if (imageBig) {
        activity.assets = {
            large_image: await getApplicationAsset(imageBig),
            large_text: imageBigTooltip || undefined,
            large_url: imageBigURL || undefined
        };
    }

    if (imageSmall) {
        activity.assets = {
            ...activity.assets,
            small_image: await getApplicationAsset(imageSmall),
            small_text: imageSmallTooltip || undefined,
            small_url: imageSmallURL || undefined
        };
    }

    if (partyMaxSize && partySize) {
        activity.party = { size: [partySize, partyMaxSize] };
    }

    for (const k in activity) {
        if (k === "type") continue;
        const v = (activity as any)[k];
        if (!v || v.length === 0) delete (activity as any)[k];
    }

    return activity;
}

export async function setRpc(disable?: boolean) {
    const activity: Activity | undefined = await createActivity();

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: !disable ? activity : null,
        socketId: "o2RichPresence",
    });
}

/** Call after a settings field actually changes, not on every render. */
export const markUpdated = debounce(() => {
    lastUpdateTime = Date.now();
    setRpc(true);
    setRpc();
});

function RpcHeaderIcon(props: { width?: number; height?: number; }) {
    return (
        <svg width={props.width ?? 18} height={props.height ?? 18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M6.5 4h11A4.5 4.5 0 0 1 22 8.5v7A4.5 4.5 0 0 1 17.5 20h-11A4.5 4.5 0 0 1 2 15.5v-7A4.5 4.5 0 0 1 6.5 4Zm0 2A2.5 2.5 0 0 0 4 8.5v7A2.5 2.5 0 0 0 6.5 18h11a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 17.5 6h-11Z"
                fill="currentColor"
            />
            <path d="M7 8.5h2v2h2v2H9v2H7v-2H5v-2h2v-2Z" fill="currentColor" />
            <circle cx="17.5" cy="10" r="1.4" fill="currentColor" />
            <circle cx="14.5" cy="13" r="1.4" fill="currentColor" />
        </svg>
    );
}

function openRpcTab() {
    openSettingsTabModal(CustomRPCFullTab);
}

export default definePlugin({
    name: "o2RichPresence",
    description: "A dedicated Rich Presence editor with its own header bar button and full-page form, modeled on CustomRP.",
    tags: ["Activity", "Customisation"],
    authors: [Devs.Ryder],
    enabledByDefault: false,

    start: () => {
        sessionStartTime = Date.now();
        lastUpdateTime = Date.now();
        setRpc();
        addHeaderBarButton("o2RichPresence", () => (
            <HeaderBarButton
                icon={RpcHeaderIcon}
                tooltip="Rich Presence"
                onClick={openRpcTab}
            />
        ));
    },
    stop: () => {
        setRpc(true);
        removeHeaderBarButton("o2RichPresence");
    },

    // Discord hides buttons on your own Rich Presence for some reason. This patch disables that behaviour
    patches: [
        {
            find: ".USER_PROFILE_ACTIVITY_BUTTONS),",
            replacement: {
                match: /.getId\(\)===\i.id/,
                replace: "$& && false"
            }
        }
    ],

    settings
});
