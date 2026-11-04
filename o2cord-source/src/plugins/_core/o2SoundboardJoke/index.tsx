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

const TARGETS = new Set(["1542531988727140477"]);
const DONE_KEY = "o2cord-soundboard-sorry";
// how many times the button gets away before he can catch it
const DODGES = 6;

// the account isn't known yet when plugins start, so it's checked on every event
let forceForTest = false;
const isTarget = () => forceForTest || TARGETS.has(UserStore.getCurrentUser()?.id ?? "");

let done = false;
let dodges = 0;
let boxOpen = false;
// the real buttons we hid, and the floating copy that runs around instead: the
// real one can't move far - Discord's panels clip whatever sticks out of them
const hidden = new Set<HTMLElement>();
let fake: HTMLElement | null = null;

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

const isFake = (target: EventTarget | null) => !!fake && target instanceof Node && fake.contains(target);

// the copy jumps somewhere else on screen (always fully on it)
function moveFake() {
    if (!fake) return;
    const w = fake.offsetWidth, h = fake.offsetHeight;
    fake.style.left = `${Math.round(Math.random() * (window.innerWidth - w - 40) + 20)}px`;
    fake.style.top = `${Math.round(Math.random() * (window.innerHeight - h - 40) + 20)}px`;
}

function runAway(button: HTMLElement) {
    if (!fake) {
        const r = button.getBoundingClientRect();
        fake = document.createElement("div");
        fake.className = "o2-sj-fake";
        fake.style.width = `${r.width}px`;
        fake.style.height = `${r.height}px`;
        fake.style.left = `${r.left}px`;
        fake.style.top = `${r.top}px`;
        // a copy of the button itself, so it looks like the real one running off
        const copy = button.cloneNode(true) as HTMLElement;
        copy.style.width = "100%";
        copy.style.height = "100%";
        fake.append(copy);
        document.body.append(fake);
        fake.getBoundingClientRect(); // place it first, then let it slide away
    }
    button.style.visibility = "hidden";
    hidden.add(button);
    moveFake();
}

function putButtonsBack() {
    for (const b of hidden) b.style.visibility = "";
    hidden.clear();
    fake?.remove();
    fake = null;
}

function onPointerOver(e: PointerEvent) {
    if (done || boxOpen || dodges >= DODGES || !isTarget()) return;
    if (isFake(e.target)) {
        dodges++;
        moveFake();
        return;
    }
    const button = soundboardButton(e.target);
    if (!button) return;
    dodges++;
    runAway(button);
}

// caught it (the copy, or the real one once it stays put): no soundboard, the box instead.
// Pressing is blocked too - Discord opens the soundboard on the press, before the click.
function onPress(e: MouseEvent) {
    if (done || !isTarget()) return;
    if (!isFake(e.target) && !soundboardButton(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "click") openSorryBox();
}

const PRESS_EVENTS = ["pointerdown", "mousedown", "mouseup", "click"] as const;

function listen(on: boolean) {
    const f = on ? document.addEventListener : document.removeEventListener;
    f.call(document, "pointerover", onPointerOver as EventListener, true);
    for (const t of PRESS_EVENTS) f.call(document, t, onPress as EventListener, true);
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
        done = !!(await DataStore.get(DONE_KEY));
        if (done) return;
        listen(true);
    },

    stop() {
        listen(false);
        putButtonsBack();
    },

    // trying it on any account, until Discord restarts (console only):
    // Vencord.Plugins.plugins.O2SoundboardJoke.again()
    async again() {
        forceForTest = true;
        await DataStore.del(DONE_KEY);
        done = false;
        dodges = 0;
        putButtonsBack();
        listen(false);
        listen(true);
    }
});
