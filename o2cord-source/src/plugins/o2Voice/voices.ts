/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The voices. Each one sets the worklet's pitch (and live reverse) and builds
 * a small chain of the browser's own audio nodes between `input` and `output`
 * - filters, distortion, ring modulation, echo, reverb - which all run on the
 * audio thread too. `build` returns a stop() for anything that keeps running
 * (oscillators, noise).
 */

export interface CustomParams {
    pitch: number; // 50-200 (%)
    echo: number; // 0-100
    reverb: number; // 0-100
    grit: number; // 0-100
    robot: number; // 0-100
}

export interface LoudParams {
    boost: number; // 1-20 (x)
    bass: number; // 0-20 dB
    treble: number; // 0-15 dB
    grit: number; // 0-100
}

export interface VoiceContext {
    ctx: AudioContext;
    input: AudioNode;
    output: AudioNode;
    custom: CustomParams;
    loud: LoudParams;
}

export interface Voice {
    id: string;
    name: string;
    emoji: string;
    hint: string;
    /** worklet pitch ratio (1 = unchanged) */
    pitch?: number | ((c: CustomParams) => number);
    liveReverse?: boolean;
    /** short random syllables instead of plain reverse (see worklet.ts) */
    babble?: boolean;
    build(v: VoiceContext): () => void;
}

// ---------------------------------------------------------------- building blocks

const filter = (ctx: AudioContext, type: BiquadFilterType, frequency: number, Q = 0.7, gain = 0) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = Q;
    f.gain.value = gain;
    return f;
};

const gainNode = (ctx: AudioContext, value: number) => {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
};

/** soft clipping; amount 0-1 */
function shaper(ctx: AudioContext, amount: number) {
    const k = 1 + amount * 60;
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    const s = ctx.createWaveShaper();
    s.curve = curve;
    s.oversample = "2x";
    return s;
}

/** a made-up room: decaying noise, `seconds` long */
function impulse(ctx: AudioContext, seconds: number, decay: number) {
    const len = Math.max(1, Math.round(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
}

/** chain a -> b -> c ... and return the last */
function chain(...nodes: AudioNode[]) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
}

/** dry + reverb, mixed into `output` */
function reverb(ctx: AudioContext, input: AudioNode, output: AudioNode, seconds: number, decay: number, wet: number) {
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, seconds, decay);
    chain(input, gainNode(ctx, 1 - wet * 0.5), output);
    chain(input, conv, gainNode(ctx, wet), output);
}

/** dry + repeating echo, mixed into `output` */
function echo(ctx: AudioContext, input: AudioNode, output: AudioNode, time: number, feedback: number, wet: number) {
    const delay = ctx.createDelay(2);
    delay.delayTime.value = time;
    const fb = gainNode(ctx, feedback);
    delay.connect(fb).connect(delay);
    chain(input, output);
    chain(input, delay, gainNode(ctx, wet), output);
}

/** multiplies the voice by a sine - the classic robot */
function ringMod(ctx: AudioContext, input: AudioNode, output: AudioNode, freq: number, mix: number) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const ring = gainNode(ctx, 0);
    osc.connect(ring.gain);
    osc.start();
    chain(input, gainNode(ctx, 1 - mix), output);
    chain(input, ring, gainNode(ctx, mix * 1.6), output);
    return () => osc.stop();
}

/** an oscillator wobbling an AudioParam around its value */
function lfo(ctx: AudioContext, target: AudioParam, freq: number, depth: number) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const amt = gainNode(ctx, depth);
    osc.connect(amt).connect(target);
    osc.start();
    return () => osc.stop();
}

/** quiet radio static under the voice */
function staticBed(ctx: AudioContext, output: AudioNode, level: number) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    chain(src, filter(ctx, "bandpass", 2400, 0.8), gainNode(ctx, level), output);
    src.start();
    return () => src.stop();
}

const none = () => { };

// ---------------------------------------------------------------- the voices

