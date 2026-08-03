/*
 * o2cord local debug tools
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Settings, useSettings } from "@api/Settings";
import { CogWheel } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { Margins } from "@utils/margins";
import {
    O2_LOCAL_BADGES_KEY,
    O2_LOCAL_BADGES_UPDATED_EVENT,
    O2LocalBadge
} from "@utils/o2BadgePresets";
import { chooseFile } from "@utils/web";
import { Button, Forms, React, TextInput, UserStore, useState } from "@webpack/common";

import Plugins from "~plugins";

import "./styles.css";

type LocalBadge = O2LocalBadge;

interface ManagedPlugin {
    name: string;
    description: string;
}

const BADGES_KEY = O2_LOCAL_BADGES_KEY;
const BADGES_EVENT = O2_LOCAL_BADGES_UPDATED_EVENT;
const SHOW_ADD_BADGE_FEATURE = true;

const MANAGED_PLUGINS: ManagedPlugin[] = [
    {
        name: "ServerCloner",
        description: "Clone server roles, channels, permissions, icon, and emojis without token or relay sending"
    },
    {
        name: "ChannelWallpaper",
        description: "Set per-channel wallpapers from URLs or uploaded images"
    },
    {
        name: "AntiMoveDeco",
        description: "Adds a voice button to return to your protected voice channel if moved or disconnected"
    },
    {
        name: "FakeVoice",
        description: "Debug-only fake mute and fake deafen controls"
    },
    {
        name: "ussro2",
        description: "Local-only profile backgrounds saved on your own client"
    },
    {
        name: "ProfileTheme",
        description: "Experimental profile theme image background with dim or full display"
    }
];

function readLocalJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
}

async function readStoredJson<T>(key: string, fallback: T): Promise<T> {
    try {
        const stored = await DataStore.get<T>(key);
        if (stored != null) return stored;
    } catch { }

    return readLocalJson(key, fallback);
}

async function writeStoredJson(key: string, value: unknown) {
    let saved = false;

    try {
        localStorage.setItem(key, JSON.stringify(value));
        saved = true;
    } catch { }

    try {
        await DataStore.set(key, value);
        saved = true;
    } catch { }

    if (!saved) throw new Error("Could not write debug settings.");

    if (key === BADGES_KEY)
        window.dispatchEvent(new CustomEvent(BADGES_EVENT, { detail: value }));
}

function makeBadgeId() {
    return "badge-" + Date.now().toString(36);
}

function normalizeBadgeSize(size: string | number | undefined) {
    const parsed = typeof size === "number" ? size : Number(size);
    if (!Number.isFinite(parsed)) return 22;

    return Math.min(40, Math.max(14, Math.round(parsed)));
}

function getPublicBadgePayload(badge: LocalBadge) {
    return {
        badges: [{
            id: badge.id,
            userId: badge.userId,
            name: badge.name,
            image: badge.image,
            size: normalizeBadgeSize(badge.size)
        }]
    };
}

function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
    });
}

function DebugFeatureCard({
    title,
    description,
    onSettingsClick
}: {
    title: string;
    description: string;
    onSettingsClick: () => void;
}) {
    return (
        <div className="o2-debug-feature-card">
            <div className="o2-debug-feature-header">
                <div className="o2-debug-feature-title">{title}</div>
                <button
                    type="button"
                    className="o2-debug-feature-settings"
                    aria-label={`${title} settings`}
                    onClick={onSettingsClick}
                >
                    <CogWheel width={18} height={18} />
                </button>
            </div>
            <div className="o2-debug-feature-description">{description}</div>
        </div>
    );
}

type ActiveSettingsModal = "badge" | null;

function DebugO2Tab() {
    const [badges, setBadges] = useState<LocalBadge[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [userId, setUserId] = useState(() => UserStore.getCurrentUser()?.id ?? "");
    const [badgeName, setBadgeName] = useState("");
    const [badgeImage, setBadgeImage] = useState("");
    const [badgeSize, setBadgeSize] = useState("22");
    const [saveStatus, setSaveStatus] = useState("");
    const [pluginStatus, setPluginStatus] = useState("");
    const [activeSettingsModal, setActiveSettingsModal] = useState<ActiveSettingsModal>(null);
    const settings = useSettings(["plugins.*"]);

    React.useEffect(() => {
        let cancelled = false;

        readStoredJson<LocalBadge[]>(BADGES_KEY, []).then(savedBadges => {
            if (cancelled) return;
            const nextBadges = Array.isArray(savedBadges) ? savedBadges : [];
            setBadges(nextBadges);
            window.dispatchEvent(new CustomEvent(BADGES_EVENT, { detail: nextBadges }));
        });

        return () => {
            cancelled = true;
        };
    }, []);

    function resetBadgeForm() {
        const currentUserId = UserStore.getCurrentUser()?.id ?? "";
        setEditingId(null);
        setUserId(currentUserId);
        setBadgeName("");
        setBadgeImage("");
        setBadgeSize("22");
    }

    async function saveBadge() {
        const targetUserId = userId.trim() || (UserStore.getCurrentUser()?.id ?? "");
        const targetBadgeName = badgeName.trim() || "Custom Badge";
        const targetBadgeImage = badgeImage.trim();

        if (!targetUserId || !targetBadgeImage) {
            setSaveStatus("Add a Discord user ID and choose a badge image first.");
            return;
        }

        const nextBadge: LocalBadge = {
            id: editingId ?? makeBadgeId(),
            userId: targetUserId,
            name: targetBadgeName,
            image: targetBadgeImage,
            size: normalizeBadgeSize(badgeSize)
        };

        const next = editingId
            ? badges.map(badge => badge.id === editingId ? nextBadge : badge)
            : [...badges, nextBadge];

        try {
            await writeStoredJson(BADGES_KEY, next);
            setBadges(next);
            setSaveStatus("Badge saved. Reopen that user's profile to refresh the badge row.");
            resetBadgeForm();
        } catch (e) {
            setSaveStatus(`Save failed: ${String(e)}`);
        }
    }

    function useMyId() {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (currentUserId) setUserId(currentUserId);
    }

    function editBadge(badge: LocalBadge) {
        setEditingId(badge.id);
        setUserId(badge.userId);
        setBadgeName(badge.name);
        setBadgeImage(badge.image);
        setBadgeSize(String(normalizeBadgeSize(badge.size)));
        setActiveSettingsModal("badge");
    }

    async function deleteBadge(id: string) {
        const next = badges.filter(badge => badge.id !== id);

        try {
            await writeStoredJson(BADGES_KEY, next);
            setBadges(next);
            setSaveStatus("Badge deleted.");
            if (editingId === id) resetBadgeForm();
        } catch (e) {
            setSaveStatus(`Delete failed: ${String(e)}`);
        }
    }

    async function chooseImage() {
        const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif,image/svg+xml");
        if (!file) return;

        return fileToDataUrl(file);
    }

    async function chooseBadgeImage() {
        const image = await chooseImage();
        if (!image) return;

        setBadgeImage(image);
        if (!userId.trim()) setUserId(UserStore.getCurrentUser()?.id ?? "");
        if (!badgeName.trim()) setBadgeName("Custom Badge");
        setSaveStatus("Image selected. Press Save Badge to apply it.");
    }

    async function copyPublicBadgeJson() {
        const nextBadge: LocalBadge = {
            id: editingId ?? makeBadgeId(),
            userId: userId.trim() || (UserStore.getCurrentUser()?.id ?? ""),
            name: badgeName.trim() || "Custom Badge",
            image: badgeImage.trim(),
            size: normalizeBadgeSize(badgeSize)
        };

        if (!nextBadge.userId || !nextBadge.image) {
            setSaveStatus("Add a Discord user ID and badge image first.");
            return;
        }

        try {
            await navigator.clipboard?.writeText?.(JSON.stringify(getPublicBadgePayload(nextBadge), null, 2));
            setSaveStatus("Public badge JSON copied. Add it to update-package/public/badges.json.");
        } catch (e) {
            setSaveStatus(`Copy failed: ${String(e)}`);
        }
    }

    function isManagedPluginEnabled(pluginName: string) {
        return settings.plugins[pluginName]?.enabled ?? false;
    }

    function setManagedPluginEnabled(pluginName: string, enabled: boolean) {
        Settings.plugins[pluginName].enabled = enabled;
        setPluginStatus(`${pluginName} ${enabled ? "enabled" : "disabled"}. Restart Discord to apply it.`);
    }

    function openManagedPluginSettings(pluginName: string) {
        const plugin = Plugins[pluginName];
        if (!plugin) {
            setPluginStatus(`${pluginName} settings are not available in this build.`);
            return;
        }

        openPluginModal(plugin, (name, key) => {
            setPluginStatus(`${name}.${key} changed. Restart Discord to apply it.`);
        });
    }

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h5">debug o2</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom20}>
                Local debug tools for your o2cord build.
            </Forms.FormText>

            {SHOW_ADD_BADGE_FEATURE && (
                <section className="o2-debug-feature-grid">
                    <DebugFeatureCard
                        title="Add Badge"
                        description="Add custom image badges to Discord profile badge rows"
                        onSettingsClick={() => setActiveSettingsModal("badge")}
                    />
                </section>
            )}

            <section className="o2-debug-managed-section">
                <Forms.FormTitle tag="h5">Debug Plugins</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom8}>
                    Turn your added debug plugins on or off here.
                </Forms.FormText>
                <div className="o2-debug-managed-grid">
                    {MANAGED_PLUGINS.map(plugin => (
                        <AddonCard
                            key={plugin.name}
                            name={plugin.name}
                            description={plugin.description}
                            enabled={isManagedPluginEnabled(plugin.name)}
                            setEnabled={enabled => setManagedPluginEnabled(plugin.name, enabled)}
                            infoButton={
                                <button
                                    type="button"
                                    className="o2-debug-plugin-info"
                                    aria-label={`${plugin.name} settings`}
                                    onClick={() => openManagedPluginSettings(plugin.name)}
                                >
                                    <CogWheel width={18} height={18} />
                                </button>
                            }
                        />
                    ))}
                </div>
                {pluginStatus && (
                    <Forms.FormText className={Margins.top8}>{pluginStatus}</Forms.FormText>
                )}
            </section>

            {SHOW_ADD_BADGE_FEATURE && (
                <section>
                    <Forms.FormTitle tag="h5">Saved Local Badges</Forms.FormTitle>
                    <div className="o2-debug-badge-list">
                        {badges.length === 0 && (
                            <Forms.FormText>No local badges saved yet.</Forms.FormText>
                        )}
                        {badges.map(badge => (
                            <div className="o2-debug-badge-item" key={badge.id}>
                                <img src={badge.image} alt="" />
                                <div>
                                    <strong>{badge.name}</strong>
                                    <span>{badge.userId}</span>
                                </div>
                                <Button size={Button.Sizes.SMALL} onClick={() => editBadge(badge)}>Edit</Button>
                                <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => deleteBadge(badge.id)}>Delete</Button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {SHOW_ADD_BADGE_FEATURE && activeSettingsModal && (
                <div className="o2-debug-modal-backdrop" onClick={() => setActiveSettingsModal(null)}>
                    <div
                        className="o2-debug-modal o2-debug-modal-badge"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="o2-debug-modal-header">
                            <div>
                                <h2>Add Badge</h2>
                                <Forms.FormText>
                                    Add a Discord user ID and image. The badge appears in that user's profile badge row.
                                </Forms.FormText>
                            </div>
                            <button
                                type="button"
                                className="o2-debug-modal-close"
                                aria-label="Close"
                                onClick={() => setActiveSettingsModal(null)}
                            >
                                X
                            </button>
                        </div>

                        <section>
                            <Forms.FormTitle tag="h5">Settings</Forms.FormTitle>
                            <div className="o2-debug-modal-settings">
                                <TextInput
                                    placeholder="Discord user ID"
                                    value={userId}
                                    onChange={setUserId}
                                />
                                <div className="o2-debug-actions">
                                    <Button size={Button.Sizes.SMALL} onClick={useMyId}>Use My ID</Button>
                                </div>
                                <TextInput
                                    placeholder="Badge name"
                                    value={badgeName}
                                    onChange={setBadgeName}
                                />
                                <TextInput
                                    placeholder="Badge image URL"
                                    value={badgeImage}
                                    onChange={setBadgeImage}
                                />
                                <TextInput
                                    placeholder="Badge size, 14-40 px"
                                    value={badgeSize}
                                    onChange={setBadgeSize}
                                />
                                <div className="o2-debug-image-file-row">
                                    <div className="o2-debug-image-file-preview">
                                        {badgeImage ? <img src={badgeImage} alt="" /> : <span>No image</span>}
                                    </div>
                                    <Button size={Button.Sizes.SMALL} onClick={chooseBadgeImage}>Choose Image</Button>
                                </div>
                                <div className="o2-debug-actions">
                                    <Button onClick={saveBadge}>{editingId ? "Save Changes" : "Save Badge"}</Button>
                                    <Button color={Button.Colors.GREEN} onClick={copyPublicBadgeJson}>Copy Public JSON</Button>
                                    <Button color={Button.Colors.PRIMARY} onClick={resetBadgeForm}>Clear</Button>
                                </div>
                                {saveStatus && (
                                    <Forms.FormText className={Margins.top8}>{saveStatus}</Forms.FormText>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </SettingsTab>
    );
}

export default wrapTab(DebugO2Tab, "debug o2");
