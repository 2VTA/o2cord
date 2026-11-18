/*
 * o2cord - share code: your plugin setup as short text you can paste to a friend.
 * Unlike the backup file this is made to be SENT, so anything that looks like a secret is dropped
 * and plugins that are private to the o2cord owner are never included.
 *
 * Format 2 (o2cord2:) was made for chat apps:
 *  - only what differs from a plugin's defaults is sent (a normal setup is ~2 KB, not 20 KB)
 *  - letters and digits only, so chat formatting can't eat characters (the old "_" and "-" did get eaten)
 *  - cut into parts of at most 1800 characters (Discord messages stop at 2000); each part says "2/3"
 *  - a checksum tells you if anything was changed or cut on the way
 * Format 1 (o2cord1:) codes from older versions can still be applied.
 */

import { plugins } from "@api/PluginManager";
import { PlainSettings } from "@api/Settings";

const PREFIX_V1 = "o2cord1:";
const PREFIX_V2 = "o2cord2:";
const PART_SIZE = 1800;
const CHECK_LEN = 7;
const MAX_VALUE = 1500; // longer values (pictures, sound files) are not put in a code: use the backup file for those

// plugins that exist only in the owner's build are never put in a code someone else will read. They are matched by a hash
// of the name (not the name itself) so the public build never contains the private names.
const hashName = (s: string) => { let x = 5381; for (const c of s.toLowerCase()) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0; return x.toString(16); };
const PRIVATE_HASHES = new Set(["e8eb0e01", "c7f27eb9", "e672eda", "fcc84a58", "b1c11a6c", "1d4fe6b3", "abc33a67", "de222fd5", "6bcd3a41", "ca35d261", "cadd05aa"]);
const isPrivate = (name: string) => PRIVATE_HASHES.has(hashName(name));

// option names that may hold a token, key or private link
const SECRET_KEY = /token|secret|passw|webhook|api[-_ ]?key|cookie|authoriz|session|credential|bearer|license/i;

export interface SharePart { plugins: boolean; themes: boolean; css: boolean; }

export interface ShareSummary { plugins: number; themes: number; css: boolean; skipped: number; }

interface ShareData {
    v: 1;
    plugins?: Record<string, any>;
    themeLinks?: string[];
    enabledThemes?: string[];
    css?: string;
    skipped?: number;
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

// ---- what is worth sending: only what the user changed

function slimPlugins(src: Record<string, any>): { out: Record<string, any>; skipped: number; } {
    const out: Record<string, any> = {};
    let skipped = 0;
    for (const [name, entry] of Object.entries<any>(src ?? {})) {
        if (isPrivate(name) || !entry || typeof entry !== "object") continue;
        const p: any = (plugins as any)[name];
        if (p?.required || /API$/.test(name)) continue; // internal plugins: nothing to share
        const def: Record<string, any> = p?.settings?.def ?? {};
        const slim: Record<string, any> = {};

        const onByDefault = !!p?.enabledByDefault;
        if (typeof entry.enabled === "boolean" && entry.enabled !== onByDefault) slim.enabled = entry.enabled;

        for (const [key, value] of Object.entries(entry)) {
            if (key === "enabled" || value === undefined || SECRET_KEY.test(key)) continue;
            const d = def[key];
            if (d && "default" in d && JSON.stringify(d.default) === JSON.stringify(value)) continue; // same as the default
            if (JSON.stringify(value).length > MAX_VALUE) { skipped++; continue; }
            slim[key] = value;
        }
        if (Object.keys(slim).length) out[name] = scrub(slim);
    }
    return { out, skipped };
}

// ---- text <-> compressed bytes

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    // write and read at the same time, and wait for both - an unawaited write left a failed code hanging or unhandled
    const writer = stream.writable.getWriter();
    const writing = writer.write(bytes as BufferSource).then(() => writer.close());
    const [out] = await Promise.all([new Response(stream.readable).arrayBuffer(), writing]);
    return new Uint8Array(out);
}

// format 1 (kept for reading old codes)
function fromB64Url(text: string) {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - b64.length % 4) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// format 2: base 62 (0-9 A-Z a-z)
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function toBase62(bytes: Uint8Array): string {
    let n = 1n; // a leading 1 keeps leading zero bytes
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    const digits: string[] = [];
    while (n > 0n) { digits.push(ALPHABET[Number(n % 62n)]); n /= 62n; }
    return digits.reverse().join("");
}

