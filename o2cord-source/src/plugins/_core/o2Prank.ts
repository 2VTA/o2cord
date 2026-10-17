/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The Ryder-picture joke (utils/o2Prank.tsx) for Discord's own image viewer too:
 * clicking Ryder's avatar or banner in his profile opens the joke instead of the
 * full-size picture - for everyone except Ryder.
 */

import { Devs } from "@utils/constants";
import { isRyderPicture, openRyderPrank } from "@utils/o2Prank";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

export default definePlugin({
    name: "O2Prank",
    description: "o2cord easter egg.",
    authors: [Devs.Ryder],
    required: true,
    hidden: true,

    patches: [
        {
            // Discord's openMediaModal(props, ...) - the full-size image/video viewer
            find: "hasMediaOptions:!",
            replacement: {
                match: /(?<=function \i\((\i),\i\)\{)(?=let\{location:\i,contextKey:)/,
                replace: "if($self.blockMedia($1))return;"
            }
        }
    ],

    blockMedia(props: any) {
        try {
            const item = props?.items?.[props.startingIndex ?? 0];
            const url: string | undefined = item?.url ?? item?.original;
            if (!isRyderPicture(url, UserStore.getCurrentUser()?.id)) return false;
            openRyderPrank(url!);
            return true;
        } catch {
            return false;
        }
    }
});
