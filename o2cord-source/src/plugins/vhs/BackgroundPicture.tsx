/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The VHS background picture: picked from a file, kept in DataStore as a Blob
 * (not in settings.json - big pictures there made every settings read and
 * save slow, see WhosWatching/NitroServer) and shown through an object URL.
 */

import * as DataStore from "@api/DataStore";
import { Button } from "@components/Button";
import { chooseFile } from "@utils/web";
import { Forms, useEffect, useState } from "@webpack/common";

const BACKGROUND_KEY = "VHS_background";
export const MAX_BACKGROUND_BYTES = 25 * 1024 * 1024;

let backgroundUrl: string | null = null;
const listeners = new Set<(url: string | null) => void>();

export const getBackgroundUrl = () => backgroundUrl;

export function onBackgroundChange(fn: (url: string | null) => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}

function setBackgroundBlob(blob: Blob | null) {
    if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
    backgroundUrl = blob ? URL.createObjectURL(blob) : null;
    for (const fn of listeners) fn(backgroundUrl);
}

/** Reads the saved picture once (on start). */
export async function loadBackground() {
    const blob = await DataStore.get<Blob>(BACKGROUND_KEY).catch(() => undefined);
    setBackgroundBlob(blob instanceof Blob ? blob : null);
}

export function unloadBackground() {
    if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
    backgroundUrl = null;
}

export function BackgroundPictureSetting() {
    const [url, setUrl] = useState(getBackgroundUrl);
    const [error, setError] = useState("");
    useEffect(() => onBackgroundChange(setUrl), []);

    async function pick() {
        const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
        if (!file) return;
        if (file.size > MAX_BACKGROUND_BYTES) {
            setError("That picture is too big (25 MB max).");
            return;
        }
        setError("");
        await DataStore.set(BACKGROUND_KEY, file);
        setBackgroundBlob(file);
    }

    async function remove() {
        await DataStore.del(BACKGROUND_KEY);
        setBackgroundBlob(null);
    }

    return (
        <section>
            <Forms.FormTitle>Background picture</Forms.FormTitle>
            <Forms.FormText>A picture (or GIF) behind Discord: it shows through the panels, while pictures, videos and text stay on top of it.</Forms.FormText>
            <div style={{
                margin: "10px 0",
                height: 120,
                borderRadius: 6,
                background: url ? `#000 center / cover no-repeat url("${url}")` : "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#888",
                fontSize: 13
            }}>
                {url ? null : "No picture"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="small" onClick={pick}>{url ? "Change picture" : "Choose a picture"}</Button>
                <Button size="small" variant="dangerSecondary" disabled={!url} onClick={remove}>Remove</Button>
            </div>
            {error && <Forms.FormText style={{ marginTop: 6, color: "var(--text-feedback-critical)" }}>{error}</Forms.FormText>}
        </section>
    );
}
