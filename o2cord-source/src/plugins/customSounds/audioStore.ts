/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";

const STORAGE_KEY = "ScattrdCustomSounds";
export const MAX_AUDIO_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DATA_URI_CHARS = Math.ceil(MAX_AUDIO_FILE_BYTES * 1.4) + 256;
const MAX_TOTAL_AUDIO_STORE_CHARS = MAX_DATA_URI_CHARS * 3;

export interface StoredAudioFile {
    id: string;
    name: string;
    buffer?: ArrayBuffer;
    type: string;
    dataUri?: string;
}

export async function saveAudio(file: File): Promise<string> {
    if (file.size > MAX_AUDIO_FILE_BYTES) {
        throw new Error("Audio file is too large. Keep it under 2 MB.");
    }

    const id = crypto.randomUUID();
    const dataUri = await readFileAsDataURI(file);
    const type = getAudioMimeType(file.type, file.name);

    if (!dataUri.startsWith("data:audio/") || dataUri.length > MAX_DATA_URI_CHARS) {
        throw new Error("Audio file could not be saved safely. Use a shorter sound under 2 MB.");
    }

    const current = await getAllAudio();
    current[id] = {
        id,
        name: file.name,
        type,
        dataUri
    };
    await set(STORAGE_KEY, current);
    return id;
}

export async function getAllAudio(): Promise<Record<string, StoredAudioFile>> {
    const stored = await get<Record<string, unknown>>(STORAGE_KEY);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};

    const cleaned: Record<string, StoredAudioFile> = {};
    let changed = false;
    let totalDataUriChars = 0;

    for (const [id, rawEntry] of Object.entries(stored)) {
        const entry = normalizeStoredAudioFile(id, rawEntry);
        if (!entry) {
            changed = true;
            continue;
        }

        cleaned[id] = entry;
        totalDataUriChars += entry.dataUri?.length ?? 0;
        if (!isStoredAudioEqual(rawEntry, entry)) changed = true;
    }

    if (totalDataUriChars > MAX_TOTAL_AUDIO_STORE_CHARS) {
        console.warn("[CustomSounds] Audio store is too large; clearing uploaded sounds to keep o2cord stable.");
        await set(STORAGE_KEY, {});
        return {};
    }

    if (changed) {
        await set(STORAGE_KEY, cleaned).catch(error => {
            console.error("[CustomSounds] Failed to save cleaned audio store:", error);
        });
    }

    return cleaned;
}

function isStoredAudioEqual(rawEntry: unknown, normalized: StoredAudioFile): boolean {
    if (!rawEntry || typeof rawEntry !== "object") return false;

    const raw = rawEntry as Partial<StoredAudioFile>;
    return raw.id === normalized.id
        && raw.name === normalized.name
        && raw.type === normalized.type
        && raw.dataUri === normalized.dataUri
        && raw.buffer === normalized.buffer;
}

function getAudioMimeType(type: string | undefined, name: string | undefined): string {
    let mimeType = type || "audio/mpeg";

    if (!mimeType || mimeType === "application/octet-stream") {
        const extension = name?.split(".").pop()?.toLowerCase();
        switch (extension) {
            case "ogg": mimeType = "audio/ogg"; break;
            case "mp3": mimeType = "audio/mpeg"; break;
            case "wav": mimeType = "audio/wav"; break;
            case "m4a":
            case "mp4": mimeType = "audio/mp4"; break;
            case "flac": mimeType = "audio/flac"; break;
            case "aac": mimeType = "audio/aac"; break;
            case "webm": mimeType = "audio/webm"; break;
            case "wma": mimeType = "audio/x-ms-wma"; break;
            default: mimeType = "audio/mpeg";
        }
    }

    return mimeType;
}

function readFileAsDataURI(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio file."));
        reader.readAsDataURL(file);
    });
}

function normalizeStoredAudioFile(id: string, value: unknown): StoredAudioFile | null {
    if (!value || typeof value !== "object") return null;

    const raw = value as Partial<StoredAudioFile>;
    const name = typeof raw.name === "string" && raw.name ? raw.name : "Custom sound";
    const type = getAudioMimeType(typeof raw.type === "string" ? raw.type : undefined, name);
    const dataUri = typeof raw.dataUri === "string" && raw.dataUri.startsWith("data:audio/") ? raw.dataUri : undefined;

    if (dataUri) {
        if (dataUri.length > MAX_DATA_URI_CHARS) return null;

        return {
            id: typeof raw.id === "string" && raw.id ? raw.id : id,
            name,
            type,
            dataUri
        };
    }

    if (raw.buffer instanceof ArrayBuffer) {
        if (raw.buffer.byteLength > MAX_AUDIO_FILE_BYTES) return null;

        return {
            id: typeof raw.id === "string" && raw.id ? raw.id : id,
            name,
            type,
            buffer: raw.buffer
        };
    }

    return null;
}

async function generateDataURI(buffer: ArrayBuffer, type: string, name: string): Promise<string> {
    try {
        const mimeType = getAudioMimeType(type, name);
        const uint8Array = new Uint8Array(buffer);
        const blob = new Blob([uint8Array], { type: mimeType });

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("[CustomSounds] Error generating data URI:", error);

        const uint8Array = new Uint8Array(buffer);
        let binary = "";
        const chunkSize = 8192;

        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }

        const base64 = btoa(binary);
        return `data:${getAudioMimeType(type, name)};base64,${base64}`;
    }
}

export async function getAudioDataURI(id: string): Promise<string | undefined> {
    const all = await getAllAudio();
    const entry = all[id];
    if (!entry) return undefined;

    if (entry.dataUri) {
        return entry.dataUri;
    }

    console.log(`[CustomSounds] No cached data URI for ${id}, generating...`);
    if (!(entry.buffer instanceof ArrayBuffer)) {
        console.warn(`[CustomSounds] Saved audio file ${id} has no valid ArrayBuffer`);
        return undefined;
    }

    const dataUri = await generateDataURI(entry.buffer, entry.type, entry.name);

    const current = await getAllAudio();
    if (!current[id]) return dataUri;

    current[id] = {
        id: current[id].id,
        name: current[id].name,
        type: current[id].type,
        dataUri
    };
    await set(STORAGE_KEY, current);

    return dataUri;
}

export async function deleteAudio(id: string): Promise<void> {
    const all = await getAllAudio();
    delete all[id];
    await set(STORAGE_KEY, all);
}

export async function clearAudioStore(): Promise<void> {
    await set(STORAGE_KEY, {});
}