export const VOICES: Voice[] = [
    {
        id: "normal",
        name: "Normal",
        emoji: "🎙️",
        hint: "Your own voice",
        build: ({ input, output }) => { input.connect(output); return none; }
    },
    {
        id: "chipmunk",
        name: "Chipmunk",
        emoji: "🐿️",
        hint: "High and squeaky",
        pitch: 1.65,
        build: ({ ctx, input, output }) => { chain(input, filter(ctx, "highpass", 180), output); return none; }
    },
    {
        id: "demon",
        name: "Demon",
        emoji: "👹",
        hint: "Deep and rough",
        pitch: 0.62,
        build: ({ ctx, input, output }) => {
            chain(input, filter(ctx, "lowshelf", 220, 0.7, 6), shaper(ctx, 0.12), gainNode(ctx, 0.85), output);
            return none;
        }
    },
    {
        id: "robot",
        name: "Robot",
        emoji: "🤖",
        hint: "Metal voice",
        build: ({ ctx, input, output }) => {
            const mid = gainNode(ctx, 1);
            const stop = ringMod(ctx, input, mid, 48, 0.85);
            const comb = ctx.createDelay(0.05);
            comb.delayTime.value = 0.006;
            const fb = gainNode(ctx, 0.45);
            comb.connect(fb).connect(comb);
            chain(mid, output);
            chain(mid, comb, gainNode(ctx, 0.5), output);
            return stop;
        }
    },
    {
        id: "radio",
        name: "Radio",
        emoji: "📻",
        hint: "Walkie-talkie with static",
        build: ({ ctx, input, output }) => {
            chain(input, filter(ctx, "highpass", 450), filter(ctx, "lowpass", 3000), shaper(ctx, 0.35), gainNode(ctx, 0.8), output);
            return staticBed(ctx, output, 0.012);
        }
    },
    {
        id: "phone",
        name: "Phone",
        emoji: "☎️",
        hint: "An old phone call",
        build: ({ ctx, input, output }) => {
            chain(input, filter(ctx, "highpass", 500), filter(ctx, "lowpass", 3200), filter(ctx, "peaking", 1700, 1, 5), shaper(ctx, 0.1), output);
            return none;
        }
    },
    {
        id: "alien",
        name: "Alien",
        emoji: "👽",
        hint: "Wobbly and strange",
        pitch: 1.22,
        build: ({ ctx, input, output }) => {
            const wob = ctx.createDelay(0.05);
            wob.delayTime.value = 0.008;
            const stop = lfo(ctx, wob.delayTime, 7, 0.003);
            const fb = gainNode(ctx, 0.35);
            wob.connect(fb).connect(wob);
            chain(input, wob, output);
            return stop;
        }
    },
    {
        id: "underwater",
        name: "Underwater",
        emoji: "🌊",
        hint: "Muffled, like under water",
        pitch: 0.94,
        build: ({ ctx, input, output }) => {
            const lp = filter(ctx, "lowpass", 650, 2);
            const stop = lfo(ctx, lp.frequency, 0.9, 260);
            chain(input, lp, gainNode(ctx, 1.3), output);
            return stop;
        }
    },
    {
        id: "cave",
        name: "Cave",
        emoji: "🏛️",
        hint: "Big echoing cave",
        build: ({ ctx, input, output }) => { reverb(ctx, input, output, 3.2, 2.2, 0.55); return none; }
    },
    {
        id: "ghost",
        name: "Ghost",
        emoji: "👻",
        hint: "Thin, far away and echoing",
        pitch: 0.96,
        build: ({ ctx, input, output }) => {
            const thin = chain(input, filter(ctx, "highpass", 350), gainNode(ctx, 0.9));
            const mid = gainNode(ctx, 1);
            echo(ctx, thin, mid, 0.32, 0.38, 0.45);
            reverb(ctx, mid, output, 4, 1.6, 0.6);
            return none;
        }
    },
    {
        id: "megaphone",
        name: "Megaphone",
        emoji: "📢",
        hint: "Loud and crunchy",
        build: ({ ctx, input, output }) => {
            chain(input, filter(ctx, "highpass", 650), filter(ctx, "lowpass", 4200), shaper(ctx, 0.55), gainNode(ctx, 0.6), output);
            return none;
        }
    },
    {
        id: "loud",
        name: "LOUD",
        emoji: "🔊",
        hint: "Very loud and blown out",
        // boosted far past full scale, bass pushed up, then clipped hard - loud on purpose (sliders in the window)
        build: ({ ctx, input, output, loud }) => {
            chain(
                input,
                gainNode(ctx, loud.boost),
                filter(ctx, "lowshelf", 180, 0.7, loud.bass),
                filter(ctx, "highshelf", 3500, 0.7, loud.treble),
                // Distortion 0 = no shaper at all (the curve is never fully straight)
                ...(loud.grit > 0 ? [shaper(ctx, loud.grit / 100)] : []),
                gainNode(ctx, 0.98),
                output
            );
            return none;
        }
    },
    {
        id: "squid",
        name: "Squid Talk",
        emoji: "🦑",
        hint: "Cute gibberish - nobody gets a word",
        pitch: 1.75,
        liveReverse: true,
        babble: true,
        build: ({ ctx, input, output }) => {
            // bright and bouncy: a quick wobble and a lift in the highs
            const wob = ctx.createDelay(0.05);
            wob.delayTime.value = 0.004;
            const stop = lfo(ctx, wob.delayTime, 9, 0.0015);
            chain(input, wob, filter(ctx, "highpass", 220), filter(ctx, "highshelf", 3000, 0.7, 5), output);
            return stop;
        }
    },
    {
        id: "reverse",
        name: "Reverse",
        emoji: "🔁",
        hint: "Every word backwards (a little late)",
        liveReverse: true,
        build: ({ input, output }) => { input.connect(output); return none; }
    },
    {
        id: "custom",
        name: "Custom",
        emoji: "🎚️",
        hint: "Your own mix - sliders below",
        pitch: c => c.pitch / 100,
        build: ({ ctx, input, output, custom }) => {
            const stops: (() => void)[] = [];
            let node: AudioNode = input;
            if (custom.grit > 0) node = chain(node, shaper(ctx, custom.grit / 100 * 0.6), gainNode(ctx, 1 - custom.grit / 300));
            if (custom.robot > 0) {
                const mid = gainNode(ctx, 1);
                stops.push(ringMod(ctx, node, mid, 48, custom.robot / 100 * 0.85));
                node = mid;
            }
            if (custom.echo > 0) {
                const mid = gainNode(ctx, 1);
                echo(ctx, node, mid, 0.28, custom.echo / 100 * 0.55, custom.echo / 100 * 0.6);
                node = mid;
            }
            if (custom.reverb > 0) reverb(ctx, node, output, 2.6, 2, custom.reverb / 100 * 0.7);
            else node.connect(output);
            return () => stops.forEach(s => s());
        }
    }
];

export const getVoice = (id: string | undefined) => VOICES.find(v => v.id === id) ?? VOICES[0];
