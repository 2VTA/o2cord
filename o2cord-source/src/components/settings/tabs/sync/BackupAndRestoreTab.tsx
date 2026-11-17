/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "@components/settings/tabs/vencord/o2Settings.css";

import { downloadSettingsBackup, uploadSettingsBackup } from "@api/SettingsSync/offline";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { applyShareCode, makeShareCode, readShareCode, type SharePart } from "@api/SettingsSync/shareCode";
import { copyToClipboard } from "@utils/clipboard";
import { Clickable, Toasts, useState } from "@webpack/common";

const toast = (type: string, message: string) => Toasts.show({ type, message, id: Toasts.genId() });

/** a step that never finishes must not lock the buttons for good */
const withTimeout = <T,>(p: Promise<T>, ms = 15000) =>
    Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("That took too long - try again")), ms))]);

const PART_LABELS: Array<[keyof SharePart, string]> = [
    ["plugins", "Plugins and their settings"],
    ["themes", "Theme links"],
    ["css", "Custom CSS"]
];

// A short text you can send to a friend instead of a file. Anything that looks like a secret is left out.
function ShareCodeCard() {
    const [parts, setParts] = useState<SharePart>({ plugins: true, themes: true, css: false });
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    // the result stays on the card (a toast can be missed or hidden behind this window)
    const [status, setStatus] = useState<{ ok: boolean; text: string; } | null>(null);

    const toggle = (key: keyof SharePart) => setParts({ ...parts, [key]: !parts[key] });
    const describe = (s: { plugins: number; themes: number; css: boolean; }) =>
        `${s.plugins} plugins, ${s.themes} theme links${s.css ? ", custom CSS" : ""}`;

    const copy = async () => {
        if (busy) return setStatus({ ok: true, text: "Still working on the last step..." });
        setBusy(true);
        setStatus({ ok: true, text: "Making the code..." });
        try {
            const { code, summary } = await withTimeout(makeShareCode(parts));
            await withTimeout(copyToClipboard(code));
            setStatus({ ok: true, text: `Code copied: ${describe(summary)}` });
            toast(Toasts.Type.SUCCESS, `Code copied: ${describe(summary)}`);
        } catch (err) {
            const text = `Couldn't make the code: ${(err as Error)?.message ?? String(err)}`;
            setStatus({ ok: false, text });
            toast(Toasts.Type.FAILURE, text);
        } finally { setBusy(false); }
    };

    const apply = async () => {
        if (busy) return setStatus({ ok: true, text: "Still working on the last step..." });
        if (!code.trim()) return setStatus({ ok: false, text: "Paste a code first (it starts with o2cord1:)" });
        setBusy(true);
        setStatus({ ok: true, text: "Applying..." });
        try {
            const data = await withTimeout(readShareCode(code));
            const done = await withTimeout(applyShareCode(data, parts));
            setCode("");
            const text = `Applied ${describe(done)}. Restart to finish.`;
            setStatus({ ok: true, text });
            toast(Toasts.Type.SUCCESS, text);
        } catch (err) {
            const text = String((err as Error)?.message ?? err);
            setStatus({ ok: false, text });
            toast(Toasts.Type.FAILURE, text);
        } finally { setBusy(false); }
    };

    return (
        <div className="o2s-card">
            <div className="o2s-row">
                <div>
                    <div className="o2s-row-title">Share code</div>
                    <div className="o2s-muted">One piece of text with your setup, to send to a friend. Tokens and private things are never included, and applying a code adds to your setup instead of replacing it.</div>
                </div>
            </div>
            <div className="o2s-row o2s-share-parts">
                {PART_LABELS.map(([key, label]) => (
                    <label key={key} className="o2s-check">
                        <input type="checkbox" checked={parts[key]} onChange={() => toggle(key)} /> {label}
                    </label>
                ))}
            </div>
            <div className="o2s-row">
                <div className="o2s-muted">Copy yours</div>
                <Clickable className="o2s-btn" onClick={copy}>Copy code</Clickable>
            </div>
            <div className="o2s-row o2s-share-paste">
                <textarea className="o2s-textarea" placeholder="Paste a code here (it starts with o2cord1:)" value={code} onChange={e => setCode(e.target.value)} rows={3} spellCheck={false} />
                <Clickable className="o2s-btn" onClick={apply}>{busy ? "Working..." : "Apply code"}</Clickable>
            </div>
            {status && <div className={"o2s-row o2s-share-status " + (status.ok ? "o2s-share-ok" : "o2s-share-bad")} role="status">{status.text}</div>}
        </div>
    );
}

// o2cord: one simple card - what's saved, and the two buttons.
function BackupAndRestoreTab() {
    return (
        <SettingsTab>
            <div className="o2s-page">
                <div className="o2s-hero">
                    <div className="o2s-grow">
                        <div className="o2s-hero-title">Backup</div>
                        <div className="o2s-muted">Save your o2cord settings to a file - your plugins and their settings, theme links and custom CSS. Load it on a new PC or after reinstalling.</div>
                    </div>
                </div>
                <div className="o2s-card">
                    <div className="o2s-row">
                        <div>
                            <div className="o2s-row-title">Save a backup</div>
                            <div className="o2s-muted">Downloads a .json file</div>
                        </div>
                        <Clickable className="o2s-btn" onClick={downloadSettingsBackup}>Save</Clickable>
                    </div>
                    <div className="o2s-row">
                        <div>
                            <div className="o2s-row-title">Load a backup</div>
                            <div className="o2s-muted">Replaces your current o2cord settings</div>
                        </div>
                        <Clickable className="o2s-btn" onClick={() => uploadSettingsBackup()}>Load</Clickable>
                    </div>
                </div>
                <ShareCodeCard />
            </div>
        </SettingsTab>
    );
}

export default wrapTab(BackupAndRestoreTab, "Backup & Restore");
