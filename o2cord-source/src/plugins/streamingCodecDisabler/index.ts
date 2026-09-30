/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Ported from Equicord's StreamingCodecDisabler (davidkra230). The original
 * called mediaEngine.setAv1Enabled / setH265Enabled / setH264Enabled on Go
 * Live, but those setters are gone from Discord (PTB 1.0.1222 - checked live,
 * nothing in webpack has them anymore). Discord now reads the engine's codec
 * capabilities once per connection, when it connects, and advertises
 * {name, encode, decode} for each - so the patch marks a disabled codec as
 * encode:false right there. Decoding is left alone, so you can still watch
 * other people's streams in any codec.
 *
 * Takes effect on the next stream/call connection, not one already running.
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const CODECS = ["AV1", "H265", "H264", "VP8", "VP9"] as const;
type Codec = typeof CODECS[number];

const settings = definePluginSettings({
    disableAv1Codec: {
        description: "Make Discord not consider using AV1 for streaming.",
        type: OptionType.BOOLEAN,
        default: false
    },
    disableH265Codec: {
        description: "Make Discord not consider using H265 for streaming.",
        type: OptionType.BOOLEAN,
        default: false
    },
    disableH264Codec: {
        description: "Make Discord not consider using H264 for streaming.",
        type: OptionType.BOOLEAN,
        default: false
    },
    disableVP8Codec: {
        description: "Make Discord not consider using VP8 for streaming.",
        type: OptionType.BOOLEAN,
        default: false
    },
    disableVP9Codec: {
        description: "Make Discord not consider using VP9 for streaming.",
        type: OptionType.BOOLEAN,
        default: false
    },
});

function isDisabled(codec: Codec) {
    const s = settings.store;
    switch (codec) {
        case "AV1": return s.disableAv1Codec;
        case "H265": return s.disableH265Codec;
        case "H264": return s.disableH264Codec;
        case "VP8": return s.disableVP8Codec;
        case "VP9": return s.disableVP9Codec;
    }
}

export default definePlugin({
    name: "StreamingCodecDisabler",
    description: "Disable codecs for streaming of your choice",
    tags: ["Utility", "Voice"],
    authors: [{ name: "davidkra230", id: 652699312631054356n }],
    settings,

    patches: [
        {
            find: "Available engine codecs:",
            replacement: {
                // The engine capability parser: {name:"AV1X"===(t=e.codec)?"AV1":t,encode:e.encode,decode:e.decode}
                match: /(\i)\.codec\)\?"AV1":\i,encode:\1\.encode/,
                replace: "$&&&$self.canEncode($1.codec)"
            }
        }
    ],

    canEncode(raw: string) {
        const codec = (raw === "AV1X" ? "AV1" : raw) as Codec;
        if (!CODECS.includes(codec)) return true;
        // Every codec switched off would mean no video at all - ignore the
        // settings then instead of silently breaking streams and cameras.
        if (CODECS.every(isDisabled)) return true;
        return !isDisabled(codec);
    }
});
