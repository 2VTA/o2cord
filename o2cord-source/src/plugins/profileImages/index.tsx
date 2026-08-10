/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

import { PublicProfileThemeSettings } from "../profileTheme";

const settings = definePluginSettings({
    manager: {
        type: OptionType.COMPONENT,
        description: "",
        component: PublicProfileThemeSettings
    }
});

export default definePlugin({
    name: "ProfileImages",
    description: "Shows decorative background images added by the o2cord team on select profiles, with an adjustable brightness.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    dependencies: ["ProfileTheme"],
    enabledByDefault: false,
    settings
});
