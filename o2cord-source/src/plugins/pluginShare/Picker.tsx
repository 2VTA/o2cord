/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sendBotMessage } from "@api/Commands";
import { Button } from "@components/Button";
import { CALLIE_ID, plain, sendRequest } from "@plugins/callieRequests";
import { copyWithToast, sendMessage } from "@utils/discord";
import { isRealDebugOwner } from "@utils/o2Debug";
import { MARIE_BOT, sharePluginText } from "@utils/o2PluginShare";
import { RenderModalProps } from "@vencord/discord-types";

import { settings } from "./settings";
import { findCssClassesLazy } from "@webpack";
import { ChannelActionCreators, ChannelStore, Checkbox, Clickable, IconUtils, Modal, openModal, React, RelationshipStore, SelectedChannelStore, Text, TextInput, useCallback, useMemo, UserStore, useState } from "@webpack/common";

// Discord's own thin scrollbar classes (the ScrollerThin helper does not resolve on this Discord build, these do)
const ScrollClasses = findCssClassesLazy("thin", "scrollerBase", "fade");

interface Friend { id: string; name: string; sub: string; avatar: string; }

function friendList(): Friend[] {
    const out: Friend[] = [];
    for (const id of RelationshipStore.getFriendIDs()) {
        const u = UserStore.getUser(id);
        if (!u || u.bot) continue;
        const nick = RelationshipStore.getNickname(id);
        out.push({
            id,
            name: nick || u.globalName || u.username,
            sub: u.username,
            avatar: IconUtils.getUserAvatarURL(u, false, 40),
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

// One friend's row, memoised in Picker(): ticking one friend only redraws that row, not all of them (there can be 100+)
function RowImpl({ f, checked, toggle }: { f: Friend; checked: boolean; toggle(id: string): void; }) {
    return (
        <Clickable className="o2ps-friend" onClick={() => toggle(f.id)}>
            <img src={f.avatar} alt="" className="o2ps-avatar" loading="lazy" />
            <span className="o2ps-fname">
                <Text variant="text-md/semibold">{f.name}</Text>
                {f.sub !== f.name && <Text variant="text-xs/normal" className="o2ps-fsub">{f.sub}</Text>}
            </span>
            <Checkbox value={checked} onChange={() => toggle(f.id)} displayOnly size={24} />
        </Clickable>
    );
}

async function dmChannelOf(userId: string): Promise<string | null> {
    const existing = ChannelStore.getDMFromUserId(userId);
    if (existing) return existing;
    const id = await ChannelActionCreators.openPrivateChannel({ recipientIds: [userId], navigateToChannel: false });
    return typeof id === "string" ? id : ChannelStore.getDMFromUserId(userId) ?? null;
}

function Picker({ name, transitionState, onClose }: RenderModalProps & { name: string; }) {
    const friends = useMemo(friendList, []);
    // React.memo is made here, when the window opens - at the top of the file React is not loaded yet and that broke the whole client
    const Row = useMemo(() => React.memo(RowImpl), []);
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [status, setStatus] = useState<{ text: string; bad?: boolean; } | null>(null);
    const [busy, setBusy] = useState(false);

    const q = query.trim().toLowerCase();
    const shown = q ? friends.filter(f => f.name.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q)) : friends;
    const toggle = useCallback((id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]), []);

    // A bot does the sending (Marie for Ryder, Callie for everyone else), not you: she gets the plugin's name and the friends' ids in a DM, and messages them
    async function sendDirect() {
        setBusy(true);
        setStatus({ text: "Sending..." });
        const text = sharePluginText(name);
        const failed: string[] = [];
        let ok = 0;
        for (const id of picked) {
            try {
                const ch = await dmChannelOf(id);
                if (!ch) throw new Error("no DM");
                sendMessage(ch, { content: text });
                ok++;
            } catch {
                failed.push(friends.find(f => f.id === id)?.name ?? id);
            }
        }
        setBusy(false);
        setStatus({ text: `${ok ? `Sent to ${ok}. ` : ""}${failed.length ? `Could not send to: ${failed.join(", ")}` : "Their o2cord shows it as a card."}`, bad: !!failed.length });
        setPicked(failed.length ? picked.filter(id => failed.includes(friends.find(f => f.id === id)?.name ?? id)) : []);
    }

    async function send() {
        if (!picked.length || busy) return;
        if (settings.store.mode !== "bot") return void await sendDirect();
        setBusy(true);
        const bot = isRealDebugOwner() ? MARIE_BOT : { id: CALLIE_ID, name: "Callie" };
        setStatus({ text: `Asking ${bot.name}...` });
        const r = await sendRequest("share-plugin", { phrase: name + "\n" + picked.join(",") }, bot);
        setBusy(false);
        setStatus({ text: plain(r.text), bad: !r.ok });
        if (r.ok) setPicked([]);
    }

    async function copyOnly() {
        const text = sharePluginText(name);
        await copyWithToast(text, "Copied - paste it in any chat");
        const channelId = SelectedChannelStore.getChannelId();
        if (channelId) sendBotMessage(channelId, { content: `Copied! Paste it in any chat. This is what your friend will see:\n${text}` });
    }

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="sm"
            title={`Share ${name}`}
            subtitle={settings.store.mode === "bot" ? `Pick friends. ${isRealDebugOwner() ? "Marie" : "Callie"} sends them a message with a switch for the plugin.` : "Pick friends. They get a message with a switch for the plugin (Marie / Callie in their o2cord)."}
        >
            <div className="o2ps-picker">
                <TextInput placeholder="Search friends" value={query} onChange={setQuery} autoFocus />
                <div className={`${ScrollClasses.scrollerBase} ${ScrollClasses.thin} ${ScrollClasses.fade} o2ps-friends`}>
                    {shown.length === 0 && <div className="o2ps-empty">{friends.length ? "No friend matches." : "You have no friends added."}</div>}
                    {shown.map(f => <Row key={f.id} f={f} checked={picked.includes(f.id)} toggle={toggle} />)}
                </div>
                {status && <div className={status.bad ? "o2ps-status o2ps-bad" : "o2ps-status"}>{status.text}</div>}
                <div className="o2ps-actions">
                    <Button variant="secondary" size="small" onClick={copyOnly}>Copy link instead</Button>
                    <Button variant="primary" disabled={!picked.length || busy} onClick={send}>
                        {busy ? "Sending..." : picked.length ? `Send to ${picked.length}` : "Send"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export function openSharePicker(name: string) {
    openModal(props => <Picker {...props} name={name} />);
}
