/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { useAwaiter } from "@utils/react";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { Forms, UserStore } from "@webpack/common";

import { createActivity, settings } from ".";
import { RPCSettings } from "./RpcSettings";

const useProfileThemeStyle = findByCodeLazy("profileThemeStyle:", "--profile-gradient-primary-color");
const ActivityView = findComponentByCodeLazy(".party?(0", "USER_PROFILE_ACTIVITY");

function LivePreview() {
    const [activity] = useAwaiter(createActivity, { fallbackValue: undefined, deps: Object.values(settings.store) });
    const { profileThemeStyle } = useProfileThemeStyle({});

    return (
        <div className="vc-customRPC-preview">
            <Forms.FormTitle tag="h5">Preview</Forms.FormTitle>
            <div className="vc-customRPC-preview-card" style={profileThemeStyle}>
                {activity
                    ? <ActivityView activity={activity} user={UserStore.getCurrentUser()} currentUser={UserStore.getCurrentUser()} />
                    : <Forms.FormText className="vc-customRPC-preview-empty">Fill in an Application Name to preview your Rich Presence.</Forms.FormText>}
            </div>
        </div>
    );
}

function CustomRPCFullPage() {
    return (
        <SettingsTab>
            <div className="vc-customRPC-fulltab">
                <div className="vc-customRPC-fulltab-form">
                    <RPCSettings />
                </div>
                <LivePreview />
            </div>
        </SettingsTab>
    );
}

export default wrapTab(CustomRPCFullPage, "Custom Rich Presence");
