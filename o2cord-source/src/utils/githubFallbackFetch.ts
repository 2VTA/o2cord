/*
 * o2cord
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// raw.githubusercontent.com rate-limits by IP, shared across everyone behind
// the same NAT/ISP - a busy shared IP can get 429'd even though this app's
// own request volume is trivial. jsDelivr's GitHub CDN mirror exists
// specifically to route around that, so any raw.githubusercontent.com fetch
// that fails falls back to it automatically before giving up. This is the
// renderer-side counterpart to main/utils/http.ts's checkedFetch.
function toJsDelivrMirror(url: string): string | null {
    const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/([^?]+)/);
    if (!match) return null;

    const [, owner, repo, branch, path] = match;
    return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

export async function fetchWithGithubFallback(url: string, options?: RequestInit): Promise<Response> {
    try {
        const res = await fetch(url, options);
        if (res.ok) return res;
        throw new Error(`HTTP ${res.status}`);
    } catch (err) {
        const mirror = toJsDelivrMirror(url);
        if (!mirror) throw err;

        const res = await fetch(mirror, options);
        if (!res.ok) throw err;
        return res;
    }
}
