/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The o2cord plugins that are public (everyone with o2cord has them). One list for the Plugins tab's
 * "o2cord" filter, the o2cord settings page and the o2cord-plugins.md file in the source folder.
 * Private plugins (Ryder only) are never listed here.
 */

export interface O2PluginInfo {
    /** the plugin's name as in definePlugin */
    name: string;
    /** one line, what it does */
    summary: string;
}

export const O2_PUBLIC_PLUGINS: O2PluginInfo[] = [
    { name: "o2Settings", summary: "Quick switches and the theme choice (Normal, Retro Terminal, VHS)" },
    { name: "O2WhatsNew", summary: "Shows what's new in o2cord after each update" },
    { name: "ProfileTheme", summary: "A picture behind a whole profile card (big window, small card and the side panel)" },
    { name: "ProfileImages", summary: "Profile pictures added by the o2cord team, with adjustable brightness" },
    { name: "CustomProfile", summary: "Change how your own profile looks: name, picture, banner, badges, bio, effects and frames" },
    { name: "Nameplate", summary: "A background behind usernames in the member list" },
    { name: "ProfileSong", summary: "A short song plays when you open the profile of someone who has one" },
    { name: "CustomTyping", summary: "Shows other o2cord users' own typing phrase instead of \"is typing...\"" },
    { name: "ussro2Public", summary: "Shared o2 profile backgrounds, shown for everyone on this build" },
    { name: "CallieRequests", summary: "Send picture, theme, background and typing-phrase requests to Callie" },
    { name: "RetroTerminal", summary: "Discord as an old CRT screen (theme)" },
    { name: "VHS", summary: "Discord as an old VHS tape (theme)" },
    { name: "O2Voice", summary: "Voice changer for voice channels (needs the free VB-CABLE)" },
    { name: "O2Presence", summary: "Your own Rich Presence: presets, live preview, rotation and buttons" },
    { name: "FakePlaying", summary: "Shows \"Playing X\" on your profile" },
    { name: "AntiMoveDeco", summary: "A button that stops you from being moved or disconnected in a voice channel" },
    { name: "NitroServer", summary: "Every server at max Boost tier, custom role icons and server banner (cosmetic)" },
    { name: "AppIcon", summary: "Change the picture on Discord's window and taskbar button" },
    { name: "O2WindowControls", summary: "Your own images on the window buttons" },
    { name: "Widget", summary: "A cosmetic two-card widget on your profile settings" }
];

export const O2_PUBLIC_PLUGIN_NAMES = new Set(O2_PUBLIC_PLUGINS.map(p => p.name));
