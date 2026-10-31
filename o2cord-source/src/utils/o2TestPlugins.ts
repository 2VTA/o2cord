/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { localStorage } from "@utils/localStorage";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, Plugin } from "@utils/types";

import Plugins, { PluginMeta } from "~plugins";

/**
 * Plugins added from a .js file in "debug o2" instead of being built into o2cord.
 *
 *  - testing: added on this device only, shown with a TESTING tag. Whoever has
 *    debug o2 can add one; nobody else ever gets it.
 *  - published: Ryder pressed [publish] - Callie put the file in the repo
 *    (update-package/public/plugins) and every o2cord downloads it.
 *
 * Both are read from localStorage (it is synchronous, so they are in the plugin
 * list before the plugin manager starts) and need a restart to appear, like
 * any plugin with patches.
 *
 * A plugin file is plain JavaScript that calls definePlugin({ ... }) once.
 * definePluginSettings and OptionType are passed in too; everything else is on
 * the global Vencord object (Vencord.Webpack.Common, Vencord.Api, ...) once the
 * plugin's start() runs.
 */

export interface O2ExtraPlugin {
    name: string;
    description: string;
    code: string;
    addedAt: number;
    version?: number;
}

const TESTING_KEY = "o2cord-test-plugins";
const PUBLISHED_KEY = "o2cord-published-plugins";
const HIDDEN_KEY = "o2cord-hidden-plugins";

const PUBLISHED_BASE = "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/plugins";
export const MAX_PLUGIN_SIZE = 512 * 1024;
export const PLUGIN_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{1,39}$/;

export const O2_EXTRA_PLUGINS_UPDATED_EVENT = "o2cord-extra-plugins-updated";

const logger = new Logger("o2TestPlugins", "#f0b232");

function readList(key: string): O2ExtraPlugin[] {
    try {
        const list = JSON.parse(localStorage.getItem(key) ?? "[]");
        return Array.isArray(list)
            ? list.filter(p => p && typeof p.name === "string" && PLUGIN_NAME_RE.test(p.name) && typeof p.code === "string")
            : [];
    } catch {
        return [];
    }
}

function writeList(key: string, list: O2ExtraPlugin[]) {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(O2_EXTRA_PLUGINS_UPDATED_EVENT));
}

export const getTestingPlugins = () => readList(TESTING_KEY);
export const getPublishedPlugins = () => readList(PUBLISHED_KEY);

// what was actually loaded this launch - the rest waits for a restart
const loadedTesting = new Set<string>();
const loadedPublished = new Set<string>();

export const isTestingPlugin = (name: string) => loadedTesting.has(name);
export const isPublishedExtraPlugin = (name: string) => loadedPublished.has(name);
export const isLoadedExtraPlugin = (name: string) => loadedTesting.has(name) || loadedPublished.has(name);

// OptionType is a const enum (gone after the build), so plugin files get a real object
const PLUGIN_OPTION_TYPES = {
    STRING: OptionType.STRING,
    NUMBER: OptionType.NUMBER,
    BIGINT: OptionType.BIGINT,
    BOOLEAN: OptionType.BOOLEAN,
    SELECT: OptionType.SELECT,
    SLIDER: OptionType.SLIDER,
    COMPONENT: OptionType.COMPONENT,
    CUSTOM: OptionType.CUSTOM
};

/** Runs a plugin file and returns the plugin it defined (throws with a readable message otherwise). */
export function evaluatePluginCode(code: string): Plugin {
    let defined: Plugin | undefined;
    const capture = (p: any) => {
        if (defined) throw new Error("The file calls definePlugin more than once.");
        defined = definePlugin(p) as Plugin;
        return defined;
    };

    const run = new Function("definePlugin", "definePluginSettings", "OptionType", `"use strict";\n${code}\n//# sourceURL=o2cord-plugin.js`);
    const returned = run(capture, definePluginSettings, PLUGIN_OPTION_TYPES);
    const plugin = defined ?? returned;

    if (!plugin || typeof plugin !== "object") throw new Error("The file has to call definePlugin({ ... }).");
    if (typeof plugin.name !== "string" || !PLUGIN_NAME_RE.test(plugin.name))
        throw new Error("The plugin needs a name: letters, numbers or _, starting with a letter (2-40).");
    if (typeof plugin.description !== "string") plugin.description = "";
    if (!Array.isArray(plugin.authors)) plugin.authors = [];

    return plugin;
}

function register(entry: O2ExtraPlugin, kind: "testing" | "published") {
    if (Plugins[entry.name]) {
        logger.warn(`${entry.name} (${kind}) skipped - a plugin with that name already exists`);
        return;
    }

    try {
        const plugin = evaluatePluginCode(entry.code);
        if (plugin.name !== entry.name) throw new Error(`the file now defines ${plugin.name}`);

        // a tester adding a plugin wants to try it straight away
        if (kind === "testing" && plugin.enabledByDefault == null) plugin.enabledByDefault = true;

        Plugins[plugin.name] = plugin;
        PluginMeta[plugin.name] = { folderName: plugin.name, userPlugin: true };
        (kind === "testing" ? loadedTesting : loadedPublished).add(plugin.name);
    } catch (e) {
        logger.error(`Couldn't load ${kind} plugin ${entry.name}`, e);
    }
}

