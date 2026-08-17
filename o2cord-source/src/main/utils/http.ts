/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { createWriteStream } from "original-fs";
import { Readable } from "stream";
import { finished } from "stream/promises";

type Url = string | URL;

// raw.githubusercontent.com rate-limits by IP, and that limit is shared by
// everyone behind the same NAT/ISP - a busy shared IP can get 429'd even
// though this app's own request volume is trivial. jsDelivr's GitHub CDN
// mirror exists specifically to route around that, so any raw.githubusercontent.com
// fetch that fails falls back to it automatically before giving up.
function toJsDelivrMirror(url: string): string | null {
    const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!match) return null;

    const [, owner, repo, branch, path] = match;
    return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

async function checkedFetchOnce(url: string, options?: RequestInit) {
    try {
        var res = await fetch(url, options);
    } catch (err) {
        if (err instanceof Error && err.cause) {
            err = err.cause;
        }

        throw new Error(`${options?.method ?? "GET"} ${url} failed: ${err}`);
    }

    if (res.ok) {
        return res;
    }

    let message = `${options?.method ?? "GET"} ${url}: ${res.status} ${res.statusText}`;
    try {
        const reason = await res.text();
        message += `\n${reason}`;
    } catch { }

    throw new Error(message);
}

export async function checkedFetch(url: Url, options?: RequestInit) {
    const urlStr = url.toString();

    try {
        return await checkedFetchOnce(urlStr, options);
    } catch (err) {
        const mirror = toJsDelivrMirror(urlStr);
        if (!mirror) throw err;

        try {
            return await checkedFetchOnce(mirror, options);
        } catch {
            throw err;
        }
    }
}

export async function fetchJson<T = any>(url: Url, options?: RequestInit) {
    const res = await checkedFetch(url, options);
    return res.json() as Promise<T>;
}

export async function fetchBuffer(url: Url, options?: RequestInit) {
    const res = await checkedFetch(url, options);
    const buf = await res.arrayBuffer();

    return Buffer.from(buf);
}

export async function downloadToFile(url: Url, path: string, options?: RequestInit) {
    const res = await checkedFetch(url, options);
    if (!res.body) {
        throw new Error(`Download ${url}: response body is empty`);
    }

    // @ts-expect-error weird type conflict
    const body = Readable.fromWeb(res.body);
    await finished(body.pipe(createWriteStream(path)));
}
