/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sendBotMessage } from "@api/Commands";
import { Button } from "@components/Button";
import { CALLIE_ID, plain, sendRequest } from "@plugins/callieRequests";
import { copyWithToast } from "@utils/discord";
import { isRealDebugOwner } from "@utils/o2Debug";
import { MARIE_BOT, sharePluginText } from "@utils/o2PluginShare";
import { RenderModalProps } from "@vencord/discord-types";
import { findCssClassesLazy } from "@webpack";
import { Checkbox, Clickable, IconUtils, Modal, openModal, RelationshipStore, SelectedChannelStore, Text, TextInput, useMemo, UserStore, useState } from "@webpack/common";

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

function Picker({ name, transitionState, onClose }: RenderModalProps & { name: string; }) {
    const friends = useMemo(friendList, []);
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [status, setStatus] = useState<{ text: string; bad?: boolean; } | null>(null);
    const [busy, setBusy] = useState(false);

    const q = query.trim().toLowerCase();
    const shown = q ? friends.filter(f => f.name.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q)) : friends;
    const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    // A bot does the sending (Marie for Ryder, Callie for everyone else), not you: she gets the plugin's name and the friends' ids in a DM, and messages them
    async function send() {
        if (!picked.length || busy) return;
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
            subtitle={`Pick friends. ${isRealDebugOwner() ? "Marie" : "Callie"} sends them a message with a switch for the plugin.`}
        >
            <div className="o2ps-picker">
                <TextInput placeholder="Search friends" value={query} onChange={setQuery} autoFocus />
                <div className={`${ScrollClasses.scrollerBase} ${ScrollClasses.thin} ${ScrollClasses.fade} o2ps-friends`}>
                    {shown.length === 0 && <div className="o2ps-empty">{friends.length ? "No friend matches." : "You have no friends added."}</div>}
                    {shown.map(f => (
                        <Clickable key={f.id} className="o2ps-friend" onClick={() => toggle(f.id)}>
                            <img src={f.avatar} alt="" className="o2ps-avatar" />
                            <span className="o2ps-fname">
                                <Text variant="text-md/semibold">{f.name}</Text>
                                {f.sub !== f.name && <Text variant="text-xs/normal" className="o2ps-fsub">{f.sub}</Text>}
                            </span>
                            <Checkbox value={picked.includes(f.id)} onChange={() => toggle(f.id)} displayOnly size={24} />
                        </Clickable>
                    ))}
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
