/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IMAGES } from "./images";

// New features get a picture (cropped to just the thing that changed);
// fixes are text only. Newest release first - the window shows RELEASES[0].
export interface Feature {
    plugin: string;
    title: string;
    text: string;
    image?: string;
}

export interface Fix {
    plugin?: string;
    text: string;
}

export interface Release {
    version: string;
    date: string;
    features: Feature[];
    fixes: Fix[];
}

export const RELEASES: Release[] = [
    {
        version: "1.3.47",
        date: "October 19, 2026",
        features: [
            {
                plugin: "ProfileSong",
                title: "o2cord profile frames",
                text: "o2cord can now draw its own frames around profiles. The first one is Ryder's: a terminal frame with a light running round the edge - open his profile to see it."
            }
        ],
        fixes: []
    },
    {
        version: "1.3.46",
        date: "October 19, 2026",
        features: [
            {
                plugin: "ProfileSong",
                title: "Profile songs",
                text: "Like MySpace: some profiles now play a short song when you open them, and it fades out when you close the profile. Don't want it? Turn on \"Don't play profile songs\" in ProfileSong's settings."
            }
        ],
        fixes: [
            { plugin: "ServerInfo", text: "Clicking a friend in Server Info opens their profile again (also fixes other places that open profiles)." },
            { plugin: "TenorGifSearch", text: "Picking a GIF works again after a Discord update." }
        ]
    },
    {
        version: "1.3.45",
        date: "October 18, 2026",
        features: [
            {
                plugin: "RetroTerminal",
                title: "Your own colours",
                text: "Pick \"Custom\" in the colour profile and choose your own text and background colours - or let the background follow Discord's own."
            },
            {
                plugin: "RetroTerminal",
                title: "Your own boot picture",
                text: "The picture on the boot screen can now be yours: choose any image in RetroTerminal's settings and it's turned into dot art."
            },
            {
                plugin: "ServerInfo",
                title: "Roles tab",
                text: "Server Info now lists every role with its colour and ID - click a role to copy its ID."
            }
        ],
        fixes: [
            { plugin: "RetroTerminal", text: "Picking a colour profile works again when the colours were set to Discord's own." },
            { plugin: "ServerInfo", text: "The Friends, Blocked and Ignored tabs show people again." },
            { plugin: "ChannelWallpaper", text: "Back for everyone. Syncing wallpapers with friends is now off unless you turn it on (it posts a message in the DM)." },
            { plugin: "CallieRequests", text: "Join the o2cord server from the window with one button, and fix \"Callie can't DM you\" with one click." }
        ]
    },
    {
        version: "1.3.25",
        date: "September 29, 2026",
        features: [
            {
                plugin: "FakePlaying",
                title: "Its own window",
                text: "Fake Playing now opens in a proper window, laid out like plugin settings, instead of the small menu under the button.",
                image: IMAGES.fakePlayingWindow
            },
            {
                plugin: "FakePlaying",
                title: "Game icons",
                text: "Every game shows its real icon and when you last played it, with the most recent at the top.",
                image: IMAGES.fakePlayingGames
            },
            {
                plugin: "O2WindowControls",
                title: "Images from your device",
                text: "Each window button can now use a link or an image picked from your PC (PNG, JPG, WebP or GIF). Switch between them with Link / From device.",
                image: IMAGES.windowControlsDevice
            }
        ],
        fixes: [
            { plugin: "Settings", text: "Plugin settings windows open again. A Discord update had made them crash or open empty." },
            { text: "Closing all open windows at once works again after the same Discord update." }
        ]
    }
];
