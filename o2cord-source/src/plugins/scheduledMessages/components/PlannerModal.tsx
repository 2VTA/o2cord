/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * "Schedule a Message" window, laid out like PluginModal at Ryder's request:
 * pick the time (12-hour with AM/PM), the server, the channel (from a list or
 * by pasting its ID) and the message, without having to open that channel.
 * Uses the plugin's own scheduler (addScheduledMessage), so these show up in
 * View Scheduled Messages too and are sent from the user's own account.
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { RenderModalProps } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import {
    ChannelStore, Forms, GuildChannelStore, GuildStore, Modal, openModal, PermissionsBits, PermissionStore,
    SearchableSelect, showToast, Text, TextArea, TextInput, Toasts, useEffect, useMemo, useState
} from "@webpack/common";

import { addScheduledMessage, getChannelDisplayInfo, getScheduledMessages, removeScheduledMessage } from "../utils";

const SortedGuildStore = findStoreLazy("SortedGuildStore");
const ID_RE = /^\d{17,20}$/;

type Period = "AM" | "PM";
type Repeat = "once" | "daily";

// Next time the clock shows hh:mm AM/PM - today if it's still ahead, else tomorrow.
function nextOccurrence(hour12: number, minute: number, period: Period) {
    const hour24 = (hour12 % 12) + (period === "PM" ? 12 : 0);
    const when = new Date();
    when.setHours(hour24, minute, 0, 0);
    if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
    return when;
}

function describeWhen(when: Date, repeat: Repeat = "once") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const day = when.toDateString() === new Date().toDateString() ? "today"
        : when.toDateString() === tomorrow.toDateString() ? "tomorrow"
            : when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const mins = Math.max(0, Math.round((when.getTime() - Date.now()) / 60000));
    const inText = mins < 60 ? `${mins} min`
        : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m`
            : `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
    if (repeat === "daily") return `Sends every day at ${time} until you remove it. First one ${day} (in ${inText})`;
    return `Sends ${day} at ${time} (in ${inText})`;
}

function guildOptions() {
    let ids: string[] = [];
    try { ids = SortedGuildStore.getFlattenedGuildIds(); } catch { }
    if (!ids.length) ids = Object.keys(GuildStore.getGuilds());
    return ids
        .map(id => GuildStore.getGuild(id))
        .filter(Boolean)
        .map(g => ({ label: g.name, value: g.id }));
}

// Text channels the user can actually post in.
function channelOptions(guildId: string) {
    const selectable: { channel: any; }[] = GuildChannelStore.getChannels(guildId)?.SELECTABLE ?? [];
    return selectable
        .map(({ channel }) => channel)
        .filter(c => (c.type === 0 || c.type === 5) && PermissionStore.can(PermissionsBits.SEND_MESSAGES, c))
        .map(c => ({ label: `# ${c.name}`, value: c.id }));
}

