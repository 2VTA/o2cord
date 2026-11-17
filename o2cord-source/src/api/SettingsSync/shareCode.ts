/*
 * o2cord - share code: your plugin setup as one short piece of text you can paste to a friend.
 * Unlike the backup file this is made to be SENT, so anything that looks like a secret is dropped
 * and plugins that are private to the o2cord owner are never included.
 */

import { PlainSettings } from "@api/Settings";

const PREFIX = "o2cord1:";

// plugins that exist only in the owner's build are never put in a code someone else will read. They are matched by a hash
// of the name (not the name itself) so the public build never contains the private names.
const hashName = (s: string) => { let x = 5381; for (const c of s.toLowerCase()) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0; return x.toString(16); };
const PRIVATE_HASHES = new Set(["e8eb0e01", "c7f27eb9", "e672eda", "fcc84a58", "b1c11a6c", "1d4fe6b3", "abc33a67", "de222fd5", "6bcd3a41", "ca35d261", "cadd05aa"]);
const isPrivate = (name: string) => PRIVATE_HASHES.has(hashName(name));

// option names that may hold a token, key or private link
const SECRET_KEY = /token|secret|passw|webhook|api[-_ ]?key|cookie|authoriz|session|credential|bearer|license/i;

export interface SharePart { plugins: boolean; themes: boolean; css: boolean; }

export interface ShareSummary { plugins: number; themes: number; css: boolean; }

interface ShareData {
    v: 1;
    plugins?: Record<string, any>;
    themeLinks?: string[];
    enabledThemes?: string[];
    css?: string;
}

function scrub(value: any): any {
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
            if (SECRET_KEY.test(k)) continue;
            out[k] = scrub(v);
        }
        return out;
    }
    return value;
}

function isSafe(obj: any): boolean {
    if (obj == null || typeof obj !== "object") return true;
    for (const key of Object.keys(obj)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") return false;
        if (!isSafe(obj[key])) return false;
    }
    return true;
}

// ---- text <-> base64url, deflated so a big setup stays short ----

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    // write and read at the same time, and wait for both - an unawaited write left a failed code hanging or unhandled
    const writer = stream.writable.getWriter();
    const writing = writer.write(bytes as BufferSource).then(() => writer.close());
    const [out] = await Promise.all([new Response(stream.readable).arrayBuffer(), writing]);
    return new Uint8Array(out);
}

function toB64Url(bytes: Uint8Array) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(text: string) {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - b64.length % 4) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export function summarize(data: ShareData): ShareSummary {
    return {
        plugins: Object.keys(data.plugins ?? {}).length,
        themes: (data.themeLinks?.length ?? 0) + (data.enabledThemes?.length ?? 0),
        css: !!data.css?.trim()
    };
}

export async function makeShareCode(parts: SharePart): Promise<{ code: string; summary: ShareSummary; }> {
    const settings: any = VencordNative.settings.get();
    const data: ShareData = { v: 1 };

    if (parts.plugins) {
        data.plugins = {};
        for (const [name, entry] of Object.entries<any>(settings.plugins ?? {})) {
            if (isPrivate(name) || !entry || typeof entry !== "object") continue;
            if (!entry.enabled && Object.keys(entry).length <= 1) continue; // nothing worth sharing
            data.plugins[name] = scrub(entry);
        }
    }
    if (parts.themes) {
        // themes by link only - a link that carries a key (?token=...) is left out
        data.themeLinks = (settings.themeLinks ?? []).filter((l: string) => /^https?:\/\//i.test(l) && !SECRET_KEY.test(l));
        data.enabledThemes = (settings.enabledThemes ?? []).filter((t: string) => !SECRET_KEY.test(t));
    }
    if (parts.css) data.css = await VencordNative.quickCss.get();

    const packed = await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream("deflate-raw"));
    return { code: PREFIX + toB64Url(packed), summary: summarize(data) };
}

export async function readShareCode(code: string): Promise<ShareData> {
    // spaces and line breaks can sneak in when a long code is pasted from a chat: they are never part of a code
    const text = code.replace(/\s+/g, "");
    if (!text.startsWith(PREFIX)) throw new Error("This doesn't look like an o2cord share code");
    let data: ShareData;
    try {
        const raw = await pipe(fromB64Url(text.slice(PREFIX.length)), new DecompressionStream("deflate-raw"));
        data = JSON.parse(new TextDecoder().decode(raw));
    } catch {
        throw new Error("The code is damaged - copy it again, all of it");
    }
    if (!data || data.v !== 1 || !isSafe(data)) throw new Error("Unsupported or unsafe code");
    return data;
}

/** Merges the chosen parts into the current setup; the rest of your settings stay as they are. */
export async function applyShareCode(data: ShareData, parts: SharePart): Promise<ShareSummary> {
    const current: any = VencordNative.settings.get();
    const next: any = { ...current };

    if (parts.plugins && data.plugins) {
        next.plugins = { ...(current.plugins ?? {}) };
        for (const [name, entry] of Object.entries<any>(data.plugins)) {
            if (isPrivate(name) || !entry || typeof entry !== "object") continue;
            next.plugins[name] = { ...(current.plugins?.[name] ?? {}), ...scrub(entry) };
        }
    }
    if (parts.themes) {
        const links = new Set<string>([...(current.themeLinks ?? []), ...(data.themeLinks ?? [])]);
        const themes = new Set<string>([...(current.enabledThemes ?? []), ...(data.enabledThemes ?? [])]);
        next.themeLinks = [...links];
        next.enabledThemes = [...themes];
    }

    Object.assign(PlainSettings, next);
    await VencordNative.settings.set(next);
    if (parts.css && data.css?.trim()) {
        const old = (await VencordNative.quickCss.get()).trim();
        // adds to your CSS instead of replacing it, and only once
        if (!old.includes(data.css.trim())) {
            await VencordNative.quickCss.set(`${old}${old ? "\n\n" : ""}/* from a share code */\n${data.css.trim()}\n`);
        }
    }
    return summarize({ ...data, plugins: parts.plugins ? data.plugins : undefined, themeLinks: parts.themes ? data.themeLinks : undefined, enabledThemes: parts.themes ? data.enabledThemes : undefined, css: parts.css ? data.css : undefined });
}
