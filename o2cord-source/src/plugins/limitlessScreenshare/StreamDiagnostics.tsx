/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { copyWithToast } from "@utils/discord";
import { PluginNative } from "@utils/types";
import { MediaEngineStore, useState } from "@webpack/common";

const Native = VencordNative.pluginHelpers.LimitlessScreenshare as PluginNative<typeof import("./native")>;

const STREAM_PLUGINS = ["LimitlessScreenshare", "StreamingCodecDisabler", "InstantScreenshare", "BiggerStreamPreview", "WhosWatching", "RetroTerminal", "VHS", "FakeNitro"];

function webglRenderer(): string {
    try {
        const gl = document.createElement("canvas").getContext("webgl");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
    } catch {
        return "unknown";
    }
}

// what the voice engine says it can encode / decode (Discord asks it once per connection)
function codecCapabilities(): Promise<unknown> {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve("no answer"), 2000);
        try {
            const engine: any = (MediaEngineStore as any).getMediaEngine?.();
            if (!engine?.getCodecCapabilities) { clearTimeout(timer); return resolve("not available"); }
            engine.getCodecCapabilities((caps: unknown) => { clearTimeout(timer); resolve(caps); });
        } catch (e) {
            clearTimeout(timer);
            resolve("error: " + String(e));
        }
    });
}

function line(label: string, value: unknown) {
    return `${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
}

export async function buildStreamReport(): Promise<string> {
    const out: string[] = ["=== o2cord stream info ==="];
    out.push(line("o2cord", typeof O2CORD_VERSION === "string" && O2CORD_VERSION ? O2CORD_VERSION : "unknown"));
    try { out.push(line("Discord", IS_DISCORD_DESKTOP ? `desktop ${DiscordNative.app.getVersion()}` : "web")); } catch { /* */ }
    out.push(line("userAgent", navigator.userAgent));
    out.push(line("cores / memory", `${navigator.hardwareConcurrency} threads, ${(navigator as any).deviceMemory ?? "?"} GB reported`));
    out.push(line("WebGL renderer", webglRenderer() + "   (llvmpipe / SwiftShader / softpipe = no graphics card acceleration)"));

    try {
        const state: any = MediaEngineStore.getState();
        const src = state.goLiveSource;
        out.push(line("stream settings now", src ? { resolution: src.quality?.resolution, frameRate: src.quality?.frameRate, preset: src.preset } : "no stream is set up"));
    } catch (e) { out.push("stream settings now: error " + String(e)); }

    try {
        const { Plugins, Settings } = (window as any).Vencord;
        const list = STREAM_PLUGINS
            .filter(n => Plugins.plugins[n])
            .map(n => `${n}=${Settings.plugins[n]?.enabled ? "on" : "off"}`);
        out.push(line("plugins", list.join(", ")));
        const ls = Settings.plugins.LimitlessScreenshare ?? {};
        out.push(line("LimitlessScreenshare settings", { maxFPS: ls.maxFPS, maxResolution: ls.maxResolution, roundResolution: ls.roundResolution }));
        const codec = Settings.plugins.StreamingCodecDisabler;
        if (codec) out.push(line("StreamingCodecDisabler", codec));
    } catch { /* */ }

    out.push(line("voice engine codecs", await codecCapabilities()));

    try {
        const sys: any = await Native.systemInfo();
        out.push("--- system");
        out.push(`${sys.platform} ${sys.arch} ${sys.osRelease}, session=${sys.session ?? "-"}, desktop=${sys.desktop ?? "-"}, wayland=${sys.waylandDisplay ?? "-"}`);
        out.push(`cpu: ${sys.cpu} (${sys.cpuThreads} threads, ${sys.memoryGB} GB)   electron ${sys.electron} / chrome ${sys.chrome}`);
        out.push(line("chromium switches", sys.switches?.length ? sys.switches : "none"));
        const f = sys.gpuFeatureStatus ?? {};
        out.push(line("graphics features", { video_encode: f.video_encode, video_decode: f.video_decode, gpu_compositing: f.gpu_compositing, webgl: f.webgl, opengl: f.opengl, vulkan: f.vulkan }));
        const gpus = [...new Set((sys.gpu ?? []).map((d: any) => `${d.vendorId?.toString(16)}:${d.deviceId?.toString(16)} driver ${d.driverVersion ?? "?"}`))];
        out.push(line("gpu(s) vendor:device", gpus.length ? gpus : "unknown"));
        if (sys.gpuAuxAttributes?.glRenderer) out.push(line("gl renderer", sys.gpuAuxAttributes.glRenderer));
    } catch (e) { out.push("system info: error " + String(e)); }

    try {
        const logs = await Native.readStreamLog();
        if (!logs.length) out.push("--- stream log: no discord-webrtc log file found");
        for (const { file, lines } of logs) {
            out.push(`--- ${file} (encoder / codec / capture lines only, internet addresses hidden, last ${lines.length})`);
            out.push(...lines);
        }
    } catch (e) { out.push("stream log: error " + String(e)); }

    return out.join("\n");
}

export function StreamDiagnostics() {
    const [busy, setBusy] = useState(false);

    return (
        <div style={{ marginTop: 12 }}>
            <Paragraph>
                Is streaming slow or choppy? Press the button and send the copied text to whoever is helping you. It lists your
                stream settings, graphics acceleration, the video codecs Discord can use and the encoder lines of Discord's stream log.
                Nothing is sent from here - it is only copied - and internet addresses are blanked out.
            </Paragraph>
            <Button
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    try {
                        await copyWithToast(await buildStreamReport(), "Stream info copied - paste it where you were asked to");
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                {busy ? "Collecting..." : "Copy stream info"}
            </Button>
        </div>
    );
}
