/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Ink splats drawn from numbers: a wobbly blob (a smooth closed curve through
 * points at uneven distances, a few of them pushed out into drips) with loose
 * droplets around it. The same seed always gives the same splat, so the
 * panels don't change shape on every refresh.
 */

/** Small seeded random (mulberry32). */
function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const f = (n: number) => +n.toFixed(1);

/** SVG markup of one splat in a 200x200 box. */
export function splatSvg(color: string, seed: number, opacity = 1): string {
    const rand = rng(seed);
    const cx = 100, cy = 100, R = 46;
    const n = 16;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rand() * 0.18;
        let r = R * (0.78 + rand() * 0.32);
        if (rand() < 0.22) r *= 1.32 + rand() * 0.3; // a drip pushed out
        pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    // closed Catmull-Rom curve through the points, as cubic Beziers
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
    }
    let drops = "";
    const count = 5 + Math.floor(rand() * 5);
    for (let i = 0; i < count; i++) {
        const ang = rand() * Math.PI * 2;
        const dist = R * (1.25 + rand() * 0.75);
        const r = R * (0.05 + rand() * 0.13);
        drops += `<circle cx="${f(cx + Math.cos(ang) * dist)}" cy="${f(cy + Math.sin(ang) * dist)}" r="${f(r)}"/>`;
    }
    // one long drip running down
    const dx = cx + (rand() - 0.5) * R;
    const len = R * (0.6 + rand() * 0.6);
    drops += `<rect x="${f(dx - 5)}" y="${f(cy + R * 0.5)}" width="10" height="${f(len)}" rx="5"/><circle cx="${f(dx)}" cy="${f(cy + R * 0.5 + len)}" r="8"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g fill="${color}" fill-opacity="${opacity}"><path d="${d}Z"/>${drops}</g></svg>`;
}

/** The splat as a CSS url(...) value. */
export function splatUrl(color: string, seed: number, opacity = 1): string {
    return `url("data:image/svg+xml,${encodeURIComponent(splatSvg(color, seed, opacity))}")`;
}

/**
 * SplatInk's loading logo: a lime splat with a pink one on top and a shine,
 * drawn as one picture (the CSS spins and squishes it).
 */
export function logoUrl(a: string, b: string): string {
    const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">`
        + `<g transform="translate(100 100) rotate(35) scale(1.08) translate(-100 -100)">${inner(splatSvg(b, 90))}</g>`
        + `<g transform="translate(100 100) scale(0.86) translate(-100 -100)">${inner(splatSvg(a, 91))}</g>`
        + `<ellipse cx="84" cy="80" rx="14" ry="9" transform="rotate(-30 84 80)" fill="#fff" fill-opacity="0.85"/>`
        + `<circle cx="104" cy="70" r="4.5" fill="#fff" fill-opacity="0.85"/>`
        + `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