function fromBase62(text: string): Uint8Array {
    let n = 0n;
    for (const ch of text) {
        const i = ALPHABET.indexOf(ch);
        if (i < 0) throw new Error("bad character");
        n = n * 62n + BigInt(i);
    }
    let hex = n.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (bytes[0] !== 1) throw new Error("bad start");
    return bytes.slice(1);
}

function checksum(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36).padStart(CHECK_LEN, "0").slice(-CHECK_LEN);
}

export function summarize(data: ShareData): ShareSummary {
    return {
        plugins: Object.keys(data.plugins ?? {}).length,
        themes: (data.themeLinks?.length ?? 0) + (data.enabledThemes?.length ?? 0),
        css: !!data.css?.trim(),
        skipped: data.skipped ?? 0
    };
}

/** code = everything to put on the clipboard; parts = the pieces (send each as its own message) */
export async function makeShareCode(parts: SharePart): Promise<{ code: string; parts: string[]; summary: ShareSummary; }> {
    const settings: any = VencordNative.settings.get();
    const data: ShareData = { v: 1 };

    if (parts.plugins) {
        const { out, skipped } = slimPlugins(settings.plugins ?? {});
        data.plugins = out;
        data.skipped = skipped;
    }
    if (parts.themes) {
        // themes by link only - a link that carries a key (?token=...) is left out
        data.themeLinks = (settings.themeLinks ?? []).filter((l: string) => /^https?:\/\//i.test(l) && !SECRET_KEY.test(l));
        data.enabledThemes = (settings.enabledThemes ?? []).filter((t: string) => !SECRET_KEY.test(t));
    }
    if (parts.css) data.css = await VencordNative.quickCss.get();

    const packed = await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream("deflate-raw"));
    const payload = toBase62(packed);
    const body = payload + checksum(payload);
    const pieces = body.match(new RegExp(`.{1,${PART_SIZE}}`, "g")) ?? [body];
    const out = pieces.map((p, i) => `${PREFIX_V2}${i + 1}/${pieces.length}:${p}`);
    return { code: out.join("\n\n"), parts: out, summary: summarize(data) };
}

const DAMAGED_HELP = "copy it again, all of it. In chat, send it as a code block or a file, and send each part as its own message";

async function readV2(text: string): Promise<ShareData> {
    const found = new Map<number, string>();
    let total = 0;
    for (const chunk of text.split(PREFIX_V2).slice(1)) {
        const m = /^\s*(\d+)\s*\/\s*(\d+)\s*:([\s\S]*)$/.exec(chunk);
        if (!m) throw new Error(`A part of the code has no number (like 1/2) - ${DAMAGED_HELP}`);
        const index = Number(m[1]), count = Number(m[2]);
        if (!total) total = count;
        if (count !== total) throw new Error("These parts belong to different codes - paste the parts of one code only");
        found.set(index, m[3].replace(/[^0-9A-Za-z]/g, ""));
    }
    if (!total || total > 50) throw new Error(`The code is not complete - ${DAMAGED_HELP}`);
    const missing: number[] = [];
    for (let i = 1; i <= total; i++) if (!found.has(i)) missing.push(i);
    if (missing.length) throw new Error(`Part ${missing.join(", ")} of ${total} is missing - paste all ${total} parts (each starts with ${PREFIX_V2})`);

    const body = Array.from({ length: total }, (_, i) => found.get(i + 1)).join("");
    const payload = body.slice(0, -CHECK_LEN);
    if (body.length <= CHECK_LEN || checksum(payload) !== body.slice(-CHECK_LEN))
        throw new Error(`The code was changed or cut while copying - ${DAMAGED_HELP}`);
    try {
        const raw = await pipe(fromBase62(payload), new DecompressionStream("deflate-raw"));
        return JSON.parse(new TextDecoder().decode(raw));
    } catch {
        throw new Error("The code can't be read (it may come from a newer o2cord) - update o2cord on both sides");
    }
}

export async function readShareCode(code: string): Promise<ShareData> {
    let data: ShareData;
    if (code.includes(PREFIX_V2)) {
        data = await readV2(code);
    } else {
        // format 1: spaces and line breaks can sneak in when a long code is pasted from a chat: they are never part of a code
        const text = code.replace(/\s+/g, "");
        if (!text.startsWith(PREFIX_V1)) throw new Error("This doesn't look like an o2cord share code (it starts with o2cord2: or o2cord1:)");
        try {
            const raw = await pipe(fromB64Url(text.slice(PREFIX_V1.length)), new DecompressionStream("deflate-raw"));
            data = JSON.parse(new TextDecoder().decode(raw));
        } catch {
            throw new Error("The code is damaged - copy it again, all of it. Old-style codes lose characters in chat: ask for a new one");
        }
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
