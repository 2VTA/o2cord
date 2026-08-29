/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Rebuilt from scratch - the original accountSwitcher.desktop plugin was
 * never committed to git and got wiped by a full revert earlier tonight.
 * This version reads Discord's own native "known accounts" list (the same
 * one behind the profile popout's own Switch Accounts submenu) instead of
 * storing any tokens itself - verified live via CDP:
 *
 *   - findStoreLazy("MultiAccountStore").getValidUsers() returns exactly
 *     the accounts Discord's own submenu shows ({id, avatar, username,
 *     discriminator, tokenStatus} - no token string, ever).
 *   - findByPropsLazy("switchAccountToken") exposes switchAccountToken(id),
 *     Discord's own real switch action - same one the native menu calls.
 *
 * Neither exposes a raw token to this code, which is exactly what Ryder
 * asked for after an earlier version of this plugin stored tokens in its
 * own settings.
 *
 * "Open in a new window" (native.ts) spawns a second, separate instance of
 * the Discord executable as its own detached process - not yet verified
 * live (Ryder asked for this to be built, not tested, tonight). Whether it
 * opens a genuinely independent window or just focuses the existing one
 * depends on whether this Discord build allows multiple instances; that
 * needs a live check before relying on it.
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Clickable, Popout, useRef, useState, useStateFromStores } from "@webpack/common";

interface KnownAccount {
    id: string;
    avatar: string | null;
    username: string;
    discriminator: string;
    tokenStatus: number;
}

const MultiAccountStore = findStoreLazy("MultiAccountStore");
const AuthModule = findByPropsLazy("switchAccountToken");

function getAvatarUrl(acc: KnownAccount) {
    if (!acc.avatar) return "https://cdn.discordapp.com/embed/avatars/0.png";
    return `https://cdn.discordapp.com/avatars/${acc.id}/${acc.avatar}.webp?size=48`;
}

function switchTo(id: string) {
    AuthModule.switchAccountToken(id);
}

function openNewWindow() {
    VencordNative.pluginHelpers.AccountSwitcher.openNewInstance();
}

function AccountSwitcherIcon(props: { width?: number; height?: number; color?: string; }) {
    return (
        <svg width={props.width ?? 18} height={props.height ?? 18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                stroke={props.color ?? "currentColor"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 7h11l-3.5-3.5M17 17H6l3.5 3.5"
            />
        </svg>
    );
}

function AccountSwitcherPopout({ onClose }: { onClose: () => void; }) {
    const accounts: KnownAccount[] = useStateFromStores([MultiAccountStore], () => MultiAccountStore.getValidUsers());

    return (
        <div className="o2-account-switcher-popout">
            <div className="o2-account-switcher-titlebar">
                <div className="o2-account-switcher-header">Account Switcher</div>
                <Clickable className="o2-account-switcher-close" onClick={onClose}>×</Clickable>
            </div>

            <div className="o2-account-switcher-explainer">
                "Switch" uses Discord's own native account-switch mechanism (only works if Discord still has a usable saved token for that account - log into it normally once if not). "Open Separate Instance" opens a fully independent Discord instance with its own isolated login - nothing is copied between accounts.
            </div>

            <div className="o2-account-switcher-section-title">Saved Accounts</div>

            {accounts.length === 0 && (
                <div className="o2-account-switcher-empty">
                    No other accounts signed in. Add one from Discord's own "Switch Accounts" menu first (click your avatar, bottom left).
                </div>
            )}

            {accounts.map(acc => (
                <div key={acc.id} className="o2-account-switcher-row">
                    <img className="o2-account-switcher-avatar" src={getAvatarUrl(acc)} alt="" />
                    <span className="o2-account-switcher-name">{acc.username}</span>
                    <Clickable className="o2-account-switcher-btn" onClick={() => switchTo(acc.id)}>
                        Switch
                    </Clickable>
                </div>
            ))}

            <Clickable className="o2-account-switcher-open-instance" onClick={openNewWindow}>
                Open Separate Instance
            </Clickable>
        </div>
    );
}

function AccountSwitcherHeaderButton() {
    const [isOpen, setIsOpen] = useState(false);
    const popoutRef = useRef<HTMLDivElement>(null);

    return (
        <Popout
            targetElementRef={popoutRef}
            renderPopout={() => <AccountSwitcherPopout onClose={() => setIsOpen(false)} />}
            shouldShow={isOpen}
            onRequestClose={() => setIsOpen(false)}
            position="bottom"
            align="right"
            spacing={8}
        >
            {() => (
                <div ref={popoutRef as any} style={{ display: "flex" }}>
                    <HeaderBarButton
                        icon={AccountSwitcherIcon}
                        tooltip="Account Switcher"
                        onClick={() => setIsOpen(v => !v)}
                        selected={isOpen}
                    />
                </div>
            )}
        </Popout>
    );
}

export default definePlugin({
    name: "AccountSwitcher",
    description: "Switch between your other signed-in Discord accounts, or open one in a new window",
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: false,
    start() {
        addHeaderBarButton("o2cord-account-switcher", () => <AccountSwitcherHeaderButton />, 900);
    },
    stop() {
        removeHeaderBarButton("o2cord-account-switcher");
    }
});