/** Called once from Vencord.ts, right before the plugin manager starts. */
export function loadO2ExtraPlugins() {
    // testing first: a tester trying a new version of a published plugin gets
    // their copy; the published one is skipped on that device only
    for (const p of getTestingPlugins()) register(p, "testing");
    for (const p of getPublishedPlugins()) register(p, "published");
}

// ---------------------------------------------------------------- testing (this device)

export function addTestingPlugin(code: string): O2ExtraPlugin {
    if (code.length > MAX_PLUGIN_SIZE) throw new Error("That file is too big (512 KB max).");

    const plugin = evaluatePluginCode(code);
    const { name } = plugin;
    if (Plugins[name] && !isLoadedExtraPlugin(name))
        throw new Error(`o2cord already has a plugin called ${name}.`);

    const entry: O2ExtraPlugin = { name, description: plugin.description, code, addedAt: Date.now() };
    writeList(TESTING_KEY, [...getTestingPlugins().filter(p => p.name !== name), entry]);
    return entry;
}

export function removeTestingPlugin(name: string) {
    writeList(TESTING_KEY, getTestingPlugins().filter(p => p.name !== name));
}

// ---------------------------------------------------------------- hidden (this device)

function readHidden(): string[] {
    try {
        const list = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
        return Array.isArray(list) ? list.filter(n => typeof n === "string") : [];
    } catch {
        return [];
    }
}

// the Plugins page asks for every plugin on every render, so keep it parsed
let hiddenPlugins = new Set(readHidden());

export const getHiddenPlugins = () => [...hiddenPlugins];
export const isPluginHidden = (name: string) => hiddenPlugins.has(name);

export function setPluginHidden(name: string, hidden: boolean) {
    const next = new Set(hiddenPlugins);
    if (hidden) next.add(name);
    else next.delete(name);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    hiddenPlugins = next;
    window.dispatchEvent(new Event(O2_EXTRA_PLUGINS_UPDATED_EVENT));
}

// ---------------------------------------------------------------- published (everyone)

interface PublishedIndex {
    plugins?: Record<string, { description?: string; version?: number; }>;
}

/**
 * Brings the local copy of the published plugins in line with the repo's
 * index.json. New or changed ones load on the next restart; unpublished ones
 * are dropped. Returns whether anything changed.
 */
export async function syncPublishedPlugins(): Promise<boolean> {
    const res = await fetch(`${PUBLISHED_BASE}/index.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.status === 404) return false; // nothing published yet
    if (!res.ok) throw new Error(`index.json ${res.status}`);

    const index: PublishedIndex = await res.json();
    const wanted = Object.entries(index.plugins ?? {}).filter(([name]) => PLUGIN_NAME_RE.test(name));
    const current = getPublishedPlugins();
    const next: O2ExtraPlugin[] = [];
    let changed = current.length !== wanted.length;

    for (const [name, info] of wanted) {
        const version = Number(info.version) || 0;
        const have = current.find(p => p.name === name);
        if (have && have.version === version) {
            next.push(have);
            continue;
        }

        const file = await fetch(`${PUBLISHED_BASE}/${name}.js?v=${version}`, { cache: "no-store" });
        if (!file.ok) {
            if (have) next.push(have);
            continue;
        }
        const code = await file.text();
        if (code.length > MAX_PLUGIN_SIZE) continue;

        next.push({ name, description: info.description ?? "", code, addedAt: Date.now(), version });
        changed = true;
    }

    if (changed) writeList(PUBLISHED_KEY, next);

    // once the exact file a tester has is published, the testing copy has done its job
    const testing = getTestingPlugins();
    const stillTesting = testing.filter(t => !next.some(p => p.name === t.name && p.code === t.code));
    if (stillTesting.length !== testing.length) {
        writeList(TESTING_KEY, stillTesting);
        changed = true;
    }

    return changed;
}

/** A starting point for a new plugin file - [template] in debug o2. */
export const PLUGIN_TEMPLATE = `// o2cord plugin - add it in debug o2 > [ test plugins ] > [add], then [restart].
// Plain JavaScript (no TypeScript/JSX). Call definePlugin once.
// Inside start()/stop() the whole mod is on the global Vencord object:
//   Vencord.Webpack.Common (React, UserStore, ...), Vencord.Webpack.findByProps, Vencord.Api ...

const settings = definePluginSettings({
    greeting: {
        type: OptionType.STRING,
        description: "What to log when the plugin starts",
        default: "hello from my plugin"
    }
});

definePlugin({
    name: "MyPlugin",
    description: "What this plugin does",
    authors: [],
    settings,

    start() {
        console.log("[MyPlugin]", settings.store.greeting);
    },

    stop() {
        console.log("[MyPlugin] stopped");
    }
});
`;
