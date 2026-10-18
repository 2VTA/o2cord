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
 * Everyone else: nothing - no menu item, no listener doing anything.
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { chooseFile } from "@utils/web";
import { User } from "@vencord/discord-types";
import { ChannelActionCreators, ChannelStore, createRoot, IconUtils, Menu, RestAPI, showToast, SnowflakeUtils, Toasts, UserStore, UserUtils, useState } from "@webpack/common";

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

async function sendRequest(png: Blob) {
    try {
        const channelId = await dmChannelWith(RYDER);
        if (!channelId) throw new Error("no DM");
        const file = new File([png], "o2cord-avatar-request.png", { type: "image/png" });
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
                content: `${MARKER} - asked to change your picture`,
                nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                attachments: [{ id: "0", filename: file.name, uploaded_filename: slot.upload_filename }]
            }
        });
        showToast("Sent to Ryder - he'll accept or reject it.", Toasts.Type.SUCCESS);
    } catch (e: any) {
        showToast(`Couldn't send it (${e?.body?.code ?? e?.status ?? e?.message ?? "error"}).`, Toasts.Type.FAILURE);
    }
}

async function startRequest() {
    const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
    if (!file) return;
    const url = URL.createObjectURL(file);
    openCropModal(url, png => {
        URL.revokeObjectURL(url);
        void sendRequest(png);
    });
}

const UserContext: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (user?.id !== RYDER || me() !== REQUESTER) return;
    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem id="o2-avatar-request" label="Change image" action={startRequest} />
        </Menu.MenuGroup>
    );
};

// -------------------------------------------------------------------- Ryder

interface Incoming { messageId: string; channelId: string; imageUrl: string; }

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

    async function accept() {
        setBusy("accept");
        try {
            const avatar = await toDataUrl(req.imageUrl);
            await RestAPI.patch({ url: "/users/@me", body: { avatar } });
            showToast("Your picture is changed.", Toasts.Type.SUCCESS);
            await markHandled(req.messageId);
            close();
        } catch (e: any) {
            const code = e?.body?.code ?? e?.status;
            showToast(code === 50035 || code === 429 ? "Discord says too many avatar changes - try again in a few minutes." : `Couldn't change it (${code ?? "error"}).`, Toasts.Type.FAILURE);
            setBusy("");
        }
    }

    async function reject() {
        setBusy("reject");
        try {
            await RestAPI.post({ url: `/channels/${CALLIE_CHANNEL_ID}/messages`, body: { content: `-pic-reject ${REQUESTER}` } });
        } catch {
            showToast("Couldn't reach Callie to tell them - rejected anyway.", Toasts.Type.MESSAGE);
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
                    <div className="o2-ar-call-sub">wants to change your picture</div>
                </div>
            </div>
            <img className="o2-ar-call-pic" src={req.imageUrl} alt="" />
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
    const requester = UserStore.getUser(REQUESTER) ?? await UserUtils.getUser(REQUESTER).catch(() => undefined);

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
    if (message?.author?.id !== REQUESTER) return null;
    if (typeof message.content !== "string" || !message.content.startsWith(MARKER)) return null;
    const att = message.attachments?.find((a: any) => /^image\//.test(a.content_type ?? "") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url ?? ""));
    if (!att) return null;
    return { messageId: message.id, channelId, imageUrl: att.url };
}

// requests that came while Discord was closed
async function checkMissed() {
    const channelId = ChannelStore.getDMFromUserId(REQUESTER);
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
    description: "Lets one friend send Ryder a new profile picture; Ryder accepts or rejects it from a call-style box.",
    authors: [Devs.Ryder],
    enabledByDefault: true,
    required: true,
    hidden: true,

    contextMenus: {
        "user-context": UserContext
    },

    flux: {
        MESSAGE_CREATE({ message, channelId, optimistic }: { message: any; channelId: string; optimistic: boolean; }) {
            if (optimistic || me() !== RYDER) return;
            const req = asRequest(message, channelId);
            if (req) queueRequest(req);
        },
        CONNECTION_OPEN() {
            if (me() === RYDER) setTimeout(checkMissed, 4000);
        }
    },

    async start() {
        handled = new Set((await DataStore.get<string[]>(HANDLED_KEY)) ?? []);
        if (me() === RYDER) setTimeout(checkMissed, 4000);
    }
});
