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
