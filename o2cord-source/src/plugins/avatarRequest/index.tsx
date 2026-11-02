/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AvatarRequest - one friend (REQUESTER) can suggest a new avatar for Ryder.
 *
 * Requester: right-click Ryder > "Change image" > pick a picture > crop it in
 * an "Edit Image" window > Apply. The picture goes to Ryder as a normal DM
 * (marker text + PNG), sent through Discord's own request helper.
 *
 * Ryder: the request pops up like an incoming call - small box at the top
 * centre, the picture in the middle, Accept / Reject under it. Accept sets the
 * picture as his avatar right away (his own click, his own account settings).
 * Reject asks Callie (`-pic-reject <id>` in #callie) to DM the requester
 * "sorry {user} but boss dont want this pic". Requests that arrived while his
 * Discord was closed pop up the next time it opens.
 *
 * "Change image (server)" does the same for Ryder's picture in one server only
 * (shown when right-clicking him inside a server you're both in); accepting it
 * sets his server profile picture there.
 *
 * The other way round, Ryder can suggest a new picture or banner to anyone from
 * debug o2 ("[ picture request ]"); they get the same box and their answer is
 * sent back to him. Everyone else: no menu item, and only DMs from Ryder (or,
 * for Ryder, from the friend) are ever looked at.
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { chooseFile } from "@utils/web";
import { User } from "@vencord/discord-types";
import { ChannelActionCreators, ChannelStore, createRoot, FluxDispatcher, GuildMemberStore, GuildStore, IconUtils, Menu, RestAPI, showToast, SnowflakeUtils, Toasts, UserStore, UserUtils, useState } from "@webpack/common";

import { openCropModal } from "./CropModal";

const RYDER = String(Devs.Ryder.id);
const REQUESTER = "1542531988727140477";
const MARKER = "o2cord-avatar-request";
const CALLIE_CHANNEL_ID = "1538034368751083550"; // #callie - Callie reads -pic-reject there
const HANDLED_KEY = "o2cord.avatarRequest.handled";

const me = () => UserStore.getCurrentUser()?.id;

// ---------------------------------------------------------------- requester

async function dmChannelWith(userId: string): Promise<string | null> {
    const existing = ChannelStore.getDMFromUserId(userId);
    if (existing) return existing;
    const id = await ChannelActionCreators.openPrivateChannel({ recipientIds: [userId], navigateToChannel: false });
    return typeof id === "string" ? id : ChannelStore.getDMFromUserId(userId) ?? null;
}

// "o2cord-avatar-request" = his main picture, "o2cord-avatar-request:server:<id>" = his picture in that server
const SERVER_MARKER = /^o2cord-avatar-request:server:(\d{17,20})\b/;

// a DM with the marker text and the PNG, through Discord's own upload slots
async function sendImage(channelId: string, png: Blob, filename: string, content: string) {
    const file = new File([png], filename, { type: "image/png" });
    const { body } = await RestAPI.post({
        url: `/channels/${channelId}/attachments`,
        body: { files: [{ filename: file.name, file_size: file.size, id: "0" }] }
    });
    const slot = body?.attachments?.[0];
    if (!slot?.upload_url) throw new Error("no upload slot");
    const put = await fetch(slot.upload_url, { method: "PUT", body: file });
    if (!put.ok) throw new Error(`upload ${put.status}`);
    await RestAPI.post({
        url: `/channels/${channelId}/messages`,
        body: {
            content,
            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
            attachments: [{ id: "0", filename: file.name, uploaded_filename: slot.upload_filename }]
        }
    });
}

async function sendRequest(png: Blob, guildId?: string) {
    try {
        const channelId = await dmChannelWith(RYDER);
        if (!channelId) throw new Error("no DM");
        await sendImage(channelId, png, "o2cord-avatar-request.png", guildId
            ? `${MARKER}:server:${guildId} - asked to change your picture in ${GuildStore.getGuild(guildId)?.name ?? "a server"}`
            : `${MARKER} - asked to change your picture`);
        showToast("Sent to Ryder - he'll accept or reject it.", Toasts.Type.SUCCESS);
    } catch (e: any) {
        showToast(`Couldn't send it (${e?.body?.code ?? e?.status ?? e?.message ?? "error"}).`, Toasts.Type.FAILURE);
    }
}

async function startRequest(guildId?: string) {
    const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
    if (!file) return;
    const url = URL.createObjectURL(file);
    openCropModal(url, png => {
        URL.revokeObjectURL(url);
        void sendRequest(png, guildId);
    });
}

const UserContext: NavContextMenuPatchCallback = (children, { user, guildId }: { user?: User; guildId?: string; }) => {
    if (user?.id !== RYDER || me() !== REQUESTER) return;
    // the server option only inside a server Ryder is in
    const inServer = !!guildId && GuildMemberStore.isMember(guildId, RYDER);
    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem id="o2-avatar-request" label="Change image" action={() => startRequest()} />
            {inServer && <Menu.MenuItem id="o2-avatar-request-server" label="Change image (server)" action={() => startRequest(guildId)} />}
        </Menu.MenuGroup>
    );
};

// ------------------------------------------------------- Ryder -> anyone
// The other way round: Ryder suggests a new picture or banner to someone with
// o2cord (his PictureRequest plugin sends it). It arrives as a DM from Ryder
// (marker + PNG) and pops up in the same call-style box; Accept sets it on
// their own account, and their answer goes back to Ryder in that DM. Only
// Ryder's own DMs are ever read.

const FROM_MARKER = "o2cord-pic-from-ryder";
// "...:avatar" / "...:banner", or with ":server:<id>" for their profile in one server
const FROM_RE = /^o2cord-pic-from-ryder:(avatar|banner)(?::server:(\d{17,20}))?\b/;
const ANSWER_MARKER = "o2cord-pic-answer";
const ANSWER_RE = /^o2cord-pic-answer:(accepted|rejected):(avatar|banner)\b/;
export type PictureKind = "avatar" | "banner";

export async function sendPictureTo(userId: string, kind: PictureKind, png: Blob, guildId?: string) {
    if (me() !== RYDER) throw new Error("only Ryder can send these");
    const channelId = await dmChannelWith(userId);
    if (!channelId) throw new Error("couldn't open a DM with them");
    const what = kind === "banner" ? "banner" : "picture";
    const where = guildId ? ` in ${GuildStore.getGuild(guildId)?.name ?? "a server"}` : "";
    await sendImage(
        channelId, png, `o2cord-${kind}.png`,
        `${FROM_MARKER}:${kind}${guildId ? `:server:${guildId}` : ""} - Ryder wants to change your ${what}${where}. Open Discord with o2cord to accept or reject it.`
    );
}

// ------------------------------------------------------------ the call box

interface Incoming {
    messageId: string;
    channelId: string;
    imageUrl: string;
    from: string;
    kind: PictureKind;
    /** true = the friend's request to Ryder, false = Ryder's suggestion to someone */
    toRyder: boolean;
    guildId?: string;
}

let handled: Set<string> = new Set();
const shown = new Set<string>();

async function markHandled(id: string) {
    handled.add(id);
    await DataStore.set(HANDLED_KEY, [...handled].slice(-50));
}

async function toDataUrl(url: string) {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

function CallBox({ req, requester, close }: { req: Incoming; requester?: User; close(): void; }) {
    const [busy, setBusy] = useState<"" | "accept" | "reject">("");
    const name = requester?.globalName || requester?.username || "Someone";
    const guildName = req.guildId ? GuildStore.getGuild(req.guildId)?.name ?? "a server" : "";

    const what = req.kind === "banner" ? "banner" : "picture";

    // Ryder's suggestion: the answer goes back to him in the same DM (hidden
    // from the chat by o2cord, he gets a notification instead)
    async function answerRyder(answer: "accepted" | "rejected") {
        const text = `${ANSWER_MARKER}:${answer}:${req.kind} - ${answer === "accepted" ? "✅ Accepted" : "❌ Rejected"} the ${what}.`;
        try {
            await RestAPI.post({ url: `/channels/${req.channelId}/messages`, body: { content: text, nonce: SnowflakeUtils.fromTimestamp(Date.now()) } });
        } catch { /* the change itself is what matters */ }
    }

    async function accept() {
        setBusy("accept");
        try {
            const image = await toDataUrl(req.imageUrl);
            const body = req.kind === "banner" ? { banner: image } : { avatar: image };
            if (req.guildId) await RestAPI.patch({ url: `/guilds/${req.guildId}/members/@me`, body });
            else await RestAPI.patch({ url: "/users/@me", body });
            showToast(req.guildId ? `Your ${what} in ${guildName} is changed.` : `Your ${what} is changed.`, Toasts.Type.SUCCESS);
            if (!req.toRyder) await answerRyder("accepted");
            await markHandled(req.messageId);
            close();
        } catch (e: any) {
            const code = e?.body?.code ?? e?.status;
            const why = code === 429 ? `Discord says too many ${what} changes - try again in a few minutes.`
                : req.kind === "banner" && (code === 50013 || code === 50035 || code === 20009) ? "Discord refused the banner (a profile banner needs Nitro)."
                    : req.guildId && (code === 50013 || code === 50035 || code === 20009) ? `Discord refused the server ${what} (per-server profiles need Nitro).`
                        : code === 50035 ? `Discord says too many ${what} changes - try again in a few minutes.`
                            : `Couldn't change it (${code ?? "error"}).`;
            showToast(why, Toasts.Type.FAILURE);
            setBusy("");
        }
    }

    async function reject() {
        setBusy("reject");
        if (req.toRyder) {
            try {
                await RestAPI.post({ url: `/channels/${CALLIE_CHANNEL_ID}/messages`, body: { content: `-pic-reject ${REQUESTER}` } });
            } catch {
                showToast("Couldn't reach Callie to tell them - rejected anyway.", Toasts.Type.MESSAGE);
            }
        } else {
            await answerRyder("rejected");
        }
        await markHandled(req.messageId);
        close();
    }

    return (
        <div className="o2-ar-call">
            <div className="o2-ar-call-head">
                {requester && <img className="o2-ar-call-avatar" src={IconUtils.getUserAvatarURL(requester, true, 64)} alt="" />}
                <div>
                    <div className="o2-ar-call-name">{name}</div>
                    <div className="o2-ar-call-sub">{req.guildId ? `wants to change your ${what} in ${guildName}` : `wants to change your ${what}`}</div>
                </div>
            </div>
            <img className={req.kind === "banner" ? "o2-ar-call-pic o2-ar-call-banner" : "o2-ar-call-pic"} src={req.imageUrl} alt="" />
            {!req.toRyder && <div className="o2-ar-call-note">Ryder sees your answer.</div>}
            <div className="o2-ar-call-buttons">
                <button className="o2-ar-call-btn o2-ar-reject" disabled={!!busy} onClick={reject}>{busy === "reject" ? "..." : "Reject"}</button>
                <button className="o2-ar-call-btn o2-ar-accept" disabled={!!busy} onClick={accept}>{busy === "accept" ? "..." : "Accept"}</button>
            </div>
            <button className="o2-ar-call-later" disabled={!!busy} onClick={close} title="Ask again next time Discord opens">later</button>
        </div>
    );
}

// one box at a time, queued
const queue: Incoming[] = [];
let showing = false;

async function showNext() {
    if (showing || !queue.length) return;
    showing = true;
    const req = queue.shift()!;
    const requester = UserStore.getUser(req.from) ?? await UserUtils.getUser(req.from).catch(() => undefined);

    const host = document.createElement("div");
    host.className = "o2-ar-call-host";
    document.body.append(host);
    const root = createRoot(host);
    const close = () => {
        root.unmount();
        host.remove();
        showing = false;
        void showNext();
    };
    root.render(<CallBox req={req} requester={requester} close={close} />);
}

function queueRequest(req: Incoming) {
    if (handled.has(req.messageId) || shown.has(req.messageId)) return;
    shown.add(req.messageId);
    queue.push(req);
    void showNext();
}

function asRequest(message: any, channelId: string): Incoming | null {
    const content = message?.content;
    if (typeof content !== "string") return null;
    const author = message.author?.id;
    // only ever in the DM between the two of them
    if (author === REQUESTER && me() === RYDER && content.startsWith(MARKER)) {
        if (channelId !== ChannelStore.getDMFromUserId(REQUESTER)) return null;
    } else if (author === RYDER && me() !== RYDER && FROM_RE.test(content)) {
        if (channelId !== ChannelStore.getDMFromUserId(RYDER)) return null;
    } else return null;

    const att = message.attachments?.find((a: any) => /^image\//.test(a.content_type ?? "") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url ?? ""));
    if (!att) return null;
    const toRyder = author === REQUESTER;
    const from = toRyder ? null : content.match(FROM_RE)!;
    return {
        messageId: message.id,
        channelId,
        imageUrl: att.url,
        from: author,
        kind: from ? from[1] as PictureKind : "avatar",
        toRyder,
        guildId: from ? from[2] : content.match(SERVER_MARKER)?.[1]
    };
}

// ---- out of the chat
// The requests and answers travel as DMs (that's how the picture gets there),
// but o2cord never lets them reach the chat: they're caught before Discord
// handles them - no message, no unread, no notification - and only the box
// shows. People without o2cord still see a normal DM.

const hiddenIds = new Set<string>();

function isOurs(message: any, channelId: string | undefined) {
    const content = message?.content;
    if (typeof content !== "string") return false;
    if (!content.startsWith(MARKER) && !FROM_RE.test(content) && !ANSWER_RE.test(content)) return false;
    return !!channelId && !!ChannelStore.getChannel(channelId)?.isDM?.();
}

function onAnswer(message: any) {
    const m = message.content.match(ANSWER_RE);
    if (!m || me() !== RYDER || message.author?.id === RYDER) return;
    const who = message.author?.global_name || message.author?.username || "They";
    const what = m[2] === "banner" ? "banner" : "picture";
    showNotification({
        title: m[1] === "accepted" ? `✅ ${who} accepted` : `❌ ${who} rejected`,
        body: `your ${what} request`,
        icon: message.author?.avatar ? IconUtils.getUserAvatarURL(message.author, true, 64) : undefined
    });
}

function interceptor(e: any): boolean {
    try {
        if (e.type === "MESSAGE_CREATE") {
            const channelId = e.channelId ?? e.message?.channel_id;
            if (!isOurs(e.message, channelId)) return false;
            hiddenIds.add(e.message.id);
            if (!e.optimistic) {
                const req = asRequest(e.message, channelId);
                if (req) queueRequest(req);
                else onAnswer(e.message);
            }
            return true;
        }
        if (e.type === "MESSAGE_UPDATE") {
            return hiddenIds.has(e.message?.id) || isOurs(e.message, e.message?.channel_id);
        }
        // a chat being opened or scrolled: leave ours out of what gets loaded
        if (Array.isArray(e.messages) && typeof e.channelId === "string") {
            for (let i = e.messages.length - 1; i >= 0; i--) {
                if (isOurs(e.messages[i], e.channelId)) e.messages.splice(i, 1);
            }
        }
    } catch { /* never break Discord's own handling */ }
    return false;
}

// requests that came while Discord was closed
async function checkMissed() {
    const channelId = ChannelStore.getDMFromUserId(me() === RYDER ? REQUESTER : RYDER);
    if (!channelId) return;
    try {
        const { body } = await RestAPI.get({ url: `/channels/${channelId}/messages`, query: { limit: 20 } });
        const day = Date.now() - 7 * 24 * 3600 * 1000;
        for (const m of [...(body ?? [])].reverse()) {
            const req = asRequest(m, channelId);
            if (req && SnowflakeUtils.extractTimestamp(m.id) > day) queueRequest(req);
        }
    } catch { /* try again next launch */ }
}

export default definePlugin({
    name: "AvatarRequest",
    description: "Lets one friend send Ryder a new profile picture, and Ryder suggest a picture or banner to anyone; the other side accepts or rejects it from a call-style box.",
    authors: [Devs.Ryder],
    enabledByDefault: true,
    required: true,
    hidden: true,

    contextMenus: {
        "user-context": UserContext
    },

    // new requests come in through the interceptor (they never reach the chat)
    flux: {
        CONNECTION_OPEN() {
            setTimeout(checkMissed, 4000);
        }
    },

    async start() {
        FluxDispatcher.addInterceptor(interceptor);
        handled = new Set((await DataStore.get<string[]>(HANDLED_KEY)) ?? []);
        setTimeout(checkMissed, 4000);
    },

    stop() {
        const list = FluxDispatcher._interceptors ?? [];
        const i = list.indexOf(interceptor);
        if (i !== -1) list.splice(i, 1);
    }
});
