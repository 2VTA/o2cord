/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Custom Profile's catalogues of avatar decorations, profile effects and profile frames.
 *
 * The built-in lists (the ones Ryder picked by hand) are always there. On top of them
 * the plugin asks Discord's own collectibles catalogue - the same request the shop makes,
 * through the client's own RestAPI helper - and adds everything that is in it: ~700
 * decorations, ~370 effects, ~70 frames. The answer is kept in DataStore, so the next
 * start has them at once and the shop is only asked again after 12 hours.
 *
 * A private plugin can add its own entries with registerCustom*() - they live only in
 * memory while that plugin runs, so nothing private ever ends up in this (public) file.
 */

import * as DataStore from "@api/DataStore";
import { RestAPI } from "@webpack/common";

import { CustomProfileEffect, PROFILE_EFFECTS } from "./profileEffects";
import { CustomProfileFrame, PROFILE_FRAMES } from "./profileFrames";

export interface DecorationEntry {
    /** the collectibles-shop SKU id (what the picture address uses) */
    id: string;
    label: string;
    /** has an animated version - shown animated where Discord allows it */
    animated?: boolean;
    passthrough?: boolean;
}

export const AVATAR_DECORATIONS: DecorationEntry[] = [
    { id: "1144307957425778779", label: "Hearts" },
    { id: "1144308196723408958", label: "Hearts Animated" },
    { id: "1212569433839636530", label: "Lofi Cafe" },
    { id: "1481387347642810480", label: "Winter" },
    { id: "1343751617362661526", label: "Magic Orb" },
    { id: "1373015260465987705", label: "Dragon" },
    { id: "1333866045303423026", label: "Ghost" },
    { id: "1144308439720394944", label: "Sakura Drift" },
    { id: "1432550258126229565", label: "Neon" },
    { id: "1462116613632426014", label: "Cyber City" },
    { id: "1462116613682757888", label: "Retro" },
    { id: "1144307629225672846", label: "Fire" },
    { id: "1341506443718688768", label: "Void" },
    { id: "1447654090640330763", label: "Celestial" },
    { id: "1483857762890022923", label: "Snowy" },
    { id: "1479561706672885811", label: "Ice" },
    { id: "1212569856189407352", label: "Cozy" },
    { id: "1485784028710830242", label: "New Year" },
    { id: "1341506444150702080", label: "Abyss" },
    { id: "1232071712695386162", label: "Spring" },
    { id: "1220514048068812901", label: "Summer" },
    { id: "1427463138634109026", label: "Autumn" },
    { id: "1341506443865489408", label: "Darkness" }
];

/** Pictures for decorations that are not on Discord's servers (a private plugin's own): an animated one and a still one. */
const CUSTOM_DECORATION_URLS = new Map<string, { animated: string; still: string; }>();
export const getCustomDecorationUrl = (id: string, animated = false) => {
    const urls = CUSTOM_DECORATION_URLS.get(id);
    return urls ? (animated ? urls.animated : urls.still) : undefined;
};
/** Our own ids are "o2-..." - on somebody else's computer they mean nothing, so they are never drawn there. */
export const isPrivateId = (id: string) => id.startsWith("o2-");

/** Pictures for the layers of frames that only exist in a private plugin: frame sku -> layer id -> picture address. */
const CUSTOM_FRAME_LAYERS = new Map<string, Map<string, string>>();
const CUSTOM_FRAME_THUMBS = new Map<string, string>();
export const getCustomLayerUrl = (skuId: string, layerId: string) => CUSTOM_FRAME_LAYERS.get(skuId)?.get(layerId);
export const getCustomFrameThumb = (skuId: string) => CUSTOM_FRAME_THUMBS.get(skuId);

const listeners = new Set<() => void>();
const changed = () => { for (const fn of listeners) { try { fn(); } catch { /* a listener must not stop the others */ } } };
export function onCatalogChange(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}

export function registerCustomDecoration(entry: DecorationEntry, urls: { animated: string; still: string; }) {
    CUSTOM_DECORATION_URLS.set(entry.id, urls);
    if (!AVATAR_DECORATIONS.some(d => d.id === entry.id)) AVATAR_DECORATIONS.unshift(entry);
    changed();
}

export function registerCustomFrame(frame: CustomProfileFrame, layerUrls: Record<string, string>, thumb?: string) {
    CUSTOM_FRAME_LAYERS.set(frame.skuId, new Map(Object.entries(layerUrls)));
    if (thumb) CUSTOM_FRAME_THUMBS.set(frame.skuId, thumb);
    if (!PROFILE_FRAMES.some(f => f.skuId === frame.skuId)) PROFILE_FRAMES.unshift(frame);
    changed();
}

export function registerCustomEffect(effect: CustomProfileEffect) {
    if (!PROFILE_EFFECTS.some(e => e.id === effect.id)) PROFILE_EFFECTS.unshift(effect);
    changed();
}

