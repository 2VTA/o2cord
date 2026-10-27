/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { _openGifPickerContextMenu } from "@api/GifPickerContextMenu";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ExtraContextMenusAPI",
    description: "API that adds more context menus to patch.",
    authors: [Devs.Ryder],
    required: true,

    patches: [
        {
            // a GIF (or collection tile) in the picker: our menu if some plugin has items for it,
            // otherwise Discord's own one
            find: "renderEmptyFavorite",
            replacement: {
                match: /handleContextMenu=(\i)=>\{(?=let\{onContextMenu:\i,item:\i\}=this\.props;)/,
                replace: "handleContextMenu=$1=>{if($self.openContextMenu($1,this))return;"
            }
        }
    ],

    openContextMenu(e: React.MouseEvent, instance) {
        if (!instance) return false;
        return _openGifPickerContextMenu(e, instance);
    },
});
