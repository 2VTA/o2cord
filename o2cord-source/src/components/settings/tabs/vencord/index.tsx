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

// o2cord: the main settings page, redone at Ryder's request to be simple
// and clean for everyone - a header card (version, update state,
// restart), the quick switches and theme from the Hub, the window options
// in plain words, and the rest tucked under "Advanced".

import "./o2Settings.css";

import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { useSettings } from "@api/Settings";
import { FolderIcon, GithubIcon, LogIcon, PaintbrushIcon } from "@components/Icons";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import SettingsPlugin from "@plugins/_core/settings";
import { QuickSwitches, ThemeCards } from "@plugins/o2Settings/Hub";
import { gitRemote } from "@shared/vencordUserAgent";
import { Devs, IS_WINDOWS } from "@utils/constants";
import { openUserProfile } from "@utils/discord";
import { classes } from "@utils/misc";
import { relaunch } from "@utils/native";
import { isOutdated } from "@utils/updater";
import { Clickable, ConfirmModal, openModal, useEffect, UserStore, UserUtils, useState } from "@webpack/common";

import { MacOSVibrancySettings } from "./MacVibrancySettings";
import { openNotificationSettingsModal } from "./NotificationSettings";
import o2BreadImage from "./o2BreadImage";

const O2_DEV_ID = String(Devs.Ryder.id);

type BoolKey = "useQuickCss" | "enableReactDevtools" | "frameless" | "winNativeTitleBar" | "transparent" | "winCtrlQ" | "disableMinSize";

function askRestart() {
    openModal(props => (
        <ConfirmModal
            {...props}
            title="Restart to apply"
            subtitle="Discord needs a restart for this change."
            confirmText="Restart now"
            cancelText="Later"
            variant="primary"
            onConfirm={relaunch}
        />
    ));
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode; }) {
    return (
        <div className="o2s-row">
            <div>
                <div className="o2s-row-title">{title}</div>
                {sub && <div className="o2s-muted">{sub}</div>}
            </div>
            {children}
        </div>
    );
}

function SettingSwitch({ k, restart }: { k: BoolKey; restart?: boolean; }) {
    const settings = useSettings([k]);
    const on = !!settings[k];
    return (
        <Clickable
            className={classes("o2-hub-switch", on && "o2-hub-switch-on")}
            role="switch"
            aria-checked={on}
            onClick={() => { settings[k] = !on; if (restart) askRestart(); }}
        />
    );
}

const MATERIALS = [
    { id: "none", label: "None" },
    { id: "mica", label: "Mica" },
    { id: "tabbed", label: "Tabbed" },
    { id: "acrylic", label: "Acrylic" }
];

function MaterialPicker() {
    const settings = useSettings(["windowsMaterial"]);
    const current = settings.windowsMaterial || "none";
    return (
        <div className="o2s-segmented" role="radiogroup">
            {MATERIALS.map(m => (
                <Clickable
                    key={m.id}
                    className={classes("o2s-segment", current === m.id && "o2s-segment-on")}
                    role="radio"
                    aria-checked={current === m.id}
                    onClick={() => { if (current !== m.id) { settings.windowsMaterial = m.id as any; askRestart(); } }}
                >
                    {m.label}
                </Clickable>
            ))}
        </div>
    );
}

function Header() {
    const version = typeof O2CORD_VERSION === "string" && O2CORD_VERSION ? O2CORD_VERSION.replace(/-debug$/, "") : VERSION;
    return (
        <div className="o2s-hero">
            <div className="o2s-logo">02</div>
            <div className="o2s-grow">
                <div className="o2s-hero-title">o2cord <span className="o2s-muted">{version}</span></div>
                <div className="o2s-muted">{isOutdated ? "An update is ready - restart to get it" : "Up to date"}</div>
            </div>
            {!IS_WEB && <Clickable className="o2s-btn" onClick={() => relaunch()}>Restart</Clickable>}
        </div>
    );
}

// The people the "dev" button shows, top to bottom.
const DEV_PEOPLE = [
    { id: O2_DEV_ID, note: "made o2cord", fallback: "Ryder" },
    { id: "1542531988727140477", note: "first supporter", fallback: "First supporter" }
];

function PersonCard({ id, note, fallback, open }: { id: string; note: string; fallback: string; open: boolean; }) {
    const [user, setUser] = useState(() => UserStore.getUser(id));
    useEffect(() => {
        if (open && !user) UserUtils.getUser(id).then(setUser).catch(() => { });
    }, [open]);
    return (
        <Clickable className="o2s-dev-card" onClick={() => openUserProfile(id)}>
            {user && <img className="o2s-dev-avatar" src={user.getAvatarURL(void 0, 128, true)} alt="" />}
            <div className="o2s-grow">
                <div className="o2s-row-title">{user?.globalName || user?.username || fallback}</div>
                <div className="o2s-muted">{user ? `@${user.username} · ` : ""}{note}</div>
            </div>
        </Clickable>
    );
}

