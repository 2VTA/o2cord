/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * SplatInk's pictures and the optional font file. Each picture place holds a
 * small album (one or more pictures); when it has more than one, the theme
 * shows the next one every few minutes. Everything is kept in DataStore as
 * Blobs (never in settings.json - big files there make every settings read and
 * save slow) and used through object URLs. Nothing leaves this PC.
 */

import * as DataStore from "@api/DataStore";
import { Button } from "@components/Button";
import { Forms, useEffect, useState } from "@webpack/common";

export type PictureSlot = "left" | "right" | "headLeft" | "headRight" | "together" | "loading";
export type Slot = PictureSlot | "font";

export const PICTURE_SLOTS: PictureSlot[] = ["left", "right", "headLeft", "headRight", "together", "loading"];
const ALL_SLOTS: Slot[] = [...PICTURE_SLOTS, "font"];
const key = (slot: Slot) => `SplatInk_${slot}`;

const MAX_BYTES = 25 * 1024 * 1024;

interface Entry { url: string; aspect: number; }
const albums: Record<Slot, Entry[]> = { left: [], right: [], headLeft: [], headRight: [], together: [], loading: [], font: [] };
const shown: Record<Slot, number> = { left: 0, right: 0, headLeft: 0, headRight: 0, together: 0, loading: 0, font: 0 };
const listeners = new Set<() => void>();
const changed = () => { for (const fn of listeners) fn(); };

export function onFilesChange(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}

/** The picture (or font) showing right now in this place. */
export const getUrl = (slot: Slot) => albums[slot][shown[slot] % Math.max(1, albums[slot].length)]?.url ?? null;
/** width / height of the picture showing right now (for placing pictures side by side) */
export const getAspect = (slot: PictureSlot) => albums[slot][shown[slot] % Math.max(1, albums[slot].length)]?.aspect || 0.55;

/** Moves every album with more than one picture on to its next picture. Returns whether anything changed. */
export function nextPictures(): boolean {
    let any = false;
    for (const slot of PICTURE_SLOTS) {
        if (albums[slot].length > 1) {
            shown[slot] = (shown[slot] + 1) % albums[slot].length;
            smallCache[slot] = undefined;
            any = true;
        }
    }
    if (any) changed();
    return any;
}

function makeEntries(slot: Slot, blobs: Blob[]) {
    for (const e of albums[slot]) URL.revokeObjectURL(e.url);
    albums[slot] = blobs.map(b => ({ url: URL.createObjectURL(b), aspect: 0 }));
    shown[slot] = slot === "font" ? 0 : Math.floor(Math.random() * Math.max(1, blobs.length));
    smallCache[slot] = undefined;
    if (slot !== "font") {
        for (const entry of albums[slot]) {
            const img = new Image();
            img.onload = () => {
                if (!img.naturalHeight || !albums[slot].includes(entry)) return;
                entry.aspect = img.naturalWidth / img.naturalHeight;
                changed();
            };
            img.src = entry.url;
        }
    }
    changed();
}

async function readBlobs(slot: Slot): Promise<Blob[]> {
    const saved = await DataStore.get<Blob | Blob[]>(key(slot)).catch(() => undefined);
    const list = Array.isArray(saved) ? saved : saved ? [saved] : [];
    return list.filter(b => b instanceof Blob);
}

/** Callie and Marie, used until you pick your own pictures (the two files sit next to the update on GitHub) */
const DEFAULT_PICTURES: Partial<Record<Slot, string>> = {
    left: "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/assets/splatink/callie.png",
    right: "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/assets/splatink/marie.png"
};

async function fetchDefault(slot: Slot): Promise<Blob[]> {
    const url = DEFAULT_PICTURES[slot];
    if (!url) return [];
    try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) return [];
        const blob = await res.blob();
        return blob.size > 0 && blob.type.startsWith("image/") ? [blob] : [];
    } catch {
        return [];
    }
}

export async function loadFiles() {
    for (const slot of ALL_SLOTS) {
        const own = await readBlobs(slot);
        makeEntries(slot, own.length ? own : await fetchDefault(slot));
    }
}

export function unloadFiles() {
    for (const slot of ALL_SLOTS) {
        for (const e of albums[slot]) URL.revokeObjectURL(e.url);
        albums[slot] = [];
        smallCache[slot] = undefined;
    }
}

async function saveBlobs(slot: Slot, blobs: Blob[]) {
    if (blobs.length) await DataStore.set(key(slot), slot === "font" ? blobs[0] : blobs);
    else await DataStore.del(key(slot));
    makeEntries(slot, blobs);
}

/*
 * A small copy of a picture as a data: URL, for Discord's updater window: that
 * window opens before Discord (and so before these object URLs) exists, so its
 * stylesheet has to carry the picture itself. Kept small.
 */
