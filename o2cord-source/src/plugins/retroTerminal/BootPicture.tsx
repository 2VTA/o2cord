/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Lets anyone replace Ryder's picture on the boot screen with their own: the
 * picture is turned into braille art the same size as the original (60 x 31
 * characters, each one a 2 x 4 dot block), dithered so faces still read.
 */

import { Button } from "@components/Button";
import { chooseFile } from "@utils/web";
import { Forms, useState } from "@webpack/common";

import { BOOT_ART } from "./bootArt";

const COLS = 60;
const ROWS = 31;
// braille dot bit for (x, y) inside a 2 x 4 cell
const DOT = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];

export async function imageToBraille(file: Blob, invert = false): Promise<string[]> {
    const bmp = await createImageBitmap(file);
    const w = COLS * 2, h = ROWS * 4;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // fit inside, centred, black around it
    const scale = Math.min(w / bmp.width, h / bmp.height);
    const dw = bmp.width * scale, dh = bmp.height * scale;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);

    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const v = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
        gray[i] = invert ? 1 - v : v;
    }

    // Floyd-Steinberg: lit dot where the picture is bright
    const on = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const v = gray[i];
            const n = v >= 0.5 ? 1 : 0;
            on[i] = n;
            const err = v - n;
            if (x + 1 < w) gray[i + 1] += err * 7 / 16;
            if (y + 1 < h) {
                if (x > 0) gray[i + w - 1] += err * 3 / 16;
                gray[i + w] += err * 5 / 16;
                if (x + 1 < w) gray[i + w + 1] += err * 1 / 16;
            }
        }
    }

    const lines: string[] = [];
    for (let r = 0; r < ROWS; r++) {
        let line = "";
        for (let c = 0; c < COLS; c++) {
            let bits = 0;
            for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
                if (on[(r * 4 + dy) * w + c * 2 + dx]) bits |= DOT[dy][dx];
            }
            line += String.fromCharCode(0x2800 + bits);
        }
        lines.push(line);
    }
    return lines;
}

export function BootPictureSetting({ value, onChange }: { value: string; onChange(v: string): void; }) {
    const [art, setArt] = useState(value);
    const [invert, setInvert] = useState(false);
    const [busy, setBusy] = useState(false);
    const lines = art ? art.split("\n") : BOOT_ART;

    async function pick(inv = invert) {
        const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
        if (!file) return;
        setBusy(true);
        try {
            const next = (await imageToBraille(file, inv)).join("\n");
            setArt(next);
            onChange(next);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section>
            <Forms.FormTitle>Boot screen picture</Forms.FormTitle>
            <Forms.FormText>The picture under "Connecting to gateway ..." when Discord starts. Use your own - it's turned into dot art.</Forms.FormText>
            <pre style={{ margin: "10px 0", padding: 10, borderRadius: 6, background: "#000", color: "#ddd", fontSize: 6, lineHeight: 1, overflow: "hidden" }}>
                {lines.join("\n")}
            </pre>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Button size="small" disabled={busy} onClick={() => pick()}>{busy ? "Working..." : "Choose a picture"}</Button>
                <Button size="small" variant="secondary" disabled={busy} onClick={() => { setInvert(!invert); }}>
                    {invert ? "Dark parts lit (on)" : "Dark parts lit (off)"}
                </Button>
                <Button size="small" variant="dangerSecondary" disabled={!art} onClick={() => { setArt(""); onChange(""); }}>Back to the original</Button>
            </div>
            <Forms.FormText style={{ marginTop: 6 }}>"Dark parts lit" flips which parts light up - try it if your picture comes out mostly empty.</Forms.FormText>
        </section>
    );
}