// The "dev" button slides these cards down; click one to open that profile.
function DevCard({ open }: { open: boolean; }) {
    return (
        <div className={classes("o2s-dev-slide", open && "o2s-dev-slide-open")} aria-hidden={!open}>
            <div className="o2s-dev-slide-inner">
                {DEV_PEOPLE.map(p => <PersonCard key={p.id} {...p} open={open} />)}
            </div>
        </div>
    );
}

function Tools() {
    const [advanced, setAdvanced] = useState(false);
    const [dev, setDev] = useState(false);
    return (
        <section>
            <div className="o2-hub-label">Tools</div>
            <div className="o2s-tools">
                <Clickable className="o2s-btn" onClick={openNotificationLogModal}><LogIcon className="o2s-btn-icon" />Notification log</Clickable>
                <Clickable className="o2s-btn" onClick={() => VencordNative.quickCss.openEditor()}><PaintbrushIcon className="o2s-btn-icon" />Custom CSS</Clickable>
                {!IS_WEB && <Clickable className="o2s-btn" onClick={() => VencordNative.settings.openFolder()}><FolderIcon className="o2s-btn-icon" />Settings folder</Clickable>}
                <Clickable className="o2s-btn" onClick={() => VencordNative.native.openExternal("https://github.com/" + gitRemote)}><GithubIcon className="o2s-btn-icon" />Source code</Clickable>
                <Clickable className={classes("o2s-btn", dev && "o2s-btn-on")} onClick={() => setDev(v => !v)}>
                    <img className="o2s-dev-img" src={o2BreadImage} alt="" />dev
                </Clickable>
                <Clickable className={classes("o2s-btn", advanced && "o2s-btn-on")} onClick={() => setAdvanced(v => !v)}>{advanced ? "Hide advanced" : "Advanced"}</Clickable>
            </div>

            <DevCard open={dev} />

            {advanced && (
                <div className="o2s-advanced">
                    <div className="o2s-card">
                        <Row title="Use custom CSS" sub="Your own CSS from the Custom CSS editor"><SettingSwitch k="useQuickCss" /></Row>
                        {!IS_WEB && <Row title="React developer tools" sub="For developers"><SettingSwitch k="enableReactDevtools" restart /></Row>}
                        {!IS_WEB && <Row title="See-through window" sub="Needs a theme made for it; the window can't be resized while it's on"><SettingSwitch k="transparent" restart /></Row>}
                        {!IS_WEB && (!IS_DISCORD_DESKTOP || !IS_WINDOWS) && <Row title="No window frame"><SettingSwitch k="frameless" restart /></Row>}
                        <Row title="o2cord notifications" sub="Pop-ups from o2cord itself, not Discord messages">
                            <Clickable className="o2s-btn" onClick={openNotificationSettingsModal}>Settings</Clickable>
                        </Row>
                    </div>
                    <div className="o2s-muted">
                        Want this settings section somewhere else in the list? Change it in the{" "}
                        <a onClick={() => openPluginModal(SettingsPlugin)}>Settings plugin</a>.
                    </div>
                    <MacOSVibrancySettings />
                </div>
            )}
        </section>
    );
}

function VencordSettings() {
    const [, setTick] = useState(0);
    const showMaterial = !IS_WEB && IS_WINDOWS && VencordNative.native.supportsWindowsMaterial();
    const showWindow = !IS_WEB && (showMaterial || IS_DISCORD_DESKTOP);

    return (
        <SettingsTab>
            <div className="o2s-page">
                <Header />

                <section>
                    <div className="o2-hub-label">Quick switches</div>
                    <QuickSwitches />
                </section>

                <section>
                    <div className="o2-hub-label">Theme</div>
                    <ThemeCards onChange={() => setTick(n => n + 1)} />
                </section>

                {showWindow && (
                    <section>
                        <div className="o2-hub-label">Window</div>
                        <div className="o2s-card">
                            {showMaterial && <Row title="Background effect" sub="See-through blur behind Discord - needs a restart"><MaterialPicker /></Row>}
                            {IS_DISCORD_DESKTOP && IS_WINDOWS && <Row title="Windows title bar" sub="Use Windows' own bar instead of Discord's"><SettingSwitch k="winNativeTitleBar" restart /></Row>}
                            {IS_DISCORD_DESKTOP && <Row title="Any window size" sub="Lets you make the window smaller than Discord allows"><SettingSwitch k="disableMinSize" restart /></Row>}
                            {IS_WINDOWS && <Row title="Ctrl+Q closes Discord" sub="Like Alt+F4"><SettingSwitch k="winCtrlQ" restart /></Row>}
                        </div>
                    </section>
                )}

                <Tools />
            </div>
        </SettingsTab>
    );
}

export default wrapTab(VencordSettings, "o2cord Settings");
