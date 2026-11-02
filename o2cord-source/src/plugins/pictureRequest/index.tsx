/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * PictureRequest (Ryder only, turned on from debug o2): right-click someone >
 * "Picture request" opens a small box in the debug o2 look with [picture] and
 * [banner]. Pick a picture, crop it, and it's sent to them; their o2cord pops
 * it up in AvatarRequest's call box to accept or reject, and the answer comes
 * back in your DM with them. Kept out of the public build.
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { openCropModal } from "@plugins/avatarRequest/CropModal";
import { PictureKind, sendPictureTo } from "@plugins/avatarRequest";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { chooseFile } from "@utils/web";
import { User } from "@vencord/discord-types";
import { createRoot, IconUtils, Menu, UserStore, useEffect, useState } from "@webpack/common";

const isRyder = () => UserStore.getCurrentUser()?.id === String(Devs.Ryder.id);

function RequestBox({ user, close }: { user: User; close(): void; }) {
    const [status, setStatus] = useState("pick what to send");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) close(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [busy]);

    async function send(kind: PictureKind) {
        const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
        if (!file) return;
        const url = URL.createObjectURL(file);
        openCropModal(url, async png => {
            URL.revokeObjectURL(url);
            setBusy(true);
            setStatus(`sending the ${kind}...`);
            try {
                await sendPictureTo(user.id, kind, png);
                setStatus(`sent - their answer comes back in your DM`);
            } catch (e: any) {
                setStatus(`couldn't send it (${e?.body?.message ?? e?.message ?? "error"})`);
            } finally {
                setBusy(false);
            }
        }, kind);
    }

    return (
        <div className="o2-pr-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) close(); }}>
            <div className="o2-pr-box" role="dialog" aria-label="Picture request">
                <div className="o2-pr-bar">
                    <span>&gt; picture_request</span>
                    <button type="button" className="o2-pr-x" aria-label="Close" onClick={close} disabled={busy}>[x]</button>
                </div>
                <div className="o2-pr-user">
                    <img src={IconUtils.getUserAvatarURL(user, true, 64)} alt="" />
                    <span>
                        <span className="o2-pr-name">{(user as any).globalName || user.username}</span>
                        <span className="o2-pr-dim">@{user.username}</span>
                    </span>
                </div>
                <div className="o2-pr-actions">
                    <button type="button" className="o2-pr-btn" disabled={busy} onClick={() => send("avatar")}>[picture]</button>
                    <button type="button" className="o2-pr-btn" disabled={busy} onClick={() => send("banner")}>[banner]</button>
                </div>
                <div className="o2-pr-status">&gt; {status}</div>
                <div className="o2-pr-dim o2-pr-note">they accept or reject it · needs o2cord on their side · a banner needs their Nitro</div>
            </div>
        </div>
    );
}

let openBox: (() => void) | null = null;

function openRequestBox(user: User) {
    openBox?.();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const close = () => {
        root.unmount();
        host.remove();
        if (openBox === close) openBox = null;
    };
    openBox = close;
    root.render(<RequestBox user={user} close={close} />);
}

const UserContext: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || user.bot || !isRyder() || user.id === UserStore.getCurrentUser()?.id) return;
    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem id="o2-picture-request" label="Picture request" action={() => openRequestBox(user)} />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "PictureRequest",
    description: "Right-click someone > Picture request: send them a new profile picture or banner; they accept or reject it.",
    authors: [Devs.Ryder],
    enabledByDefault: false,

    contextMenus: {
        "user-context": UserContext
    },

    stop() {
        openBox?.();
    }
});
