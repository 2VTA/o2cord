/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The O2 Voice window, laid out like PluginModal: the on switch and Test on
 * top, the voices as cards, then the sentence-reverse button and the sliders.
 * Everything applies at once while you talk.
 */

import "./styles.css";

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { classes } from "@utils/misc";
import { RenderModalProps } from "@vencord/discord-types";
import { Forms, Modal, openModal, Text, useEffect, useState } from "@webpack/common";

import {
    applyVoice, applyVolume, getRecordState, hasCable, isRunning, isTesting, listMics, onVoiceChange, reopenMic,
    sendSentence, setOn, settings, setTesting, startSentence, VB_CABLE_URL
} from "./engine";
import { VOICES } from "./voices";

function Range({ label, value, min, max, unit = "", onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange(v: number): void; }) {
    return (
        <label className="o2-vc-range">
            <span className="o2-vc-range-label">{label}<span className="o2-vc-muted">{value}{unit}</span></span>
            <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} />
        </label>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode; }) {
    return (
        <section className="o2-vc-card">
            <Text variant="heading-md/semibold">{title}</Text>
            {children}
        </section>
    );
}

function keyName(code: string) {
    return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
}

function VoiceModalInner({ transitionState, onClose }: RenderModalProps) {
    const [, rerender] = useState(0);
    const bump = () => rerender(n => n + 1);
    const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
    const [pickingKey, setPickingKey] = useState(false);
    const s = settings.store;
    const cable = hasCable();
    const record = getRecordState();

    useEffect(() => {
        const off = onVoiceChange(bump);
        void listMics().then(setMics);
        return () => {
            off();
            // leaving the window ends a test
            if (isTesting()) void setTesting(false);
        };
    }, []);

    // one key press sets the sentence-reverse key
    useEffect(() => {
        if (!pickingKey) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            settings.store.reverseKey = e.code === "Escape" ? "" : e.code;
            setPickingKey(false);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [pickingKey]);

    function pickVoice(id: string) {
        settings.store.voice = id;
        applyVoice();
        bump();
    }

    function setCustom(key: "customPitch" | "customEcho" | "customReverb" | "customGrit" | "customRobot", v: number) {
        settings.store[key] = v;
        applyVoice();
        bump();
    }

    const status = !cable
        ? "Needs VB-CABLE - see below."
        : !s.on
            ? "Off - Discord hears your normal mic."
            : isRunning()
                ? "On - Discord hears the changed voice."
                : "On - starts when you join a voice channel.";

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="lg"
            title={<BaseText tag="h1" weight="semibold" size="lg">O2 Voice</BaseText>}
            subtitle={<Forms.FormText>Change your voice in voice channels - pick a voice and it changes while you talk.</Forms.FormText>}
        >
            <div className="o2-vc">
                {!cable && (
                    <Card title="One-time setup: VB-CABLE">
                        <Forms.FormText>
                            Discord records your mic itself, so O2 Voice sends the changed voice through a free virtual cable,
                            like other voice changers do. Install it once:
                        </Forms.FormText>
                        <ol className="o2-vc-steps">
                            <li>Download <b>VB-CABLE</b> from its official site (vb-audio.com) and unzip it.</li>
                            <li>Right-click <b>VBCABLE_Setup_x64.exe</b> → Run as administrator → <b>Install Driver</b>.</li>
                            <li>Restart your PC, then come back here - O2 Voice sets the rest up by itself.</li>
                        </ol>
                        <div className="o2-vc-row">
                            <Button variant="primary" size="small" onClick={() => VencordNative.native.openExternal(VB_CABLE_URL)}>Open vb-audio.com</Button>
                            <Button variant="secondary" size="small" onClick={bump}>Check again</Button>
                        </div>
                    </Card>
                )}

                <section className="o2-vc-top">
                    <FormSwitch
                        title="Voice changer"
                        description={status}
                        value={!!s.on && cable}
                        disabled={!cable}
                        hideBorder
                        onChange={v => void setOn(v)}
                    />
                    <FormSwitch
                        title="Test - hear yourself"
                        description="Plays the changed voice in your headphones while this window is open."
                        value={isTesting()}
                        hideBorder
                        onChange={v => void setTesting(v)}
                    />
                </section>

                <div className="o2-vc-voices" role="radiogroup">
                    {VOICES.map(v => (
                        <button
                            key={v.id}
                            type="button"
                            role="radio"
                            aria-checked={s.voice === v.id}
                            className={classes("o2-vc-voice", s.voice === v.id && "o2-vc-voice-on")}
                            onClick={() => pickVoice(v.id)}
                        >
                            <span className="o2-vc-emoji">{v.emoji}</span>
                            <span className="o2-vc-name">{v.name}</span>
                            <span className="o2-vc-muted">{v.hint}</span>
                        </button>
                    ))}
                </div>

                {s.voice === "custom" && (
                    <Card title="Custom voice">
                        <div className="o2-vc-grid">
                            <Range label="Pitch" value={s.customPitch} min={50} max={200} unit="%" onChange={v => setCustom("customPitch", v)} />
                            <Range label="Echo" value={s.customEcho} min={0} max={100} onChange={v => setCustom("customEcho", v)} />
                            <Range label="Reverb" value={s.customReverb} min={0} max={100} onChange={v => setCustom("customReverb", v)} />
                            <Range label="Grit" value={s.customGrit} min={0} max={100} onChange={v => setCustom("customGrit", v)} />
                            <Range label="Robot" value={s.customRobot} min={0} max={100} onChange={v => setCustom("customRobot", v)} />
                        </div>
                    </Card>
                )}

                {s.voice === "reverse" && (
                    <Card title="Live reverse">
                        <Range
                            label="Piece length - longer is easier to follow, shorter answers faster"
                            value={s.reverseChunkMs}
                            min={250}
                            max={900}
                            unit=" ms"
                            onChange={v => { settings.store.reverseChunkMs = v; applyVoice(); bump(); }}
                        />
                    </Card>
                )}

                <Card title="Say a sentence backwards">
                    <Forms.FormText>
                        Hold the button (or your key), say something, let go - everyone hears the whole sentence backwards.
                        Nobody hears it the right way round while you hold.
                    </Forms.FormText>
                    <div className="o2-vc-row">
                        <button
                            type="button"
                            className={classes("o2-vc-hold", record !== "idle" && `o2-vc-hold-${record}`)}
                            onPointerDown={startSentence}
                            onPointerUp={sendSentence}
                            onPointerLeave={sendSentence}
                        >
                            {record === "recording" ? "● Recording - let go to send" : record === "playing" ? "🔁 Playing backwards..." : "Hold to record"}
                        </button>
                        <Button variant="secondary" size="small" onClick={() => setPickingKey(true)}>
                            {pickingKey ? "Press a key... (Esc = none)" : s.reverseKey ? `Key: ${keyName(s.reverseKey)}` : "Set a key"}
                        </Button>
                    </div>
                    <span className="o2-vc-muted">The key works while Discord is the active window. F-keys are a good choice - they don't type anything.</span>
                </Card>

                <Card title="Sound">
                    <div className="o2-vc-grid">
                        <Range label="Volume" value={s.volume} min={0} max={200} unit="%" onChange={v => { settings.store.volume = v; applyVolume(); bump(); }} />
                        <label className="o2-vc-range">
                            <span className="o2-vc-range-label">Your microphone</span>
                            <select
                                className="o2-vc-select"
                                value={s.micLabel}
                                onChange={e => {
                                    settings.store.micLabel = e.target.value;
                                    void reopenMic();
                                    bump();
                                }}
                            >
                                <option value="">Windows default</option>
                                {mics.map(m => <option key={m.deviceId} value={m.label}>{m.label}</option>)}
                            </select>
                        </label>
                    </div>
                </Card>
            </div>
        </Modal>
    );
}

export function openVoiceModal() {
    openModal(props => <VoiceModalInner {...props} />);
}
