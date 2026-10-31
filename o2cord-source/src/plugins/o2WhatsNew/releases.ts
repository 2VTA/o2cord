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
    /** optional nickname shown next to the version, like "Bread Update" */
    name?: string;
    date: string;
    features: Feature[];
    fixes: Fix[];
}

export const RELEASES: Release[] = [
    {
        version: "1.3.67",
        date: "October 31, 2026",
        features: [
            {
                plugin: "VHS",
                title: "VHS in the theme picker",
                text: "VHS is now a card next to Normal, Liquid Glass and Retro Terminal. Double-click it for its settings; the Themes page also has quick buttons for the tape colours."
            }
        ],
        fixes: [
            { plugin: "VHS", text: "The background picture now sits behind Discord: it shows through the panels, while pictures, videos and text stay on top of it." },
            { plugin: "VHS", text: "The background picture waits for the blue PLAY screen to finish, then fades in." }
        ]
    },
    {
        version: "1.3.66",
        date: "October 31, 2026",
        features: [
            {
                plugin: "VHS",
                title: "VHS theme",
                text: "Discord as an old VHS tape: faded tape colours (Home tape, Night tape or the VCR's blue screen), red and blue colour fringing on text, interlace lines, grain and tracking noise - and Discord's small updater window and loading screen become the VCR's blue PLAY screen. Pictures keep their real colours and nothing in Discord's layout moves."
            },
            {
                plugin: "VHS",
                title: "Your own background picture",
                text: "Pick any picture or GIF in the VHS settings and it shows behind the tape effects, like an old recording. Clicks still go to Discord as normal."
            }
        ],
        fixes: [
            { plugin: "StreamingCodecDisabler", text: "Fewer black screens when you share your screen: Discord no longer switches your stream in and out of H265 while people join and leave (now on for everyone, you can change it in the plugin)." }
        ]
    },
    {
        version: "1.3.65",
        date: "October 31, 2026",
        features: [],
        fixes: [
            { plugin: "RetroTerminal", text: "Discord opens faster: the retro updater window no longer holds Discord back for 5 seconds on startup." },
            { plugin: "RetroTerminal", text: "Lighter on your PC: the grain is still by default, moving effects hide while a video or stream plays and pause when Discord isn't focused." },
            { text: "Big saved pictures (Who's Watching, NitroServer) moved out of o2cord's settings file, so o2cord loads and saves settings much faster." }
        ]
    },
    {
        version: "1.3.64",
        date: "October 27, 2026",
        features: [
            {
                plugin: "GifCollections",
                title: "Add to collection from the GIF picker",
                text: "Right-click a GIF in the GIF picker to add it to one of your collections (the menu is back: Copy Link, Add To Collection, Edit GIF)."
            }
        ],
        fixes: [
            { plugin: "GifCollections", text: "GIFs saved from a link are sent as GIFs again, not as an mp4 video. (Ones saved before need to be saved again.)" }
        ]
    },
    {
        version: "1.3.63",
        date: "October 26, 2026",
        features: [],
        fixes: [
            { plugin: "BadgeAPI", text: "Badge category labels in dark colours are readable now: the name and ring are lightened so they don't vanish on the dark panel." }
        ]
    },
    {
        version: "1.3.62",
        date: "October 26, 2026",
        features: [
            {
                plugin: "CustomProfile",
                title: "Share your Custom Profile with one click",
                text: "Press Save with \"Publish to others\" on (or the Publish to others button) and your profile goes straight to Callie - no command, no file. Everyone using o2cord sees it within a minute."
            },
            {
                plugin: "CustomProfile",
                title: "Crop your banner like Discord",
                text: "Choosing a banner now opens the same Edit Image window as your profile picture, with a wide crop, zoom and rotate."
            }
        ],
        fixes: [
            { plugin: "CustomProfile", text: "The rotate button in Edit Image now rotates the picture, and what you see in the preview is exactly what gets saved." }
        ]
    },
    {
        version: "1.3.61",
        date: "October 25, 2026",
        features: [
            {
                plugin: "BadgeAPI",
                title: "o2cord badges in \"Your badges\"",
                text: "The badges you get from o2cord now show in Discord's \"Your badges\" panel, with a rarity label. Friend badges have their own orange-heart FRIEND label, and we can now make new categories with their own name, colour and picture."
            },
            {
                plugin: "PlatformIndicators",
                title: "Platform icons in voice",
                text: "The Desktop / Mobile / Web / Console icon now shows next to names in voice channels and on the call tiles."
            },
            {
                plugin: "FakeNitro",
                title: "Soundboard for everyone",
                text: "FakeNitro can now open the Soundboard: sounds from other servers and your own join sound work without Nitro. There is a switch for it in the plugin's settings."
            },
            {
                plugin: "JumpToTop",
                title: "New plugin: Jump To Top",
                text: "A button in the channel header that jumps to the first message in the channel."
            },
            {
                plugin: "DirectFileDownload",
                title: "New plugin: Direct File Download",
                text: "Download Discord files directly instead of opening them in the browser."
            },
            {
                plugin: "GifProviderSwitcher",
                title: "New plugin: GIF Provider Switcher",
                text: "Use Tenor or Giphy for GIF search instead of Klipy."
            },
            {
                plugin: "CustomProfile",
                title: "See everyone's Custom Profile",
                text: "A new switch in the Custom Profile window shows the profiles other o2cord users published (on by default), and Save can now send your own profile straight to Callie."
            }
        ],
        fixes: [
            { plugin: "Translate", text: "Google Translate works again." },
            { plugin: "CustomProfile", text: "Profiles other people published now actually show up for everyone." }
        ]
    },
    {
        version: "1.3.60",
        date: "October 25, 2026",
        features: [
            {
                plugin: "ProfileImages",
                title: "See your own profile image",
                text: "The Profile Images settings now show the picture set for your profile, and a button puts the brightness back to its default."
            }
        ],
        fixes: [
            { text: "Updates no longer restart Discord on you. o2cord still downloads them by itself, and the new version starts the next time you restart Discord yourself." },
            { plugin: "CustomProfile", text: "Picking a badge no longer hides your real badges - they show together." }
        ]
    },
    {
        version: "1.3.59",
        date: "October 25, 2026",
        features: [],
        fixes: [
            { plugin: "WhosWatching", text: "Screen share panel: the picture button now shows even when someone is watching." }
        ]
    },
    {
        version: "1.3.57",
        date: "October 25, 2026",
        features: [],
        fixes: [
            { text: "Every link to a Discord server in o2cord now goes to the o2cord server." }
        ]
    },
    {
        version: "1.3.55",
        date: "October 25, 2026",
        features: [
            {
                plugin: "RetroTerminal",
                title: "Double-click to edit Retro Terminal",
                text: "On the o2cord settings page, double-click the Retro Terminal card to open all its settings - colours, your own colours, the boot picture, font and effects."
            }
        ],
        fixes: []
    },
    {
        version: "1.3.54",
        name: "Bread Update",
        date: "October 24, 2026",
        features: [
            {
                plugin: "o2cord Settings",
                title: "A new look for o2cord Settings",
                text: "The o2cord page in Discord's settings is all new and much simpler: your version and a Restart button up top, the quick switches, the theme picker, the window options in plain words, and the tools at the bottom. Advanced stuff hides behind \"Advanced\".",
                image: IMAGES.breadSettings
            },
            {
                plugin: "o2cord Settings",
                title: "Plugins page",
                text: "Search, then pick All, On, Off, New or o2cord with one click. Cleaner cards, a count of how many plugins you have on, and the built-in plugins tucked away.",
                image: IMAGES.breadPlugins
            },
            {
                plugin: "o2cord Settings",
                title: "Themes, without the wall of text",
                text: "The three info boxes became one small \"Tips\" box, so your themes show straight away.",
                image: IMAGES.breadThemes
            },
            {
                plugin: "o2cord Settings",
                title: "Backup in one card",
                text: "Save your o2cord settings to a file, or load them back - two buttons, that's it.",
                image: IMAGES.breadBackup
            },
            {
                plugin: "o2cord Settings",
                title: "The dev button",
                text: "Press \"dev\" in Tools to meet the people behind o2cord.",
                image: IMAGES.breadDev
            }
        ],
        fixes: [
            { plugin: "o2Settings", text: "The puzzle button at the top is gone - everything it had is on the o2cord settings page now." },
            { plugin: "o2cord Settings", text: "Patch Helper (a developer tool) was removed." }
        ]
    },
    {
        version: "1.3.53",
        date: "October 24, 2026",
        features: [
            {
                plugin: "o2Settings",
                title: "The o2cord Hub",
                text: "The puzzle button at the top now opens one simple window for everything: quick switches, themes, o2cord's plugins grouped by what they do, your profile tools and the news. Anything advanced is one \"More\" click away.",
                image: IMAGES.o2Hub
            }
        ],
        fixes: []
    },
    {
        version: "1.3.52",
        date: "October 24, 2026",
        features: [],
        fixes: [
            { text: "You can drag the Discord window again (to another screen, or snap it to a side) - on the newest Discord the window had stopped moving." }
        ]
    },
    {
        version: "1.3.51",
        date: "October 24, 2026",
        features: [
            {
                plugin: "RetroTerminal",
                title: "Retro Terminal for everyone",
                text: "Turn Discord into an old CRT screen: phosphor colours, glow, scanlines and a terminal boot screen. Open the o2cord Settings panel (puzzle button at the top) -> Themes -> Retro Terminal, and pick a colour."
            },
            {
                plugin: "RetroTerminal",
                title: "New colour: Red",
                text: "Red phosphor joins Amber, Green, Blue and the rest - also in the quick colour picker."
            }
        ],
        fixes: []
    },
    {
        version: "1.3.50",
        date: "October 24, 2026",
        features: [
            {
                plugin: "AntiMoveDeco",
                title: "AntiMoveDeco for everyone",
                text: "Join a voice channel and press the shield button at the top: if someone moves or disconnects you, o2cord takes you straight back. Turn it on in Plugins."
            },
            {
                plugin: "o2Settings",
                title: "Hide Spectators",
                text: "New switch in the o2cord Settings panel (puzzle button at the top): hides the SPECTATORS list under your stream. Your stream picture stays."
            }
        ],
        fixes: []
    },
    {
        version: "1.3.48",
        date: "October 19, 2026",
        features: [],
        fixes: [
            { plugin: "Settings", text: "The Plugins page opens again - 1.3.47 made it show an error." },
            { plugin: "ProfileSong", text: "Profile frames now also show on your own profile card (when you click your picture bottom-left)." }
        ]
    },
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
