/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Small shared module (not living in Vencord.ts itself) so both Vencord.ts
 * and o2Settings can import it without tripping the circular-dependency
 * issue Vencord.ts warns about at its own top (it imports "~plugins" first,
 * which includes o2Settings - a plugin importing back from Vencord.ts
 * directly would be circular).
 */

import { Settings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { UserStore } from "@webpack/common";

export function syncOwnerThemeClass() {
    // Owner-only: o2Settings' "Enable Custom Theme" switch is visible to
    // everyone and calls this too, so check here rather than trusting callers.
    // Also off while RetroTerminal or VHS is on - the glass would fight their look.
    const isOwner = UserStore?.getCurrentUser?.()?.id === String(Devs.Ryder.id);
    const enabled = isOwner
        && Settings.plugins.o2Settings?.enableTheme !== false
        && !Settings.plugins.RetroTerminal?.enabled
        && !Settings.plugins.VHS?.enabled
        && !Settings.plugins.SplatInk?.enabled
        && !Settings.plugins.o2Settings?.viceCity;
    const has = document.documentElement.classList.contains("o2-owner-theme");
    if (enabled && !has) { applyGlassLook(); document.documentElement.classList.add("o2-owner-theme"); }
    if (!enabled && has) document.documentElement.classList.remove("o2-owner-theme");
}

// ---- the knobs of the glass look (Themes page > Liquid Glass) ----

export const GLASS_DEFAULTS = { glassBlur: 22, glassSat: 170, glassTint: 30, glassEdge: 100, glassRadius: 20, glassColor: "18, 18, 24", glassBackdrop: "none" };

/** named looks, each only changes the knobs */
export const GLASS_PRESETS: Record<string, { title: string; values: typeof GLASS_DEFAULTS; }> = {
    frosted: { title: "Frosted", values: { ...GLASS_DEFAULTS } },
    crystal: { title: "Crystal", values: { glassBlur: 28, glassSat: 200, glassTint: 16, glassEdge: 140, glassRadius: 24, glassColor: "24, 30, 44", glassBackdrop: "aurora" } },
    smoke: { title: "Smoke", values: { glassBlur: 18, glassSat: 130, glassTint: 58, glassEdge: 70, glassRadius: 16, glassColor: "6, 6, 8", glassBackdrop: "none" } },
    fast: { title: "Light on the GPU", values: { glassBlur: 8, glassSat: 120, glassTint: 42, glassEdge: 60, glassRadius: 16, glassColor: "14, 14, 18", glassBackdrop: "none" } }
};

export const GLASS_COLORS: { title: string; rgb: string; }[] = [
    { title: "Slate", rgb: "18, 18, 24" },
    { title: "Ink", rgb: "4, 4, 6" },
    { title: "Ocean", rgb: "10, 26, 52" },
    { title: "Plum", rgb: "36, 16, 44" },
    { title: "Forest", rgb: "10, 32, 24" },
    { title: "Ember", rgb: "46, 20, 12" }
];

/** a soft colour glow painted behind the whole app, so the glass has something to be glass over */
export const GLASS_BACKDROPS: Record<string, { title: string; css: string; }> = {
    none: { title: "None", css: "linear-gradient(transparent, transparent)" },
    aurora: { title: "Aurora", css: "radial-gradient(60% 50% at 15% 10%, rgba(80, 120, 255, 0.30), transparent 70%), radial-gradient(50% 45% at 85% 20%, rgba(170, 90, 255, 0.24), transparent 70%), radial-gradient(60% 50% at 70% 95%, rgba(40, 200, 190, 0.22), transparent 70%)" },
    dusk: { title: "Dusk", css: "radial-gradient(60% 50% at 10% 15%, rgba(255, 120, 90, 0.28), transparent 70%), radial-gradient(55% 50% at 90% 25%, rgba(255, 80, 160, 0.24), transparent 70%), radial-gradient(60% 50% at 60% 100%, rgba(120, 80, 255, 0.22), transparent 70%)" },
    mint: { title: "Mint", css: "radial-gradient(60% 50% at 20% 10%, rgba(60, 220, 160, 0.26), transparent 70%), radial-gradient(55% 50% at 90% 30%, rgba(60, 160, 255, 0.22), transparent 70%), radial-gradient(60% 50% at 50% 100%, rgba(20, 120, 100, 0.26), transparent 70%)" }
};

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
};

/** writes the knobs onto the page (called on start, when one is changed, and when the theme turns on) */
export function applyGlassLook() {
    const st = (Settings.plugins.o2Settings ?? {}) as Record<string, any>;
    const root = document.documentElement.style;
    root.setProperty("--o2g-blur", clamp(st.glassBlur, 0, 40, GLASS_DEFAULTS.glassBlur) + "px");
    root.setProperty("--o2g-sat", clamp(st.glassSat, 100, 260, GLASS_DEFAULTS.glassSat) + "%");
    root.setProperty("--o2g-tint", String(clamp(st.glassTint, 0, 90, GLASS_DEFAULTS.glassTint) / 100));
    root.setProperty("--o2g-edge", String(clamp(st.glassEdge, 0, 180, GLASS_DEFAULTS.glassEdge) / 100));
    root.setProperty("--o2g-radius", clamp(st.glassRadius, 0, 32, GLASS_DEFAULTS.glassRadius) + "px");
    const rgb = String(st.glassColor ?? GLASS_DEFAULTS.glassColor);
    root.setProperty("--o2g-backdrop", (GLASS_BACKDROPS[String(st.glassBackdrop ?? "none")] ?? GLASS_BACKDROPS.none).css);
    document.documentElement.classList.toggle("o2-glass-noblur", !!st.disableBlur);
    root.setProperty("--o2g-tint-rgb", /^\d{1,3}, \d{1,3}, \d{1,3}$/.test(rgb) ? rgb : GLASS_DEFAULTS.glassColor);
}
