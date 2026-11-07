/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Main-process half of the "Copy stream info" button in LimitlessScreenshare's settings: it only READS things
 * that help to find out why a stream is slow (graphics acceleration state, session type, the encoder lines of
 * Discord's own stream log) and hands them to the settings page. Nothing is sent anywhere - the person copies
 * the text and sends it themselves. Internet addresses in the log lines are blanked out.
 */

import { app, IpcMainInvokeEvent } from "electron";
import { closeSync, existsSync, openSync, readSync, statSync } from "fs";
import { arch, cpus, platform, release, totalmem } from "os";
import { join } from "path";

const MAX_BYTES = 400 * 1024;
const MAX_LINES = 22;
const INTERESTING = /encoder|hw.?enc|codec|h\.?26[45]|hevc|vp[89]|av1|resolution|frame ?rate|framerate|fps|bitrate|capturer|hardware|software|vaapi|nvenc|nvdec|amf|pipewire|portal|screen ?(share|cap)|go ?live|quality|degradation|overuse|scal(e|ing)/i;
// not about the stream: server connection chatter, the clips recorder, anything that carries addresses or keys
const NOT_WANTED = /candidate|ufrag|pwd|fingerprint|stun|turn:|token|secret|authorization|GatewaySocket|JS console|clips/i;

function maskAddresses(line: string) {
    return line
        .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, "x.x.x.x")
        // 5 or more groups, so a time like 09:10:35 is left alone
        .replace(/\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi, "[ipv6]");
}

function tailOf(path: string): string {
    const size = statSync(path).size;
    const start = Math.max(0, size - MAX_BYTES);
    const fd = openSync(path, "r");
    try {
        const buf = Buffer.alloc(size - start);
        readSync(fd, buf, 0, buf.length, start);
        return buf.toString("utf8");
    } finally {
        closeSync(fd);
    }
}

export async function systemInfo(_: IpcMainInvokeEvent) {
    const info: Record<string, unknown> = {
        platform: platform(),
        arch: arch(),
        osRelease: release(),
        session: process.env.XDG_SESSION_TYPE ?? null,
        desktop: process.env.XDG_CURRENT_DESKTOP ?? null,
        waylandDisplay: process.env.WAYLAND_DISPLAY ? "set" : null,
        cpu: cpus()[0]?.model ?? null,
        cpuThreads: cpus().length,
        memoryGB: Math.round(totalmem() / 1024 ** 3),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        // only the switches (no paths), so a --disable-gpu or --enable-features line shows up
        switches: process.argv.filter(a => a.startsWith("--") && !/user-data-dir|app-path|remote-debugging/i.test(a)).map(a => a.slice(0, 120))
    };
    try { info.gpuFeatureStatus = app.getGPUFeatureStatus(); } catch { /* not available */ }
    try {
        const gpu: any = await app.getGPUInfo("basic");
        info.gpu = (gpu?.gpuDevice ?? []).map((d: any) => ({ vendorId: d.vendorId, deviceId: d.deviceId, driverVendor: d.driverVendor, driverVersion: d.driverVersion, active: d.active }));
        info.gpuAuxAttributes = { glRenderer: gpu?.auxAttributes?.glRenderer, glVendor: gpu?.auxAttributes?.glVendor, glImplementation: gpu?.auxAttributes?.glImplementationParts };
    } catch { /* not available */ }
    return info;
}

export async function readStreamLog(_: IpcMainInvokeEvent) {
    const dir = join(app.getPath("userData"), "logs");
    const out: { file: string; lines: string[]; }[] = [];
    for (const name of ["discord-last-webrtc_0", "discord-webrtc_0"]) {
        const path = join(dir, name);
        if (!existsSync(path)) continue;
        try {
            const seen = new Set<string>();
            const lines = tailOf(path)
                .split(/\r?\n/)
                .filter(l => INTERESTING.test(l) && !NOT_WANTED.test(l))
                // drop the long internal module path in front of the message, then cut what is still too long
                .map(l => maskAddresses(l).replace(/\[[a-z_]+(?:::[a-z_]+)+\]\s*/g, "").replace(/\s+INFO\s+/g, " "))
                // the encoder probe answers (which hardware encoders work) are the point, so those may be longer
                .map(l => l.slice(0, /json message/.test(l) ? 330 : 170))
                // the same message again and again (the encoder probes, for one) only needs to be there once
                .filter(l => {
                    const key = l.replace(/^\[[^\]]*\]\s*\[\d+\]\s*/, "");
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            out.push({ file: name, lines: lines.slice(-MAX_LINES) });
        } catch { /* unreadable - skip */ }
    }
    return out;
}
