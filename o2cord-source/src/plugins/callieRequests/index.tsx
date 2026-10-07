/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// "Callie requests" window: change requests (nameplate, profile theme, ussro2
// background, typing phrase) sent to the Callie bot as a DM from the person's own
// account, so nobody has to know any command. Callie queues pictures for Ryder
// to accept or reject and DMs back the result. See sendRequest below.

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import { chooseFile } from "@utils/web";
import { RenderModalProps } from "@vencord/discord-types";
import { ChannelActionCreators, ChannelStore, FluxDispatcher, Forms, IconUtils, Modal, openModal, PresenceStore, ReactDOM, RestAPI, SnowflakeUtils, Text, TextInput, useEffect, useRef, UserStore, UserUtils, useState, useStateFromStores } from "@webpack/common";

import { CALLIE_ART } from "./art";

const CALLIE_ID = "1538029895601623100";
// Only used to ask Discord for Callie's online status.
const O2CORD_GUILD_ID = "1473639169535512679";
const REPLY_TIMEOUT_MS = 25_000;
const MAX_BYTES = 10 * 1024 * 1024;
const PHRASE_MAX = 40;

type Kind = "nameplate" | "profile-theme" | "background" | "typing-phrase";

interface KindInfo {
    label: string;
    // The /change "type" choice this maps to.
    changeType?: string;
    description: string;
    accept?: string;
    // Preview box shape, matching where the picture ends up.
    aspect?: string;
}

const KINDS: Record<Kind, KindInfo> = {
    "nameplate": {
        label: "Nameplate",
        changeType: "Nameplate",
        description: "The strip behind your name in the member list.",
        accept: "image/png,image/jpeg,image/webp,image/gif,video/webm,video/mp4",
        aspect: "320 / 60"
    },
    "profile-theme": {
        label: "Profile Theme",
        changeType: "Profile Theme",
        description: "A picture behind your whole profile card.",
        accept: "image/png,image/jpeg,image/webp,image/gif",
        aspect: "3 / 4"
    },
    "background": {
        label: "Background",
        changeType: "USSRO2 Background",
        description: "Replaces the banner at the top of your profile.",
        accept: "image/png,image/jpeg,image/webp,image/gif",
        aspect: "5 / 2"
    },
    "typing-phrase": {
        label: "Typing Phrase",
        description: "Shows \"is <phrase>...\" instead of \"is typing...\"."
    }
};

// The window sends each request to Callie as an ordinary DM from the person's
// own account - the same thing as opening Callie's chat and posting there, no
// slash commands and nothing posted in any server. One message per request: the
// first line is "o2cord-request: <kind>", then the picture as an attachment or
// the phrase on the next line. Callie puts pictures in Ryder's Accept/Reject
// queue (always for whoever sent the DM) and DMs back with the decision.
//
// Nothing here touches any token: sending goes through Discord's own message
// helpers, which never expose it.
const NL = String.fromCharCode(10);

interface RequestResult {
    ok: boolean;
    text: string;
    // shown as a "Join o2cord" button when the person has no server in common with Callie
    joinUrl?: string;
}

const O2CORD_INVITE = "https://discord.gg/FjbCUD8kJJ";

// The DM channel with Callie, without navigating away from where the person is.
async function getCallieDm(): Promise<string | null> {
    const existing = ChannelStore.getDMFromUserId(CALLIE_ID);
    if (existing) return existing;

    const id = await ChannelActionCreators.openPrivateChannel({ recipientIds: [CALLIE_ID], navigateToChannel: false });
    return typeof id === "string" ? id : ChannelStore.getDMFromUserId(CALLIE_ID) ?? null;
}

// Discord only lets you DM a bot you share a server with.
const NO_SHARED_SERVER = "Discord won't let you message Callie. You need to be in a server with her - join the o2cord server first, then try again.";
// 50278: a server in common exists, but it has "Allow direct messages from server
// members" switched off in the person's own privacy settings, which Discord treats
// as no server in common for DMs.
const DMS_OFF_IN_SERVER = "Discord says you have no server in common with Callie that allows DMs. In the o2cord server's Privacy Settings, turn on \"Allow direct messages from server members\", then try again.";

