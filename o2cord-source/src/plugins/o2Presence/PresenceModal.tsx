/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The O2 Presence window, laid out like PluginModal: master switch + rotation on
 * top, the saved presets as chips, a live preview drawn by Discord's own activity
 * card, and the fields below. Every edit is saved at once and, if that preset is
 * the one showing, sent to your profile a moment later.
 */

import "./styles.css";

import { getUserSettingLazy } from "@api/UserSettings";
import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { copyToClipboard } from "@utils/clipboard";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { useAwaiter } from "@utils/react";
import { RenderModalProps } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { Forms, Modal, openModal, RestAPI, showToast, Text, TextArea, TextInput, Toasts, useEffect, useRef, UserStore, useState } from "@webpack/common";

import {
    buildActivity, emptyPreset, getActivePreset, getPresets, MAX_PRESETS, newId, onPresenceChange, Preset,
    pushPresence, sanitizePreset, settings, TimeMode, turnOff, usePreset, VARIABLES
} from "./model";

const useProfileThemeStyle = findByCodeLazy("profileThemeStyle:", "--profile-gradient-primary-color");
const ActivityView = findComponentByCodeLazy(".party?(0", "USER_PROFILE_ACTIVITY");
const ShowCurrentGame = getUserSettingLazy<boolean>("status", "showCurrentGame")!;

const TYPES: [number, string][] = [
    [ActivityType.PLAYING, "Playing"],
    [ActivityType.STREAMING, "Streaming"],
    [ActivityType.LISTENING, "Listening to"],
    [ActivityType.WATCHING, "Watching"],
    [ActivityType.COMPETING, "Competing in"]
];

const TIME_MODES: [TimeMode, string, string][] = [
    ["none", "None", "No clock."],
    ["elapsed", "Since now", "Counts up from when this preset started showing."],
    ["startup", "Since Discord opened", "Counts up from when you opened Discord."],
    ["midnight", "Today", "Counts up from midnight - the time of day."],
    ["custom", "Custom", "Counts up from a start time, or down to an end time (or both)."]
];

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time
function toLocalInput(ms: number) {
    if (!ms) return "";
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
    const t = value ? new Date(value).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
}

// A picture you sent in Discord and copied the link of (right-click > Copy Link)
// works as it is. Discord signs those links and they stop working after a while:
// the "ex" part of the link is the expiry time, so say so before it silently breaks.
function imageHint(value: string): string | undefined {
    if (!/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(value)) return undefined;
    let ex: string | null = null;
    try { ex = new URL(value).searchParams.get("ex"); } catch { return undefined; }
    if (!ex || !/^[0-9a-f]{1,8}$/i.test(ex)) return "Discord link - OK.";
    const at = new Date(parseInt(ex, 16) * 1000);
    if (at.getTime() < Date.now()) return "This Discord link has expired - send the picture again in Discord and paste the new link.";
    return `Discord link - works until ${at.toLocaleString()}, then paste a fresh one.`;
}

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean; }) {
    return (
        <div className={classes("o2-rp-field", wide && "o2-rp-field-wide")}>
            <span className="o2-rp-label">{label}</span>
            {children}
            {hint && <span className="o2-rp-hint">{hint}</span>}
        </div>
    );
}