export function unregisterCustom(ids: string[]) {
    for (const id of ids) {
        CUSTOM_DECORATION_URLS.delete(id);
        const d = AVATAR_DECORATIONS.findIndex(x => x.id === id);
        if (d >= 0) AVATAR_DECORATIONS.splice(d, 1);
        const e = PROFILE_EFFECTS.findIndex(x => x.id === id);
        if (e >= 0) PROFILE_EFFECTS.splice(e, 1);
        const fr = PROFILE_FRAMES.findIndex(x => x.skuId === id);
        if (fr >= 0) PROFILE_FRAMES.splice(fr, 1);
        CUSTOM_FRAME_LAYERS.delete(id);
        CUSTOM_FRAME_THUMBS.delete(id);
    }
    changed();
}

// ---- Discord's shop

const CACHE_KEY = "customProfile_shopCatalog_v1";
const MAX_AGE = 12 * 60 * 60 * 1000;

interface ShopSnapshot {
    at: number;
    decorations: DecorationEntry[];
    effects: CustomProfileEffect[];
    frames: CustomProfileFrame[];
}

function parseShop(categories: any[]): Omit<ShopSnapshot, "at"> {
    const decorations: DecorationEntry[] = [];
    const effects: CustomProfileEffect[] = [];
    const frames: CustomProfileFrame[] = [];
    const seen = new Set<string>();

    for (const category of categories ?? []) {
        for (const product of category?.products ?? []) {
            const item = product?.items?.[0];
            if (!item?.sku_id || seen.has(item.sku_id)) continue;

            if (product.type === 0) {
                seen.add(item.sku_id);
                decorations.push({ id: item.sku_id, label: product.name ?? "Decoration", animated: typeof item.asset === "string" && item.asset.startsWith("a_") });
            } else if (product.type === 1) {
                seen.add(item.sku_id);
                effects.push({
                    type: 1,
                    id: item.sku_id,
                    skuId: item.sku_id,
                    title: item.title ?? product.name ?? "Effect",
                    description: item.description,
                    accessibilityLabel: item.accessibilityLabel,
                    animationType: item.animationType ?? 2,
                    thumbnailPreviewSrc: item.thumbnailPreviewSrc,
                    reducedMotionSrc: item.reducedMotionSrc,
                    effects: item.effects ?? []
                });
            } else if (product.type === 3 && Array.isArray(item.layers)) {
                seen.add(item.sku_id);
                frames.push({
                    skuId: item.sku_id,
                    title: product.name ?? "Frame",
                    label: item.label ?? product.name ?? "",
                    layers: item.layers,
                    innerWidth: item.inner_width,
                    overflowTop: item.overflow_top,
                    overflowBottom: item.overflow_bottom,
                    overflowHorizontal: item.overflow_horizontal,
                    type: 3
                });
            }
        }
    }
    return { decorations, effects, frames };
}

/** Adds what is not in the lists yet (the built-in entries always win). */
function merge(snapshot: Omit<ShopSnapshot, "at">) {
    const haveDeco = new Map(AVATAR_DECORATIONS.map(d => [d.id, d]));
    for (const d of snapshot.decorations ?? []) {
        const have = haveDeco.get(d.id);
        if (!have) AVATAR_DECORATIONS.push(d);
        else if (d.animated) have.animated = true; // a built-in entry the shop says can animate
    }

    const haveEffect = new Set(PROFILE_EFFECTS.flatMap(e => [e.id, e.skuId]));
    for (const e of snapshot.effects ?? []) if (!haveEffect.has(e.id) && !haveEffect.has(e.skuId)) PROFILE_EFFECTS.push(e);

    const haveFrame = new Set(PROFILE_FRAMES.map(f => f.skuId));
    for (const f of snapshot.frames ?? []) if (!haveFrame.has(f.skuId)) PROFILE_FRAMES.push(f);
}

let started = false;
let refreshing: Promise<void> | null = null;

async function refresh() {
    const res = await RestAPI.get({ url: "/collectibles-categories" });
    const snapshot = parseShop(res.body);
    // an empty answer is not a catalogue - keep what we have
    if (!snapshot.decorations.length && !snapshot.effects.length && !snapshot.frames.length) return;
    merge(snapshot);
    await DataStore.set(CACHE_KEY, { at: Date.now(), ...snapshot } satisfies ShopSnapshot).catch(() => { });
    changed();
}

/** Loads the saved catalogue at once, then asks the shop again if the saved one is old. Never throws. */
export async function initShopCatalog() {
    if (started) return;
    started = true;
    let cached: ShopSnapshot | undefined;
    try {
        cached = await DataStore.get<ShopSnapshot>(CACHE_KEY);
        if (cached) { merge(cached); changed(); }
    } catch { /* no saved catalogue - the shop answers below */ }

    if (!cached || Date.now() - cached.at > MAX_AGE) {
        refreshing ??= refresh().catch(() => { }).finally(() => { refreshing = null; });
        await refreshing;
    }
}

export function stopShopCatalog() {
    started = false;
}
