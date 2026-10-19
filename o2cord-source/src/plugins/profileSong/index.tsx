/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ProfileSong - MySpace style: a short piece of music plays when a profile is
 * opened, and stops when it closes.
 *
 * Only Ryder can set songs: the editor below renders on his account only. He
 * tries a song locally, then "Publish for everyone" posts the file to #callie,
 * where Callie puts it on GitHub (profile-songs.json + the audio file). Every
 * o2cord user reads that list and hears it on the matching profile; anyone can
 * turn the sound off with the "Don't play profile songs" switch.
 *
 * It rides on the same spot in the profile popout as ShowConnections: a tiny
 * invisible component that starts the song when the popout mounts and fades it
 * out when it unmounts.
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { isRealDebugOwner } from "@utils/o2Debug";
import definePlugin, { OptionType } from "@utils/types";
import { chooseFile } from "@utils/web";
import { User } from "@vencord/discord-types";
import { Forms, RestAPI, showToast, SnowflakeUtils, TextInput, Toasts, UserStore, useEffect, useState } from "@webpack/common";

const KEY = "o2cord.profileSongs";
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_SECONDS = 30;

interface Song {
    name: string;
    data: string; // data: URL
    start: number; // seconds into the track
    length: number; // seconds to play
    volume: number; // 0..1
}

const REGISTRY_URL = "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/profile-songs.json";
const CALLIE_CHANNEL_ID = "1538034368751083550"; // #callie

// published for everyone (url instead of data); local ones win, for trying out
let published: Record<string, Song> = {};
let songs: Record<string, Song> = {};
const listeners = new Set<() => void>();