function Seg<T extends string | number>({ options, value, onChange }: { options: [T, string][]; value: T; onChange(v: T): void; }) {
    return (
        <div className="o2-rp-seg" role="radiogroup">
            {options.map(([v, label]) => (
                <button
                    key={String(v)}
                    role="radio"
                    aria-checked={value === v}
                    className={classes("o2-rp-seg-btn", value === v && "o2-rp-seg-on")}
                    onClick={() => onChange(v)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode; }) {
    return (
        <section className="o2-rp-card">
            <Text variant="heading-md/semibold" className="o2-rp-card-title">{title}</Text>
            {children}
        </section>
    );
}

function PresenceModalInner({ transitionState, onClose }: RenderModalProps) {
    const [, rerender] = useState(0);
    const bump = () => rerender(n => n + 1);
    const presets = getPresets();
    const [selectedId, setSelectedId] = useState(() => getActivePreset()?.id ?? presets[0]?.id);
    const selected = presets.find(p => p.id === selectedId) ?? presets[0];
    const active = getActivePreset();
    const { on } = settings.store;

    const [lookingUp, setLookingUp] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [panel, setPanel] = useState<"" | "import">("");
    const [importText, setImportText] = useState("");
    const [clock, setClock] = useState(0);
    const sendTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const gameActivityEnabled = ShowCurrentGame.useSetting();
    const { profileThemeStyle } = useProfileThemeStyle({});

    // {time} and friends change on their own: keep the preview fresh
    useEffect(() => {
        const t = setInterval(() => setClock(n => n + 1), 20_000);
        const off = onPresenceChange(bump);
        return () => { clearInterval(t); off(); clearTimeout(sendTimer.current); };
    }, []);

    const [activity] = useAwaiter(() => (selected ? buildActivity(selected) : Promise.resolve(null)), {
        fallbackValue: null,
        deps: [JSON.stringify(selected), clock]
    });

    if (!selected) return null;

    function save(list: Preset[]) {
        settings.store.presets = list;
        bump();
    }

    // edits are saved at once; the profile is updated once typing pauses
    function update(patch: Partial<Preset>) {
        save(getPresets().map(p => (p.id === selected.id ? { ...p, ...patch } : p)));
        if (selected.id === active?.id && on) {
            clearTimeout(sendTimer.current);
            sendTimer.current = setTimeout(() => void pushPresence(), 700);
        }
    }

    function addPreset(preset: Preset) {
        if (getPresets().length >= MAX_PRESETS) {
            showToast(`You can keep up to ${MAX_PRESETS} presets.`, Toasts.Type.FAILURE);
            return;
        }
        save([...getPresets(), preset]);
        setSelectedId(preset.id);
        setConfirmDelete(false);
    }

    function removeSelected() {
        if (getPresets().length <= 1) return;
        if (!confirmDelete) { setConfirmDelete(true); return; }
        const rest = getPresets().filter(p => p.id !== selected.id);
        if (settings.store.activeId === selected.id) {
            settings.store.activeId = rest[0].id;
            void pushPresence(true);
        }
        save(rest);
        setSelectedId(rest[0].id);
        setConfirmDelete(false);
    }

    async function lookupGame() {
        const id = selected.appId.trim();
        if (!/^\d{17,20}$/.test(id)) {
            showToast("That doesn't look like an application ID (17-20 digits).", Toasts.Type.FAILURE);
            return;
        }
        setLookingUp(true);
        try {
            const { body } = await RestAPI.get({ url: `/applications/${id}/rpc` });
            if (!body?.name) throw new Error("unknown");
            update({
                activityName: String(body.name),
                largeImage: selected.largeImage || (body.icon ? `https://cdn.discordapp.com/app-icons/${id}/${body.icon}.png?size=512` : "")
            });
            showToast(`Found ${body.name}.`, Toasts.Type.SUCCESS);
        } catch {
            showToast("Discord doesn't know a game with that ID.", Toasts.Type.FAILURE);
        } finally {
            setLookingUp(false);
        }
    }

    function exportSelected() {
        const { id: _id, ...rest } = selected;
        copyToClipboard(JSON.stringify(rest));
        showToast("Preset copied. Paste it to share it, or import it on another account.", Toasts.Type.SUCCESS);
    }

    function importPresets() {
        let parsed: unknown;
        try { parsed = JSON.parse(importText); } catch {
            showToast("That isn't valid preset text.", Toasts.Type.FAILURE);
            return;
        }
        const items = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, MAX_PRESETS);
        const room = MAX_PRESETS - getPresets().length;
        const added = items.slice(0, Math.max(0, room)).map(item => sanitizePreset(item));
        if (!added.length) {
            showToast(room <= 0 ? "No room for more presets." : "Nothing to import.", Toasts.Type.FAILURE);
            return;
        }
        save([...getPresets(), ...added]);
        setSelectedId(added[0].id);
        setImportText("");
        setPanel("");
        showToast(`Imported ${added.length} preset${added.length === 1 ? "" : "s"}.`, Toasts.Type.SUCCESS);
    }

    const isStream = selected.type === ActivityType.STREAMING;
    const showing = on && active?.id === selected.id;

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="lg"
            title={<BaseText tag="h1" weight="semibold" size="lg">O2 Presence</BaseText>}
            subtitle={<Forms.FormText>Your own Rich Presence: save several, switch with a click, or let them rotate.</Forms.FormText>}
        >
            <div className="o2-rp">
                {!gameActivityEnabled && (
                    <div className="o2-rp-notice">
                        <span>Activity sharing is off in your Discord settings, so nobody can see your presence.</span>
                        <Button variant="primary" size="small" onClick={() => ShowCurrentGame.updateSetting(true)}>Turn it on</Button>
                    </div>
                )}

                <section className="o2-rp-top">
                    <FormSwitch
                        title="Show on my profile"
                        description={on ? `Showing "${active?.name}" right now.` : "Off - nothing from O2 Presence is on your profile."}
                        value={on}
                        hideBorder
                        onChange={v => (v ? void usePreset(selected.id) : void turnOff())}
                    />
                    <div className="o2-rp-rotate">
                        <FormSwitch
                            title="Rotate between presets"
                            description="Moves to the next preset on a timer."
                            value={!!settings.store.rotate}
                            hideBorder
                            onChange={v => { settings.store.rotate = v; bump(); }}
                        />
                        {settings.store.rotate && (
                            <div className="o2-rp-rotate-min">
                                <span>every</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={720}
                                    value={settings.store.rotateMinutes ?? 5}
                                    onChange={e => { settings.store.rotateMinutes = Math.min(720, Math.max(1, Number(e.target.value) || 1)); bump(); }}
                                />
                                <span>min</span>
                            </div>
                        )}
                    </div>
                </section>

                <section>
                    <div className="o2-rp-chips">
                        {presets.map(p => (
                            <button
                                key={p.id}
                                className={classes("o2-rp-chip", p.id === selected.id && "o2-rp-chip-on")}
                                onClick={() => { setSelectedId(p.id); setConfirmDelete(false); }}
                                title={p.id === active?.id && on ? "Showing now" : "Click to edit"}
                            >
                                {p.id === active?.id && on && <span className="o2-rp-live" />}
                                {p.name}
                            </button>
                        ))}
                        <button className="o2-rp-chip o2-rp-chip-add" onClick={() => addPreset(emptyPreset(`Status ${presets.length + 1}`))}>+ New</button>
                    </div>
                    <div className="o2-rp-toolbar">
                        <Button variant="secondary" size="small" onClick={() => addPreset({ ...sanitizePreset(selected), id: newId(), name: `${selected.name} copy`.slice(0, 40) })}>Duplicate</Button>
                        <Button variant="secondary" size="small" onClick={exportSelected}>Copy as text</Button>
                        <Button variant="secondary" size="small" onClick={() => setPanel(panel === "import" ? "" : "import")}>Import</Button>
                        <Button variant={confirmDelete ? "dangerPrimary" : "dangerSecondary"} size="small" disabled={presets.length <= 1} onClick={removeSelected}>
                            {confirmDelete ? "Click again to delete" : "Delete"}
                        </Button>
                        <span className="o2-rp-spacer" />
                        <Button variant={showing ? "secondary" : "positive"} size="small" onClick={() => void usePreset(selected.id)}>
                            {showing ? "Showing now" : "Use this preset"}
                        </Button>
                    </div>
                    {panel === "import" && (
                        <div className="o2-rp-import">
                            <TextArea value={importText} onChange={setImportText} rows={3} placeholder="Paste preset text here (one preset, or a list)" />
                            <Button variant="positive" size="small" disabled={!importText.trim()} onClick={importPresets}>Import</Button>
                        </div>
                    )}
                </section>

                <section>
                    <Text variant="heading-md/semibold" className={classes(Margins.top8, Margins.bottom8)}>Preview</Text>
                    <div className="o2-rp-preview" style={profileThemeStyle}>
                        {activity
                            ? <ActivityView activity={activity} user={UserStore.getCurrentUser()} currentUser={UserStore.getCurrentUser()} />
                            : <span className="o2-rp-hint">Give it an activity name to see the preview.</span>}
                    </div>
                    <Forms.FormText className={Margins.top8}>You can't see your own buttons on your profile, but everyone else can.</Forms.FormText>
                </section>

                <Card title="What it says">
                    <div className="o2-rp-grid">
                        <Field label="Preset name" wide><TextInput value={selected.name} maxLength={40} onChange={v => update({ name: v })} /></Field>
                        <Field label="Type" wide>
                            <Seg options={TYPES} value={selected.type} onChange={v => update({ type: v })} />
                        </Field>
                        <Field label="Activity name" hint="The game or thing, e.g. “Apex Legends”.">
                            <TextInput value={selected.activityName} maxLength={128} onChange={v => update({ activityName: v })} placeholder="Name" />
                        </Field>
                        <Field label="Game ID (optional)" hint="Fills in the real name and icon.">
                            <div className="o2-rp-inline">
                                <TextInput
                                    value={selected.appId}
                                    onChange={v => update({ appId: v.replace(/\D/g, "").slice(0, 20) })}
                                    placeholder="e.g. 542075586886107149"
                                />
                                <Button variant="secondary" size="small" disabled={lookingUp || !selected.appId} onClick={lookupGame}>{lookingUp ? "..." : "Look up"}</Button>
                            </div>
                        </Field>
                        {isStream && (
                            <Field label="Stream link" wide hint="twitch.tv or youtube.com link - makes it a purple Streaming status.">
                                <TextInput value={selected.streamUrl} onChange={v => update({ streamUrl: v })} placeholder="https://twitch.tv/..." />
                            </Field>
                        )}
                        <Field label="Details (first line)"><TextInput value={selected.details} maxLength={128} onChange={v => update({ details: v })} /></Field>
                        <Field label="Details link"><TextInput value={selected.detailsUrl} onChange={v => update({ detailsUrl: v })} placeholder="https://..." /></Field>
                        <Field label="State (second line)"><TextInput value={selected.state} maxLength={128} onChange={v => update({ state: v })} /></Field>
                        <Field label="State link"><TextInput value={selected.stateUrl} onChange={v => update({ stateUrl: v })} placeholder="https://..." /></Field>
                    </div>
                    <div className="o2-rp-vars">
                        Live text: {VARIABLES.map(([v, what]) => <code key={v} title={what}>{v}</code>)} - these update by themselves while it shows.
                    </div>
                </Card>

                <Card title="Pictures">
                    <Forms.FormText className={Margins.bottom8}>Paste an image link (https://...). To use a picture from your device: send it in any Discord chat, right-click it, Copy Link, and paste it here. A link needs no game ID. (You can also type the key of an image uploaded to the game's application.)</Forms.FormText>
                    <div className="o2-rp-grid">
                        <Field label="Large image" hint={imageHint(selected.largeImage)}><TextInput value={selected.largeImage} onChange={v => update({ largeImage: v })} placeholder="https://..." /></Field>
                        <Field label="Large image text"><TextInput value={selected.largeText} maxLength={128} onChange={v => update({ largeText: v })} placeholder="Shown on hover" /></Field>
                        <Field label="Large image link" wide><TextInput value={selected.largeUrl} onChange={v => update({ largeUrl: v })} placeholder="https://... (opens when clicked)" /></Field>
                        <Field label="Small image" hint={imageHint(selected.smallImage)}><TextInput value={selected.smallImage} onChange={v => update({ smallImage: v })} placeholder="https://..." /></Field>
                        <Field label="Small image text"><TextInput value={selected.smallText} maxLength={128} onChange={v => update({ smallText: v })} placeholder="Shown on hover" /></Field>
                        <Field label="Small image link" wide><TextInput value={selected.smallUrl} onChange={v => update({ smallUrl: v })} placeholder="https://..." /></Field>
                    </div>
                </Card>

                <Card title="Time">
                    <Seg options={TIME_MODES.map(([v, l]) => [v, l] as [TimeMode, string])} value={selected.timeMode} onChange={v => update({ timeMode: v })} />
                    <Forms.FormText className={Margins.top8}>{TIME_MODES.find(([v]) => v === selected.timeMode)?.[2]}</Forms.FormText>
                    {selected.timeMode === "custom" && (
                        <div className="o2-rp-grid">
                            <Field label="Start" hint="Counts up from here.">
                                <input type="datetime-local" value={toLocalInput(selected.startAt)} onChange={e => update({ startAt: fromLocalInput(e.target.value) })} />
                            </Field>
                            <Field label="End" hint="Counts down to here (set only this for a countdown).">
                                <input type="datetime-local" value={toLocalInput(selected.endAt)} onChange={e => update({ endAt: fromLocalInput(e.target.value) })} />
                            </Field>
                        </div>
                    )}
                </Card>

                <Card title="Party and buttons">
                    <div className="o2-rp-grid">
                        <Field label="Party size" hint="e.g. 2 of 5 shows “(2 of 5)”.">
                            <div className="o2-rp-inline">
                                <input type="number" min={0} value={selected.partySize || ""} placeholder="2" onChange={e => update({ partySize: Math.max(0, Number(e.target.value) || 0) })} />
                                <span>of</span>
                                <input type="number" min={0} value={selected.partyMax || ""} placeholder="5" onChange={e => update({ partyMax: Math.max(0, Number(e.target.value) || 0) })} />
                            </div>
                        </Field>
                        <span />
                        <Field label="Button 1 label"><TextInput value={selected.btn1Text} maxLength={32} onChange={v => update({ btn1Text: v })} /></Field>
                        <Field label="Button 1 link"><TextInput value={selected.btn1Url} onChange={v => update({ btn1Url: v })} placeholder="https://..." /></Field>
                        <Field label="Button 2 label"><TextInput value={selected.btn2Text} maxLength={32} onChange={v => update({ btn2Text: v })} /></Field>
                        <Field label="Button 2 link"><TextInput value={selected.btn2Url} onChange={v => update({ btn2Url: v })} placeholder="https://..." /></Field>
                    </div>
                </Card>
            </div>
        </Modal>
    );
}

export function openPresenceModal() {
    openModal(props => <PresenceModalInner {...props} />);
}
