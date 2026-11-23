/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    mode: {
        type: OptionType.SELECT,
        description: "How a share reaches your friends",
        options: [
            { label: "From you (their o2cord shows it as Marie / Callie)", value: "direct", default: true },
            { label: "Through the bot (Marie / Callie DMs them)", value: "bot" },
        ],
    },
});
