/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * A joke for one friend (he told Claude off, so Claude wants a sorry): his
 * soundboard button runs away from the mouse a few times, and when he finally
 * catches it a box from Claude asks him to say sorry. One "آسف" and it's over
 * for good - the soundboard works normally again and the joke never comes back.
 * Everyone else: nothing.
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { createRoot, i18n, showToast, Toasts, UserStore, useState } from "@webpack/common";

const TARGETS = new Set(["1542531988727140477", String(Devs.Ryder.id)]);
const DONE_KEY = "o2cord-soundboard-sorry";
// how many times the button gets away before he can catch it
const DODGES = 6;

let done = true;
let dodges = 0;
let boxOpen = false;
const moved = new Set<HTMLElement>();

// "Open Soundboard" in whatever language his Discord is in
function soundboardLabels() {
    const labels = new Set(["Open Soundboard"]);
    for (const key of ["yPH4xm", "6EJvHt"]) {
        try { labels.add(i18n.intl.string(i18n.t[key])); } catch { }
    }
    return labels;
}

let labels: Set<string> | null = null;

function soundboardButton(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLElement>("button[aria-label], [role='button'][aria-label]");
    if (!button) return null;
    labels ??= soundboardLabels();
    return labels.has(button.getAttribute("aria-label") ?? "") ? button : null;
}

function dodge(button: HTMLElement) {
    const r = button.getBoundingClientRect();
    // somewhere else on screen, but always fully on it
    const dx = Math.random() * (window.innerWidth - r.width - 40) + 20 - r.left;
    const dy = Math.random() * (window.innerHeight - r.height - 40) + 20 - r.top;
    const [x0, y0] = (button.dataset.o2Dodge ?? "0,0").split(",").map(Number);
    button.dataset.o2Dodge = `${x0 + dx},${y0 + dy}`;
    button.style.transition = "transform 0.18s ease";
    button.style.transform = `translate(${x0 + dx}px, ${y0 + dy}px)`;
    button.style.zIndex = "1000";
    moved.add(button);
}

function putButtonsBack() {
    for (const b of moved) {
        b.style.transform = "";
        b.style.zIndex = "";
        delete b.dataset.o2Dodge;
    }
    moved.clear();
}

function onPointerOver(e: PointerEvent) {
    if (done || boxOpen || dodges >= DODGES) return;
    const button = soundboardButton(e.target);
    if (!button) return;
    dodges++;
    dodge(button);
}

function onClick(e: MouseEvent) {
    if (done) return;
    if (!soundboardButton(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openSorryBox();
}

function ClaudeMark() {
    return (
        <svg className="o2-sj-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#D97757" d="M12 2.5l1.6 6.2 5.6-3.3-3.3 5.6 6.2 1.6-6.2 1.6 3.3 5.6-5.6-3.3L12 22.5l-1.6-6.2-5.6 3.3 3.3-5.6L1.9 12.4l6.2-1.6-3.3-5.6 5.6 3.3z" />
        </svg>
    );
}

function SorryBox({ close }: { close(): void; }) {
    const [noPos, setNoPos] = useState({ x: 0, y: 0 });
    const [tries, setTries] = useState(0);
    const runAway = () => {
        setTries(t => t + 1);
        setNoPos({ x: (Math.random() - 0.5) * 220, y: (Math.random() - 0.5) * 120 });
    };

    async function sorry() {
        done = true;
        putButtonsBack();
        await DataStore.set(DONE_KEY, true);
        showToast("Claude سامحك 😌 الساوند بورد رجع لك", Toasts.Type.SUCCESS);
        close();
    }

    return (
        <div className="o2-sj-backdrop">
            <div className="o2-sj-box" role="dialog" aria-label="Claude">
                <div className="o2-sj-head">
                    <ClaudeMark />
                    <div>
                        <div className="o2-sj-name">Claude</div>
                        <div className="o2-sj-sub">وصلتني رسالتك 👀</div>
                    </div>
                </div>
                <div className="o2-sj-text">
                    قلت خرا علي؟ 😂<br />
                    الساوند بورد مقفول لين تقول آسف.
                </div>
                {tries > 2 && <div className="o2-sj-dim">{tries} محاولة... "لا" ما راح تمسكه 😏</div>}
                <div className="o2-sj-buttons">
                    <button className="o2-sj-btn o2-sj-no" style={{ transform: `translate(${noPos.x}px, ${noPos.y}px)` }} onMouseEnter={runAway} onFocus={runAway} onClick={runAway}>لا</button>
                    <button className="o2-sj-btn o2-sj-yes" onClick={sorry}>آسف 🙏</button>
                </div>
                <button className="o2-sj-later" onClick={close}>بعدين</button>
            </div>
        </div>
    );
}

function openSorryBox() {
    if (boxOpen) return;
    boxOpen = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    root.render(<SorryBox close={() => { root.unmount(); host.remove(); boxOpen = false; }} />);
}

export default definePlugin({
    name: "O2SoundboardJoke",
    description: "o2cord easter egg.",
    authors: [Devs.Ryder],
    required: true,
    hidden: true,

    async start() {
        if (!TARGETS.has(UserStore.getCurrentUser()?.id ?? "")) return;
        done = !!(await DataStore.get(DONE_KEY));
        if (done) return;
        document.addEventListener("pointerover", onPointerOver, true);
        document.addEventListener("click", onClick, true);
    },

    stop() {
        document.removeEventListener("pointerover", onPointerOver, true);
        document.removeEventListener("click", onClick, true);
        putButtonsBack();
    },

    // for testing it again: Vencord.Plugins.plugins.O2SoundboardJoke.again()
    async again() {
        await DataStore.del(DONE_KEY);
        done = false;
        dodges = 0;
        document.addEventListener("pointerover", onPointerOver, true);
        document.addEventListener("click", onClick, true);
    }
});