const smallCache: Partial<Record<Slot, Promise<string | null> | undefined>> = {};
export function smallDataUrl(slot: PictureSlot, height = 160): Promise<string | null> {
    const url = getUrl(slot);
    if (!url) return Promise.resolve(null);
    return smallCache[slot] ??= new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            try {
                const scale = Math.min(1, height / img.naturalHeight);
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/webp", 0.85));
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
    return new Promise(resolve => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;
        input.style.display = "none";
        input.onchange = () => {
            resolve([...(input.files ?? [])]);
            input.remove();
        };
        document.body.appendChild(input);
        input.click();
    });
}

function useAlbum(slot: Slot) {
    const [, setTick] = useState(0);
    useEffect(() => onFilesChange(() => setTick(t => t + 1)), []);
    return albums[slot];
}

const PICTURE_TYPES = "image/png,image/webp,image/gif,image/jpeg";

function AlbumSlot({ slot, title, help }: { slot: PictureSlot; title: string; help: string; }) {
    const album = useAlbum(slot);
    const [error, setError] = useState("");

    async function add() {
        const files = await pickFiles(PICTURE_TYPES, true);
        if (!files.length) return;
        const ok = files.filter(f => f.size <= MAX_BYTES);
        setError(ok.length < files.length ? "Some pictures were too big (25 MB max) and were left out." : "");
        await saveBlobs(slot, [...await readBlobs(slot), ...ok]);
    }

    async function removeAt(i: number) {
        const blobs = await readBlobs(slot);
        blobs.splice(i, 1);
        await saveBlobs(slot, blobs);
    }

    return (
        <div style={{ flex: "1 1 220px", minWidth: 220 }}>
            <Forms.FormTitle>{title}</Forms.FormTitle>
            <Forms.FormText>{help}</Forms.FormText>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0", minHeight: 96, padding: 6, borderRadius: 10, background: "#120c26" }}>
                {album.length ? album.map((e, i) => (
                    <div key={e.url} style={{ position: "relative", width: 84, height: 84, borderRadius: 8, background: `#1d1538 center / contain no-repeat url("${e.url}")` }}>
                        <button
                            onClick={() => removeAt(i)}
                            title="Remove this picture"
                            style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: 10, border: "none", background: "#f22d9a", color: "#fff", cursor: "pointer", lineHeight: "18px", padding: 0 }}
                        >×</button>
                    </div>
                )) : <span style={{ color: "#9a8fc0", fontSize: 13, margin: "auto" }}>No pictures</span>}
            </div>
            <Button size="small" onClick={add}>Add pictures</Button>
            {error && <Forms.FormText style={{ marginTop: 6, color: "var(--text-feedback-critical)" }}>{error}</Forms.FormText>}
        </div>
    );
}

export function CharactersSetting() {
    return (
        <section>
            <Forms.FormTitle tag="h3">Pictures</Forms.FormTitle>
            <Forms.FormText>
                Each place can hold several pictures - with more than one, the next one shows every few minutes (and a different one each
                time Discord starts). PNGs with a see-through background look best. They are kept only on this PC.
            </Forms.FormText>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
                <AlbumSlot slot="left" title="Callie (full body)" help="Stands in the chat, on the loading screen and in the updater window." />
                <AlbumSlot slot="right" title="Marie (full body)" help="Stands next to Callie." />
                <AlbumSlot slot="headLeft" title="Callie (head / icon)" help="Peeks from the bottom of the channel list." />
                <AlbumSlot slot="headRight" title="Marie (head / icon)" help="Peeks from the top of the member list." />
                <AlbumSlot slot="together" title="The two together" help="Behind the friends list." />
                <AlbumSlot slot="loading" title="Loading screen" help="In the middle of Discord's loading screen and the small updater window, above the ink logo." />
            </div>
        </section>
    );
}

export function FontFileSetting() {
    const album = useAlbum("font");
    async function pick() {
        const [file] = await pickFiles(".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2", false);
        if (file && file.size <= MAX_BYTES) await saveBlobs("font", [file]);
    }
    return (
        <section>
            <Forms.FormTitle>Your own font file</Forms.FormTitle>
            <Forms.FormText>Used when "Font" is set to "My font file" (a .ttf, .otf, .woff or .woff2 file).</Forms.FormText>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ color: "#9a8fc0", fontSize: 13 }}>{album.length ? "Font file chosen" : "No font file"}</span>
                <Button size="small" onClick={pick}>{album.length ? "Change" : "Choose a file"}</Button>
                <Button size="small" variant="dangerSecondary" disabled={!album.length} onClick={() => saveBlobs("font", [])}>Remove</Button>
            </div>
        </section>
    );
}
