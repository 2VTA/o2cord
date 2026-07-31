/*
 * o2cord bundled manifest updater
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { ipcMain } from "electron";
import { writeFile } from "fs/promises";
import { join } from "path";

import gitHash from "~git-hash";

import { serializeErrors, VENCORD_FILES } from "./common";

interface O2cordUpdateManifest {
    version?: string;
    hash: string;
    author?: string;
    message?: string;
    notes?: string[];
    files: Record<string, string>;
}

let pendingManifest: O2cordUpdateManifest | null = null;

function manifestUrl() {
    return O2CORD_UPDATE_MANIFEST.trim();
}

function assertSafeUpdateUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== "https:")
        throw new Error(`Update URL must use https: ${value}`);

    return url.href;
}

async function getManifest() {
    const url = manifestUrl();
    if (!url) return null;

    const manifest = await fetchJson<O2cordUpdateManifest>(assertSafeUpdateUrl(url), {
        headers: {
            Accept: "application/json",
            "User-Agent": VENCORD_USER_AGENT
        }
    });

    if (!manifest.hash || typeof manifest.hash !== "string")
        throw new Error("The o2cord update manifest is missing a hash.");

    if (!manifest.files || typeof manifest.files !== "object")
        throw new Error("The o2cord update manifest is missing files.");

    return manifest;
}

function isOutdated(manifest: O2cordUpdateManifest | null) {
    return Boolean(manifest?.hash && manifest.hash !== gitHash);
}

async function calculateChanges() {
    const manifest = await getManifest();
    if (!isOutdated(manifest)) {
        pendingManifest = null;
        return [];
    }

    pendingManifest = manifest;

    const message = manifest!.message
        ?? manifest!.notes?.[0]
        ?? `o2cord ${manifest!.version ?? manifest!.hash}`;

    return [{
        hash: manifest!.hash,
        author: manifest!.author ?? "o2cord",
        message
    }];
}

async function fetchUpdates() {
    const manifest = pendingManifest ?? await getManifest();
    if (!isOutdated(manifest)) {
        pendingManifest = null;
        return false;
    }

    pendingManifest = manifest;
    return true;
}

async function applyUpdates() {
    const manifest = pendingManifest ?? await getManifest();
    if (!isOutdated(manifest)) {
        pendingManifest = null;
        return true;
    }

    const downloads = await Promise.all(VENCORD_FILES.map(async file => {
        const url = manifest!.files[file];
        if (!url)
            throw new Error(`The update manifest is missing ${file}.`);

        return [join(__dirname, file), await fetchBuffer(assertSafeUpdateUrl(url), {
            headers: { "User-Agent": VENCORD_USER_AGENT }
        })] as const;
    }));

    await Promise.all(downloads.map(([file, contents]) => writeFile(file, contents)));
    pendingManifest = null;
    return true;
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => manifestUrl() || "No o2cord update manifest configured."));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(calculateChanges));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(applyUpdates));