function PlannerModalInner({ transitionState, onClose }: RenderModalProps) {
    const [hour, setHour] = useState("12");
    const [minute, setMinute] = useState("00");
    const [period, setPeriod] = useState<Period>("AM");
    const [guildId, setGuildId] = useState<string>("");
    const [channelId, setChannelId] = useState<string>("");
    const [idInput, setIdInput] = useState("");
    const [content, setContent] = useState("");
    const [repeat, setRepeat] = useState<Repeat>("once");
    const [upcoming, setUpcoming] = useState(getScheduledMessages());
    const [, tick] = useState(0);

    // Keep the "in Xh Ym" countdown fresh while the window is open.
    useEffect(() => {
        const t = setInterval(() => tick(n => n + 1), 30_000);
        return () => clearInterval(t);
    }, []);

    const guilds = useMemo(guildOptions, []);
    const channels = useMemo(() => (guildId ? channelOptions(guildId) : []), [guildId]);

    const h = Number(hour), m = Number(minute);
    const timeValid = Number.isInteger(h) && h >= 1 && h <= 12 && Number.isInteger(m) && m >= 0 && m <= 59 && minute.length > 0;
    const when = timeValid ? nextOccurrence(h, m, period) : null;

    // Pasting a channel ID fills in the server and channel by itself.
    function onIdInput(value: string) {
        setIdInput(value);
        const id = value.trim();
        if (!ID_RE.test(id)) return;
        const channel = ChannelStore.getChannel(id);
        if (!channel?.guild_id) {
            showToast("No channel with that ID in your servers.", Toasts.Type.FAILURE);
            return;
        }
        setGuildId(channel.guild_id);
        setChannelId(id);
    }

    async function schedule() {
        if (!when || !channelId || !content.trim()) return;
        const channel = ChannelStore.getChannel(channelId);
        if (!channel || !PermissionStore.can(PermissionsBits.SEND_MESSAGES, channel)) {
            showToast("You can't send messages in that channel.", Toasts.Type.FAILURE);
            return;
        }
        const res = await addScheduledMessage(channelId, content.trim(), when.getTime(), undefined, repeat === "daily" ? "daily" : undefined);
        if (!res.success) {
            showToast(res.error ?? "Couldn't schedule the message.", Toasts.Type.FAILURE);
            return;
        }
        showToast(repeat === "daily" ? "Message will be sent every day." : "Message scheduled.", Toasts.Type.SUCCESS);
        setContent("");
        setUpcoming(getScheduledMessages());
    }

    async function cancel(id: string) {
        await removeScheduledMessage(id);
        setUpcoming(getScheduledMessages());
    }

    const canSchedule = !!when && !!channelId && !!content.trim();

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="md"
            title={<BaseText tag="h1" weight="semibold" size="lg">Schedule a Message</BaseText>}
            subtitle={<Forms.FormText>Sent from your account at the time you pick, once or every day. Discord has to be open at that time.</Forms.FormText>}
        >
            <div className="o2-planner">
                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top8, Margins.bottom8)}>Time</Text>
                    <div className="o2-planner-time">
                        <div className="o2-planner-num">
                            <TextInput
                                value={hour}
                                maxLength={2}
                                onChange={v => setHour(v.replace(/\D/g, ""))}
                                placeholder="12"
                            />
                        </div>
                        <span className="o2-planner-colon">:</span>
                        <div className="o2-planner-num">
                            <TextInput
                                value={minute}
                                maxLength={2}
                                onChange={v => setMinute(v.replace(/\D/g, ""))}
                                placeholder="00"
                            />
                        </div>
                        <div className="o2-planner-switch" role="radiogroup">
                            {(["AM", "PM"] as const).map(p => (
                                <button
                                    key={p}
                                    role="radio"
                                    aria-checked={period === p}
                                    className={classes("o2-planner-switch-btn", period === p && "o2-planner-switch-on")}
                                    onClick={() => setPeriod(p)}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Forms.FormText className={classes("o2-planner-when", !timeValid && "o2-planner-error")}>
                        {when ? describeWhen(when, repeat) : "Hour 1-12, minute 00-59."}
                    </Forms.FormText>
                </section>

                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Repeat</Text>
                    <div className="o2-planner-switch o2-planner-switch-wide" role="radiogroup">
                        {([["once", "Once"], ["daily", "Every day"]] as const).map(([value, label]) => (
                            <button
                                key={value}
                                role="radio"
                                aria-checked={repeat === value}
                                className={classes("o2-planner-switch-btn", repeat === value && "o2-planner-switch-on")}
                                onClick={() => setRepeat(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <Forms.FormText className={Margins.top8}>
                        {repeat === "daily"
                            ? "Sent at this time every day, over and over, until you remove it from Upcoming below."
                            : "Sent one time, then it's gone."}
                    </Forms.FormText>
                </section>

                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Server</Text>
                    <SearchableSelect
                        options={guilds}
                        value={guilds.find(g => g.value === guildId)?.value}
                        placeholder="Pick a server"
                        closeOnSelect
                        onChange={(v: string) => { setGuildId(v); setChannelId(""); setIdInput(""); }}
                    />
                </section>

                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Channel</Text>
                    <SearchableSelect
                        options={channels}
                        value={channels.find(c => c.value === channelId)?.value}
                        placeholder={guildId ? "Pick a channel" : "Pick a server first"}
                        isDisabled={!guildId}
                        closeOnSelect
                        onChange={(v: string) => { setChannelId(v); setIdInput(""); }}
                    />
                    <Forms.FormText className={classes(Margins.top8, Margins.bottom8)}>Or paste a channel ID:</Forms.FormText>
                    <TextInput value={idInput} onChange={onIdInput} placeholder="e.g. 1234567890123456789" />
                </section>

                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Message</Text>
                    <TextArea value={content} onChange={setContent} placeholder="What should it say?" rows={3} />
                </section>

                <div className="o2-planner-actions">
                    <Button variant="primary" size="medium" disabled={!canSchedule} onClick={schedule}>Schedule</Button>
                </div>

                {upcoming.length > 0 && (
                    <section>
                        <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Upcoming</Text>
                        <div className="o2-planner-list">
                            {upcoming.map(msg => {
                                const info = getChannelDisplayInfo(msg.channelId);
                                const channel = ChannelStore.getChannel(msg.channelId);
                                const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
                                return (
                                    <div key={msg.id} className="o2-planner-item">
                                        {info.avatar ? <img className="o2-planner-item-icon" src={info.avatar} alt="" /> : <div className="o2-planner-item-icon" />}
                                        <div className="o2-planner-item-meta">
                                            <span className="o2-planner-item-where">{guild ? `${guild.name} · ` : ""}#{info.name}</span>
                                            <span className="o2-planner-item-text">{msg.content}</span>
                                            <span className="o2-planner-item-time">
                                                {msg.repeat === "daily"
                                                    ? `Every day at ${new Date(msg.scheduledTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} · next ${describeWhen(new Date(msg.scheduledTime)).replace(/^Sends /, "")}`
                                                    : describeWhen(new Date(msg.scheduledTime)).replace(/^Sends /, "")}
                                            </span>
                                        </div>
                                        <Button variant="dangerSecondary" size="small" onClick={() => cancel(msg.id)}>{msg.repeat === "daily" ? "Remove" : "Cancel"}</Button>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </div>
        </Modal>
    );
}

export const PlannerModal = ErrorBoundary.wrap(PlannerModalInner, { noop: true });

export function openPlannerModal() {
    openModal(props => <PlannerModal {...props} />);
}
