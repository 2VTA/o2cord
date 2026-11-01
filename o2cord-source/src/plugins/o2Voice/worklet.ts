/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The part of O2 Voice that runs on the audio thread (an AudioWorklet), so the
 * work never touches Discord's UI thread. Loaded from a Blob URL. It does what
 * the browser's own nodes can't:
 *  - pitch: two read heads moving through a short delay line at `ratio` speed,
 *    cross-faded (sin^2 windows) so the jumps where a head wraps can't be heard;
 *  - live reverse: the voice is cut into chunks and each chunk is played
 *    backwards, one chunk late (a true reverse needs the future);
 *  - sentence reverse: while recording the mic goes silent, then the whole
 *    recording is played backwards.
 */

export const WORKLET_NAME = "o2-voice";

export const WORKLET_SOURCE = `
const FADE = Math.round(sampleRate * 0.006);

class O2Voice extends AudioWorkletProcessor {
    constructor() {
        super();
        this.ratio = 1;
        this.liveReverse = false;

        this.W = Math.round(sampleRate * 0.045);
        this.line = new Float32Array(this.W * 2 + 4);
        this.w = 0;
        this.phase = 0;

        this.chunk = Math.round(sampleRate * 0.45);
        this.inChunk = new Float32Array(sampleRate * 2);
        this.outChunk = new Float32Array(sampleRate * 2);
        this.inPos = 0;
        this.outPos = 0;
        this.outLen = 0;

        this.clip = new Float32Array(sampleRate * 20);
        this.clipLen = 0;
        this.recording = false;
        this.playPos = -1;

        this.port.onmessage = ({ data }) => {
            if (typeof data.ratio === "number") this.ratio = Math.min(2.5, Math.max(0.4, data.ratio));
            if (typeof data.liveReverse === "boolean" && data.liveReverse !== this.liveReverse) {
                this.liveReverse = data.liveReverse;
                this.inPos = this.outPos = this.outLen = 0;
            }
            if (typeof data.chunkMs === "number") {
                this.chunk = Math.min(this.inChunk.length, Math.max(FADE * 4, Math.round(sampleRate * data.chunkMs / 1000)));
                this.inPos = this.outPos = this.outLen = 0;
            }
            if (data.record === true) {
                this.recording = true;
                this.clipLen = 0;
                this.playPos = -1;
            } else if (data.record === false && this.recording) {
                this.recording = false;
                this.playPos = this.clipLen;
                if (!this.clipLen) this.port.postMessage({ done: true });
            } else if (data.cancel) {
                this.recording = false;
                this.playPos = -1;
                this.clipLen = 0;
            }
        };
    }

    read(pos) {
        const n = this.line.length;
        const i = Math.floor(pos);
        const f = pos - i;
        const a = this.line[((i % n) + n) % n];
        const b = this.line[(((i + 1) % n) + n) % n];
        return a + (b - a) * f;
    }

    pitch(x) {
        this.line[this.w] = x;
        let y = x;
        if (this.ratio !== 1) {
            this.phase += (1 - this.ratio) / this.W;
            if (this.phase >= 1) this.phase -= 1;
            else if (this.phase < 0) this.phase += 1;
            const p2 = (this.phase + 0.5) % 1;
            const g1 = Math.sin(Math.PI * this.phase) ** 2;
            const g2 = Math.sin(Math.PI * p2) ** 2;
            y = this.read(this.w - this.phase * this.W - 1) * g1 + this.read(this.w - p2 * this.W - 1) * g2;
        }
        this.w = (this.w + 1) % this.line.length;
        return y;
    }

    // fade in/out at both ends of a reversed piece so the cuts don't click
    edge(i, len) {
        if (i < FADE) return i / FADE;
        if (len - i < FADE) return (len - i) / FADE;
        return 1;
    }

    reverseLive(x) {
        this.inChunk[this.inPos++] = x;
        if (this.inPos >= this.chunk) {
            for (let i = 0; i < this.chunk; i++) this.outChunk[i] = this.inChunk[this.chunk - 1 - i];
            this.outLen = this.chunk;
            this.outPos = 0;
            this.inPos = 0;
        }
        if (this.outPos >= this.outLen) return 0;
        const y = this.outChunk[this.outPos] * this.edge(this.outPos, this.outLen);
        this.outPos++;
        return y;
    }

    process(inputs, outputs) {
        const input = inputs[0] && inputs[0][0];
        const out = outputs[0];
        const n = out[0].length;
        const ch0 = out[0];

        for (let i = 0; i < n; i++) {
            let x = input ? input[i] : 0;
            x = this.pitch(x);
            if (this.liveReverse) x = this.reverseLive(x);

            if (this.recording) {
                if (this.clipLen < this.clip.length) this.clip[this.clipLen++] = x;
                x = 0;
            } else if (this.playPos > 0) {
                this.playPos--;
                x = this.clip[this.playPos] * this.edge(this.clipLen - 1 - this.playPos, this.clipLen);
                if (this.playPos === 0) {
                    this.playPos = -1;
                    this.port.postMessage({ done: true });
                }
            }
            ch0[i] = x;
        }
        for (let c = 1; c < out.length; c++) out[c].set(ch0);
        return true;
    }
}

registerProcessor("${WORKLET_NAME}", O2Voice);
`;