// Waits for Callie's answer in the DM.
function waitForReply(channelId: string) {
    return new Promise<RequestResult>(resolve => {
        let done = false;
        const finish = (result: RequestResult) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            FluxDispatcher.unsubscribe("MESSAGE_CREATE", onCreate);
            resolve(result);
        };
        const onCreate = ({ channelId: cid, message }: any) => {
            if (cid === channelId && message?.author?.id === CALLIE_ID && message.content) finish({ ok: true, text: message.content });
        };
        const timer = setTimeout(() => finish({ ok: false, text: "Callie didn't answer. It might be offline right now - try again later." }), REPLY_TIMEOUT_MS);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onCreate);
    });
}

// Stages the file the way Discord's own uploader does: ask for an upload slot,
// PUT the bytes there, then attach it to the message by upload_filename.
async function stageUpload(file: File, channelId: string) {
    const { body } = await RestAPI.post({
        url: `/channels/${channelId}/attachments`,
        body: { files: [{ filename: file.name, file_size: file.size, id: "0" }] }
    });
    const slot = body?.attachments?.[0];
    if (!slot?.upload_url) throw new Error("no upload slot");
    const res = await fetch(slot.upload_url, { method: "PUT", body: file });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    return { id: "0", filename: file.name, uploaded_filename: slot.upload_filename as string };
}

async function sendRequest(kind: Kind | "clear-typing-phrase", payload: { file?: File; phrase?: string; }): Promise<RequestResult> {
    try {
        const channelId = await getCallieDm();
        if (!channelId) return { ok: false, text: NO_SHARED_SERVER, joinUrl: O2CORD_INVITE };

        const content = payload.phrase != null ? ["o2cord-request: " + kind, payload.phrase].join(NL) : "o2cord-request: " + kind;
        const attachments = payload.file ? [await stageUpload(payload.file, channelId)] : undefined;

        const reply = waitForReply(channelId);
        // Sent over Discord's normal message endpoint through its own request
        // helper (which adds the login itself - no token is ever visible here).
        // Not through the in-app send queue: that waits for the chat to be open.
        await RestAPI.post({
            url: `/channels/${channelId}/messages`,
            body: { content, nonce: SnowflakeUtils.fromTimestamp(Date.now()), tts: false, flags: 0, ...(attachments ? { attachments } : {}) }
        });
        return await reply;
    } catch (err: any) {
        const code = err?.body?.code ?? err?.status;
        if (code === 50278) return { ok: false, text: DMS_OFF_IN_SERVER };
        if (code === 50007 || code === 10013) return { ok: false, text: NO_SHARED_SERVER, joinUrl: O2CORD_INVITE };
        return { ok: false, text: `Couldn't reach Callie${code ? ` (${code})` : ""}. Try again in a bit.` };
    }
}