async function load() {
    // only Ryder keeps local songs; everyone else just plays the published list
    songs = isRealDebugOwner() ? (await DataStore.get<Record<string, Song>>(KEY)) ?? {} : {};
    listeners.forEach(fn => fn());
    try {
        const res = await fetch(`${REGISTRY_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const next: Record<string, Song> = {};
        for (const [id, e] of Object.entries<any>(data ?? {})) {
            if (!/^\d{17,20}$/.test(id) || typeof e?.url !== "string" || !e.url.startsWith("https://raw.githubusercontent.com/2VTA/o2cord/")) continue;
            next[id] = { name: "published", data: e.url, start: Number(e.start) || 0, length: Math.min(MAX_SECONDS, Number(e.length) || 15), volume: Math.min(1, Math.max(0, Number(e.volume ?? 0.6))) };
        }
        published = next;
        listeners.forEach(fn => fn());
    } catch { /* no list = no songs */ }
}

const songFor = (id: string) => songs[id] ?? published[id];

async function save(next: Record<string, Song>) {
    songs = next;
    await DataStore.set(KEY, next);
    listeners.forEach(fn => fn());
}

// ------------------------------------------------------------------ playing

let current: { audio: HTMLAudioElement; timer?: ReturnType<typeof setTimeout>; fade?: ReturnType<typeof setInterval>; } | null = null;

function stop(fadeMs = 600) {
    const playing = current;
    if (!playing) return;
    current = null;
    clearTimeout(playing.timer);
    clearInterval(playing.fade);
    const { audio } = playing;
    const startVol = audio.volume;
    const steps = Math.max(1, Math.round(fadeMs / 50));
    let i = 0;
    const t = setInterval(() => {
        i++;
        audio.volume = Math.max(0, startVol * (1 - i / steps));
        if (i >= steps) { clearInterval(t); audio.pause(); audio.src = ""; }
    }, 50);
}

function play(song: Song) {
    if (settings.store.muted) return;
    stop(150);
    const audio = new Audio(song.data);
    audio.currentTime = song.start;
    audio.volume = 0;
    const target = Math.min(1, Math.max(0, song.volume));
    const playing: NonNullable<typeof current> = { audio };
    current = playing;
    audio.play().catch(() => { });
    // fade in, then stop by itself after `length` seconds
    let i = 0;
    playing.fade = setInterval(() => {
        i++;
        audio.volume = Math.min(target, target * i / 12);
        if (i >= 12) clearInterval(playing.fade);
    }, 50);
    playing.timer = setTimeout(() => { if (current === playing) stop(900); }, Math.min(MAX_SECONDS, song.length) * 1000);
}

// mounted inside the profile popout
function SongTrigger({ user }: { user?: User; }) {
    useEffect(() => {
        const song = user && songFor(user.id);
        if (!song) return;
        play(song);
        return () => stop();
    }, [user?.id]);
    return null;
}

// ----------------------------------------------------------------- settings

function dataUrlToFile(dataUrl: string, name: string) {
    const [head, b64] = dataUrl.split(",");
    const mime = head.match(/data:([^;]+)/)?.[1] ?? "audio/mpeg";
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new File([bytes], name, { type: mime });
}

// posts the file to #callie as "o2cord-profilesong-<id>.<ext>"; Callie publishes it
async function publishForEveryone(userId: string, song: Song) {
    const ext = (song.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "mp3").toLowerCase();
    const file = dataUrlToFile(song.data, `o2cord-profilesong-${userId}.${ext}`);
    try {
        const { body } = await RestAPI.post({
            url: `/channels/${CALLIE_CHANNEL_ID}/attachments`,
            body: { files: [{ filename: file.name, file_size: file.size, id: "0" }] }
        });
        const slot = body?.attachments?.[0];
        if (!slot?.upload_url) throw new Error("no upload slot");
        const put = await fetch(slot.upload_url, { method: "PUT", body: file });
        if (!put.ok) throw new Error(`upload ${put.status}`);
        await RestAPI.post({
            url: `/channels/${CALLIE_CHANNEL_ID}/messages`,
            body: {
                content: JSON.stringify({ start: song.start, length: song.length, volume: song.volume }),
                nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                attachments: [{ id: "0", filename: file.name, uploaded_filename: slot.upload_filename }]
            }
        });
        showToast("Sent to Callie - everyone hears it in a minute or so.", Toasts.Type.SUCCESS);
    } catch (e: any) {
        showToast(`Couldn't send it (${e?.body?.code ?? e?.status ?? e?.message ?? "error"}).`, Toasts.Type.FAILURE);
    }
}

async function unpublish(userId: string) {
    try {
        await RestAPI.post({ url: `/channels/${CALLIE_CHANNEL_ID}/messages`, body: { content: `-profilesong-remove ${userId}` } });
        showToast("Asked Callie to take it down.", Toasts.Type.SUCCESS);
    } catch {
        showToast("Couldn't reach #callie.", Toasts.Type.FAILURE);
    }
}

function SongsEditor() {
    const [, rerender] = useState(0);
    const [userId, setUserId] = useState(UserStore.getCurrentUser()?.id ?? "");
    const [start, setStart] = useState("0");
    const [length, setLength] = useState("15");
    const [volume, setVolume] = useState("60");
    const [status, setStatus] = useState("");

    useEffect(() => {
        const fn = () => rerender(n => n + 1);
        listeners.add(fn);
        return () => void listeners.delete(fn);
    }, []);

    async function add() {
        if (!/^\d{17,20}$/.test(userId)) { setStatus("Enter a user ID (17-20 digits)."); return; }
        const file = await chooseFile("audio/*");
        if (!file) return;
        if (file.size > MAX_BYTES) { setStatus("That file is over 3MB - cut it shorter."); return; }
        const data = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = () => reject(r.error);
            r.readAsDataURL(file);
        });
        const song: Song = {
            name: file.name,
            data,
            start: Math.max(0, Number(start) || 0),
            length: Math.min(MAX_SECONDS, Math.max(1, Number(length) || 15)),
            volume: Math.min(100, Math.max(0, Number(volume) || 60)) / 100
        };
        await save({ ...songs, [userId]: song });
        setStatus(`Saved for ${UserStore.getUser(userId)?.username ?? userId}. Open their profile to hear it.`);
    }

    return (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Forms.FormTitle>Profile songs</Forms.FormTitle>
            <Forms.FormText>Pick a user and a short audio file. It's saved here first so you can try it (open their profile). "Publish for everyone" sends it to Callie, and then every o2cord user hears it on that profile.</Forms.FormText>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8 }}>
                <TextInput value={userId} onChange={(v: string) => setUserId(v.replace(/\D/g, ""))} placeholder="User ID" />
                <TextInput value={start} onChange={setStart} placeholder="Start (s)" />
                <TextInput value={length} onChange={setLength} placeholder="Length (s)" />
                <TextInput value={volume} onChange={setVolume} placeholder="Volume %" />
            </div>
            <Forms.FormText>User ID · start second · how many seconds (up to {MAX_SECONDS}) · volume %</Forms.FormText>
            <div><Button size="small" onClick={add}>Choose song and save</Button></div>
            {status && <Forms.FormText>{status}</Forms.FormText>}

            {Object.entries(songs).map(([id, s]) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "var(--background-mod-subtle, rgba(255,255,255,0.04))" }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <b>{UserStore.getUser(id)?.username ?? id}</b> - {s.name} ({s.start}s, {s.length}s, {Math.round(s.volume * 100)}%)
                    </span>
                    <Button size="small" variant="secondary" onClick={() => play(s)}>Play</Button>
                    <Button size="small" variant="secondary" onClick={() => stop()}>Stop</Button>
                    <Button size="small" onClick={() => publishForEveryone(id, s)}>Publish for everyone</Button>
                    <Button size="small" variant="dangerSecondary" onClick={() => { const { [id]: _, ...rest } = songs; void save(rest); }}>Remove</Button>
                </div>
            ))}

            {Object.keys(published).length > 0 && <Forms.FormTitle style={{ marginTop: 8 }}>Published for everyone</Forms.FormTitle>}
            {Object.entries(published).map(([id, s]) => (
                <div key={"p" + id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "var(--background-mod-subtle, rgba(255,255,255,0.04))" }}>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{UserStore.getUser(id)?.username ?? id}</b> ({s.start}s, {s.length}s, {Math.round(s.volume * 100)}%)</span>
                    <Button size="small" variant="secondary" onClick={() => play(s)}>Play</Button>
                    <Button size="small" variant="dangerSecondary" onClick={() => unpublish(id)}>Remove for everyone</Button>
                </div>
            ))}
        </section>
    );
}

const settings = definePluginSettings({
    muted: {
        type: OptionType.BOOLEAN,
        description: "Don't play profile songs.",
        default: false
    },
    songs: {
        type: OptionType.COMPONENT,
        component: () => (isRealDebugOwner() ? <SongsEditor /> : null)
    }
});

export default definePlugin({
    name: "ProfileSong",
    description: "MySpace style: a short song plays when you open the profile of someone who has one.",
    tags: ["Fun", "Customisation"],
    authors: [Devs.Ryder],
    enabledByDefault: true,
    settings,

    patches: [
        {
            // same spot as ShowConnections' row in the profile popout
            find: '"UserProfilePopout");',
            replacement: {
                match: /userId:\i\.id,guild:\i\}\)(?=])/,
                replace: "$&,$self.SongTrigger(arguments[0])"
            }
        }
    ],

    SongTrigger: ErrorBoundary.wrap((props: { user?: User; }) => <SongTrigger user={props.user} />, { noop: true }),

    start() {
        void load();
    },

    stop() {
        stop(0);
    }
});
