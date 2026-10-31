/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * o2cord Hub - one window for everything an
 * o2cord user touches day to day: quick switches, themes, the o2cord
 * plugins grouped by what they're for, profile tools and the news. Built
 * to be simple for everyone; anything advanced stays one "More" click away
 * in the plugin's own settings window.
 *
 * Nothing opens it right now (the top-bar button and the settings page
 * button were removed until there's a better idea for it); its quick
 * switches and theme cards are used on the o2cord settings page.
 */

import "./hub.css";

import { plugins } from "@api/PluginManager";
import { Settings } from "@api/Settings";
import { PluginCard } from "@components/settings/tabs/plugins/PluginCard";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { openCallieModal } from "@plugins/callieRequests";
import { openWhatsNew } from "@plugins/o2WhatsNew";
import { RELEASES } from "@plugins/o2WhatsNew/releases";
import { canUseRetro, PROFILES as RETRO_PROFILES } from "@plugins/retroTerminal";
import { classes } from "@utils/misc";
import { ModalCloseButton as LegacyClose, ModalRoot as LegacyRoot, ModalSize, openModal } from "@utils/modal";
import { relaunch } from "@utils/native";
import { DEBUG_ONLY_PLUGINS } from "@utils/o2Debug";
import { Clickable, TextInput, UserStore, useState } from "@webpack/common";

import { GRADES as VHS_GRADES } from "@plugins/vhs";
import { chooseTheme, currentTheme, isOwner, settings, ThemeChoice, TOGGLES } from "./index";

// The legacy modal parts are typed `never` in @utils/modal.
const ModalRoot = LegacyRoot as any;
const ModalCloseButton = LegacyClose as any;

type Page = "home" | "themes" | "plugins" | "profile" | "news";

const PAGES: { id: Page; label: string; icon: string; }[] = [
    { id: "home", label: "Home", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
    { id: "themes", label: "Themes", icon: "M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1.1.3-2.2 1.4-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10Zm-5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" },
    { id: "plugins", label: "Plugins", icon: "M10 3a2 2 0 0 1 4 0v2h4a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 0 0-4 0v2H6a1 1 0 0 1-1-1v-4h2a2 2 0 0 0 0-4H5V6a1 1 0 0 1 1-1h4z" },
    { id: "profile", label: "My profile", icon: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z" },
    { id: "news", label: "What's new", icon: "M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2zm3 4v2h9V8zm0 4v2h9v-2zm0 4v2h6v-2z" }
];

// The o2cord plugins, by what they're for. Only the ones that exist in this
// build show up (private ones never do).
const GROUPS: { title: string; names: string[]; }[] = [
    { title: "Your profile", names: ["ProfileTheme", "CustomProfile", "Nameplate", "ProfileImages", "ussro2Public", "ProfileSong", "Widget", "CustomTyping", "CallieRequests"] },
    { title: "Status and activity", names: ["O2Presence", "FakePlaying", "NitroServer"] },
    { title: "Voice and streaming", names: ["AntiMoveDeco", "WhosWatching", "LimitlessScreenshare", "InstantScreenshare"] },
    { title: "Look and feel", names: ["RetroTerminal", "VHS", "AppIcon", "O2WindowControls", "BannersEverywhere", "HideServers", "PartyMode"] },
    { title: "Handy extras", names: ["FrequentQuickSwitcher", "ProfileSets", "O2WhatsNew"] }
];

const THEMES: { id: ThemeChoice; title: string; sub: string; }[] = [
    { id: "none", title: "Normal", sub: "Discord's own look" },
    { id: "glass", title: "Liquid Glass", sub: "Frosted glass panels" },
    { id: "retro", title: "Retro Terminal", sub: "Old CRT screen" },
    { id: "vhs", title: "VHS", sub: "Old video tape" }
];

const available = (name: string) => !!plugins[name] && !plugins[name].hidden && !DEBUG_ONLY_PLUGINS.has(name);

function Icon({ d }: { d: string; }) {
    return <svg className="o2-hub-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="currentColor" /></svg>;
}

export function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle(): void; }) {
    return (
        <Clickable className="o2-hub-tile" role="switch" aria-checked={on} onClick={onToggle}>
            <span>{label}</span>
            <span className={classes("o2-hub-switch", on && "o2-hub-switch-on")} />
        </Clickable>
    );
}

export function ThemeCards({ onChange }: { onChange(): void; }) {
    const theme = currentTheme();
    const profile = RETRO_PROFILES[Settings.plugins.RetroTerminal?.profile ?? "amber"] ?? RETRO_PROFILES.amber;
    const options = THEMES
        .filter(t => t.id !== "glass" || isOwner())
        .filter(t => t.id !== "retro" || canUseRetro())
        .filter(t => t.id !== "vhs" || !!plugins.VHS);
    return (
        <div className="o2-hub-themes">
            {options.map(t => (
                <Clickable
                    key={t.id}
                    className={classes("o2-hub-theme", theme === t.id && "o2-hub-theme-on")}
                    role="radio"
                    aria-checked={theme === t.id}
                    onClick={() => { chooseTheme(t.id); onChange(); }}
                    // Double-click the retro / VHS card to open its own settings.
                    onDoubleClick={t.id === "retro" ? () => openPluginModal(plugins.RetroTerminal) : t.id === "vhs" ? () => openPluginModal(plugins.VHS) : undefined}
                    title={t.id === "retro" || t.id === "vhs" ? "Double-click for settings" : undefined}
                >
                    <div className={`o2-hub-theme-preview o2-hub-theme-preview-${t.id}`} style={t.id === "retro" ? { color: profile.fg, background: profile.bg } : undefined}>
                        {t.id === "retro" ? "> _" : t.id === "vhs" ? "PLAY ►" : null}
                    </div>
                    <div className="o2-hub-theme-title">{t.title}{theme === t.id && <span className="o2-hub-muted"> · on</span>}</div>
                    <div className="o2-hub-muted">{t.sub}</div>
                </Clickable>
            ))}
        </div>
    );
}

// The o2Settings switches as tiles - also used on the o2cord settings page.
export function QuickSwitches({ onChange }: { onChange?(): void; }) {
    const [, setTick] = useState(0);
    const store = settings.store as Record<string, boolean>;
    return (
        <div className="o2-hub-tiles">
            {TOGGLES.map(({ key, title }) => (
                <Switch key={key} label={title} on={!!store[key]} onToggle={() => { store[key] = !store[key]; setTick(n => n + 1); onChange?.(); }} />
            ))}
        </div>
    );
}

function HomePage({ go, refresh }: { go(page: Page): void; refresh(): void; }) {
    const user = UserStore.getCurrentUser();
    const latest = RELEASES[0];
    const headline = latest?.features[0]?.title ?? latest?.fixes[0]?.text;
    return (
        <>
            <div>
                <div className="o2-hub-hello">Hi {user?.globalName || user?.username || "there"}</div>
                <div className="o2-hub-muted">Everything you use most, on one page</div>
            </div>
            <section>
                <div className="o2-hub-label">Quick switches</div>
                <QuickSwitches />
            </section>
            <section>
                <div className="o2-hub-label">Theme</div>
                <ThemeCards onChange={refresh} />
            </section>
            {latest && (
                <Clickable className="o2-hub-news-line" onClick={() => go("news")}>
                    <span><b>New in {latest.version}</b>{headline && <span className="o2-hub-muted"> · {headline}</span>}</span>
                    <span className="o2-hub-muted">See all →</span>
                </Clickable>
            )}
        </>
    );
}

function ThemesPage({ refresh }: { refresh(): void; }) {
    const retroOn = currentTheme() === "retro";
    const vhsOn = currentTheme() === "vhs";
    const grade = Settings.plugins.VHS?.grade ?? "tape";
    const profile = Settings.plugins.RetroTerminal?.profile ?? "amber";
    return (
        <>
            <div className="o2-hub-hello">Themes</div>
            <ThemeCards onChange={refresh} />
            {retroOn && (
                <section>
                    <div className="o2-hub-label">Retro colour</div>
                    <div className="o2-hub-swatches">
                        {Object.entries(RETRO_PROFILES).map(([key, p]) => (
                            <Clickable
                                key={key}
                                className={classes("o2-hub-swatch", profile === key && "o2-hub-swatch-on")}
                                onClick={() => { Settings.plugins.RetroTerminal.profile = key; refresh(); }}
                            >
                                <span className="o2-hub-dot" style={{ background: p.fg }} />{p.short}
                            </Clickable>
                        ))}
                    </div>
                    <Clickable className="o2-hub-link" onClick={() => openPluginModal(plugins.RetroTerminal)}>More retro settings →</Clickable>
                </section>
            )}
            {vhsOn && (
                <section>
                    <div className="o2-hub-label">Tape colours</div>
                    <div className="o2-hub-swatches">
                        {Object.entries(VHS_GRADES).map(([key, g]) => (
                            <Clickable
                                key={key}
                                className={classes("o2-hub-swatch", grade === key && "o2-hub-swatch-on")}
                                onClick={() => { Settings.plugins.VHS.grade = key; refresh(); }}
                            >
                                <span className="o2-hub-dot" style={{ background: g.shadow, boxShadow: `inset 0 0 0 3px ${g.highlight}` }} />{g.short}
                            </Clickable>
                        ))}
                    </div>
                    <Clickable className="o2-hub-link" onClick={() => openPluginModal(plugins.VHS)}>More VHS settings (background picture, effects) →</Clickable>
                </section>
            )}
        </>
    );
}

function PluginsPage({ onRestartNeeded }: { onRestartNeeded(): void; }) {
    const [search, setSearch] = useState("");
    const q = search.trim().toLowerCase();
    const match = (name: string) => !q || name.toLowerCase().includes(q) || plugins[name].description.toLowerCase().includes(q);
    return (
        <>
            <div className="o2-hub-hello">Plugins</div>
            <TextInput value={search} onChange={setSearch} placeholder="Search o2cord plugins" />
            {GROUPS.map(group => {
                const names = group.names.filter(available).filter(match);
                if (!names.length) return null;
                return (
                    <section key={group.title}>
                        <div className="o2-hub-label">{group.title}</div>
                        <div className="o2-hub-plugins">
                            {names.map(name => (
                                <PluginCard key={name} plugin={plugins[name]} disabled={false} onRestartNeeded={onRestartNeeded} />
                            ))}
                        </div>
                    </section>
                );
            })}
            <div className="o2-hub-muted">Looking for every plugin? It's all in Settings → Plugins.</div>
        </>
    );
}

function ProfilePage() {
    const items = [
        { title: "Change your picture, banner or nameplate", sub: "Send it to Callie - she publishes it for everyone with o2cord", open: () => openCallieModal(), show: available("CallieRequests") },
        { title: "Custom profile", sub: "Your own name colours, effects and decorations", open: () => openPluginModal(plugins.CustomProfile), show: available("CustomProfile") },
        { title: "Profile theme", sub: "A background picture behind your whole profile card", open: () => openPluginModal(plugins.ProfileTheme), show: available("ProfileTheme") },
        { title: "Typing phrase", sub: "What others see while you type", open: () => openPluginModal(plugins.CustomTyping), show: available("CustomTyping") },
        { title: "Profile songs", sub: "Turn other people's profile songs on or off", open: () => openPluginModal(plugins.ProfileSong), show: available("ProfileSong") }
    ].filter(i => i.show);
    return (
        <>
            <div className="o2-hub-hello">My profile</div>
            <div className="o2-hub-list">
                {items.map(i => (
                    <Clickable key={i.title} className="o2-hub-row" onClick={i.open}>
                        <span>
                            <div className="o2-hub-row-title">{i.title}</div>
                            <div className="o2-hub-muted">{i.sub}</div>
                        </span>
                        <span className="o2-hub-muted">→</span>
                    </Clickable>
                ))}
            </div>
        </>
    );
}

function NewsPage() {
    return (
        <>
            <div className="o2-hub-hello">What's new</div>
            <div className="o2-hub-list">
                {RELEASES.slice(0, 10).map(r => (
                    <Clickable key={r.version} className="o2-hub-row o2-hub-row-top" onClick={() => openWhatsNew(r)}>
                        <span>
                            <div className="o2-hub-row-title">{r.version}{r.name ? ` · ${r.name}` : ""} <span className="o2-hub-muted">· {r.date}</span></div>
                            {r.features.map((f, i) => <div key={"f" + i} className="o2-hub-muted">• {f.title}</div>)}
                            {r.fixes.map((f, i) => <div key={"x" + i} className="o2-hub-muted">• Fix: {f.text}</div>)}
                        </span>
                        <span className="o2-hub-muted">→</span>
                    </Clickable>
                ))}
            </div>
        </>
    );
}

function Hub({ rootProps }: { rootProps: any; }) {
    const [page, setPage] = useState<Page>("home");
    const [, setTick] = useState(0);
    const [restart, setRestart] = useState(false);
    const refresh = () => setTick(n => n + 1);
    const version = typeof O2CORD_VERSION === "string" && O2CORD_VERSION ? O2CORD_VERSION.replace(/-debug$/, "") : "";

    return (
        <ModalRoot {...rootProps} size={ModalSize.LARGE} className="o2-hub-modal">
            <div className="o2-hub">
                <nav className="o2-hub-side">
                    <div className="o2-hub-brand">o2cord</div>
                    {PAGES.map(p => (
                        <Clickable key={p.id} className={classes("o2-hub-nav", page === p.id && "o2-hub-nav-on")} onClick={() => setPage(p.id)}>
                            <Icon d={p.icon} />{p.label}
                        </Clickable>
                    ))}
                    <div className="o2-hub-grow" />
                    {version && <div className="o2-hub-version">v{version}</div>}
                </nav>
                <main className="o2-hub-main">
                    <div className="o2-hub-close"><ModalCloseButton onClick={rootProps.onClose} /></div>
                    {restart && (
                        <div className="o2-hub-restart">
                            <span>Restart Discord to finish turning that plugin on or off</span>
                            <Clickable className="o2-hub-restart-btn" onClick={() => relaunch()}>Restart</Clickable>
                        </div>
                    )}
                    {page === "home" && <HomePage go={setPage} refresh={refresh} />}
                    {page === "themes" && <ThemesPage refresh={refresh} />}
                    {page === "plugins" && <PluginsPage onRestartNeeded={() => setRestart(true)} />}
                    {page === "profile" && <ProfilePage />}
                    {page === "news" && <NewsPage />}
                </main>
            </div>
        </ModalRoot>
    );
}

export function openHub() {
    openModal(props => <Hub rootProps={props} />);
}