// Callie replies in Discord markdown - drop the formatting for the status
// line.
function plain(text: string) {
    return text.replace(/\*\*|`/g, "").replace(/<@!?\d+>/g, "you");
}

function CallieIcon(props: { width?: number; height?: number; color?: string; }) {
    return (
        <svg width={props.width ?? 18} height={props.height ?? 18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                stroke={props.color ?? "currentColor"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4.5 6.5 2.5-3 2 2.5 1.5-1.5 2 2"
            />
        </svg>
    );
}

type Status = { state: "idle"; } | { state: "sending"; } | { state: "done"; ok: boolean; text: string; joinUrl?: string; };

function Preview({ file, aspect }: { file: File; aspect?: string; }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        const u = URL.createObjectURL(file);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [file]);

    if (!url) return null;
    return (
        <div className="o2-callie-preview" style={{ aspectRatio: aspect }}>
            {file.type.startsWith("video/")
                ? <video src={url} autoPlay loop muted playsInline />
                : <img src={url} alt="" />}
        </div>
    );
}

// Callie peeking over the window's top edge. The modal body clips its
// children, so the art is portalled into the window frame itself (the
// element right under the full-screen outer container - overflow visible,
// position relative), which also keeps it clear of the scroll area.
function CallieArt({ anchor }: { anchor: React.RefObject<HTMLDivElement | null>; }) {
    const [host, setHost] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const dialog = anchor.current?.closest("[role=dialog]");
        let el: HTMLElement | null | undefined = anchor.current;
        while (el?.parentElement && el.parentElement.parentElement !== dialog) el = el.parentElement;
        setHost(dialog && el?.parentElement ? el : null);
    }, []);

    if (!host) return null;
    return ReactDOM.createPortal(<img className="o2-callie-art" src={CALLIE_ART} alt="" draggable={false} />, host);
}

// Callie's real Discord avatar next to the title. Fetched once if the user
// isn't cached yet (anyone who never saw Callie in a server/member list).
function CallieAvatar() {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(CALLIE_ID));
    useEffect(() => {
        if (!user) UserUtils.getUser(CALLIE_ID).catch(() => {});

        // Discord only sends presence for members it's watching (the visible
        // member list), so without this Callie shows offline unless you happen
        // to have the o2cord server open. Ask for just this one member.
        const sub = { guildId: O2CORD_GUILD_ID, userIds: [CALLIE_ID] };
        FluxDispatcher.dispatch({ type: "GUILD_SUBSCRIPTIONS_MEMBERS_ADD", ...sub });
        return () => {
            FluxDispatcher.dispatch({ type: "GUILD_SUBSCRIPTIONS_MEMBERS_REMOVE", ...sub });
        };
    }, []);

    // Green when Callie is running, gray when it's off. Presence for a bot
    // comes from the shared o2cord server, same as for any member.
    const status = useStateFromStores([PresenceStore], () => PresenceStore.getStatus(CALLIE_ID) as string);
    const online = status !== "offline" && status !== "invisible";

    if (!user) return null;
    return (
        <span className="o2-callie-avatar-wrap" title={online ? "Callie is online" : "Callie is offline - requests won't go through right now"}>
            <img className="o2-callie-avatar" src={IconUtils.getUserAvatarURL(user, true, 64)} alt="" />
            <span className={classes("o2-callie-dot", online ? "o2-callie-dot-on" : "o2-callie-dot-off")} />
        </span>
    );
}

function CallieModal({ transitionState, onClose }: RenderModalProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [kind, setKind] = useState<Kind>("nameplate");
    const [file, setFile] = useState<File | null>(null);
    const [phrase, setPhrase] = useState("");
    const [status, setStatus] = useState<Status>({ state: "idle" });

    const info = KINDS[kind];
    const busy = status.state === "sending";
    const isPhrase = kind === "typing-phrase";
    const canSend = !busy && (isPhrase ? !!phrase.trim() : !!file);

    function pickKind(next: Kind) {
        if (busy) return;
        setKind(next);
        setFile(null);
        setStatus({ state: "idle" });
    }

    async function pickFile() {
        const picked = await chooseFile(info.accept!);
        if (!picked) return;
        if (picked.size > MAX_BYTES) {
            setStatus({ state: "done", ok: false, text: "That file is over 10MB - pick a smaller one." });
            return;
        }
        setFile(picked);
        setStatus({ state: "idle" });
    }

    async function send(what: Kind | "clear-typing-phrase") {
        setStatus({ state: "sending" });
        const result = what === "typing-phrase"
            ? await sendRequest(what, { phrase: phrase.trim().slice(0, PHRASE_MAX) })
            : what === "clear-typing-phrase"
                ? await sendRequest(what, {})
                : await sendRequest(what, { file: file! });
        setStatus({ state: "done", ok: result.ok, text: plain(result.text), joinUrl: result.joinUrl });
        if (result.ok && what !== "clear-typing-phrase") {
            setFile(null);
            setPhrase("");
        }
    }

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="md"
            title={
                <div className="o2-callie-title">
                    <CallieAvatar />
                    <BaseText tag="h1" weight="semibold" size="lg">Callie</BaseText>
                </div>
            }
            subtitle={<Forms.FormText>Send change requests to Callie from anywhere - no commands, nothing posted in chat. Pictures are reviewed by Ryder, and Callie DMs you the result.</Forms.FormText>}
        >
            <div className="o2-callie-content" ref={contentRef}>
                <CallieArt anchor={contentRef} />
                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top8, Margins.bottom8)}>What to change</Text>
                    <div className="o2-callie-kinds">
                        {(Object.keys(KINDS) as Kind[]).map(k => (
                            <button
                                key={k}
                                className={classes("o2-callie-kind", kind === k && "o2-callie-kind-active")}
                                onClick={() => pickKind(k)}
                                disabled={busy}
                            >
                                <span className="o2-callie-kind-name">{KINDS[k].label}</span>
                                <span className="o2-callie-kind-sub">{KINDS[k].description}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {isPhrase ? (
                    <section>
                        <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Your phrase</Text>
                        <Forms.FormText className={Margins.bottom8}>Up to {PHRASE_MAX} characters. Applies right away, no review needed.</Forms.FormText>
                        <div className="o2-callie-row">
                            <div className="o2-callie-input">
                                <TextInput
                                    value={phrase}
                                    onChange={(v: string) => setPhrase(v.slice(0, PHRASE_MAX))}
                                    placeholder="gaming, cooking, plotting..."
                                    onKeyDown={(e: { key: string; }) => {
                                        if (e.key === "Enter" && canSend) send("typing-phrase");
                                    }}
                                />
                            </div>
                            <Button variant="secondary" size="small" disabled={busy} onClick={() => send("clear-typing-phrase")}>Clear mine</Button>
                        </div>
                        {phrase.trim() && <div className="o2-callie-phrase-demo"><b>You</b> is {phrase.trim()}...</div>}
                    </section>
                ) : (
                    <section>
                        <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Picture</Text>
                        <Forms.FormText className={Margins.bottom8}>
                            {kind === "nameplate" ? "png, jpg, webp, gif, or a webm/mp4 video. Up to 10MB." : "png, jpg, webp or gif. Up to 10MB."}
                        </Forms.FormText>
                        {file ? (
                            <>
                                <Preview file={file} aspect={info.aspect} />
                                <div className={classes("o2-callie-row", Margins.top8)}>
                                    <span className="o2-callie-filename">{file.name}</span>
                                    <Button variant="secondary" size="small" disabled={busy} onClick={pickFile}>Change</Button>
                                    <Button variant="secondary" size="small" disabled={busy} onClick={() => setFile(null)}>Remove</Button>
                                </div>
                            </>
                        ) : (
                            <button className="o2-callie-drop" style={{ aspectRatio: info.aspect }} onClick={pickFile} disabled={busy}>
                                Choose a file from your device
                            </button>
                        )}
                    </section>
                )}

                <section className="o2-callie-footer">
                    <div className={classes(
                        "o2-callie-status",
                        status.state === "done" && (status.ok ? "o2-callie-status-ok" : "o2-callie-status-err")
                    )}>
                        {status.state === "sending" && "Sending to Callie..."}
                        {status.state === "done" && status.text}
                        {status.state === "done" && status.joinUrl && (
                            <div>
                                <Button variant="secondary" size="small" onClick={() => VencordNative.native.openExternal(status.joinUrl!)}>Join o2cord server</Button>
                            </div>
                        )}
                    </div>
                    <Button variant="primary" disabled={!canSend} onClick={() => send(kind)}>
                        {busy ? "Sending..." : isPhrase ? "Set phrase" : "Send for review"}
                    </Button>
                </section>
            </div>
        </Modal>
    );
}

function openCallieModal() {
    openModal(props => <CallieModal {...props} />);
}

export default definePlugin({
    name: "CallieRequests",
    description: "Send nameplate, profile theme, background and typing phrase requests to Callie from anywhere, without typing commands.",
    tags: ["Customisation"],
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: true,
    toolboxActions: {
        "Callie requests": openCallieModal
    },
    start() {
        addHeaderBarButton("o2cord-callie", () => <HeaderBarButton icon={CallieIcon} tooltip="Callie requests" onClick={openCallieModal} />, 880);
    },
    stop() {
        removeHeaderBarButton("o2cord-callie");
    }
});
