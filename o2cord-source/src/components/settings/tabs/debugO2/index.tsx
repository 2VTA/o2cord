/*
 * o2cord local debug tools
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Settings, useSettings } from "@api/Settings";
import { CogWheel, DeleteIcon } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { copyWithToast } from "@utils/discord";
import { Margins } from "@utils/margins";
import {
    O2_LOCAL_BADGES_KEY,
    O2_LOCAL_BADGES_UPDATED_EVENT,
    O2LocalBadge
} from "@utils/o2BadgePresets";
import {
    O2_LOCAL_NAMEPLATES_KEY,
    O2_LOCAL_NAMEPLATES_UPDATED_EVENT,
    O2LocalNameplate
} from "@utils/o2NameplatePresets";
import {
    cleanO2NitroServerImageUrl,
    cleanO2NitroServerRoleId,
    O2_NITROSERVER_LOCAL_ROLE_ICONS_KEY,
    O2_NITROSERVER_LOCAL_ROLE_ICONS_UPDATED_EVENT,
    O2LocalNitroServerRoleIcon
} from "@utils/o2NitroServer";
import {
    cleanO2Ussro2ImageUrl,
    cleanO2Ussro2UserId,
    O2_USSRO2_LOCAL_BACKGROUNDS_KEY,
    O2_USSRO2_LOCAL_BACKGROUNDS_UPDATED_EVENT,
    O2LocalUssro2Background
} from "@utils/o2Ussro2";
import { chooseFile, saveFile } from "@utils/web";
import { Button, Forms, React, TextInput, UserStore, useState } from "@webpack/common";

import Plugins from "~plugins";

import "./styles.css";

type LocalBadge = O2LocalBadge;
type LocalNameplate = O2LocalNameplate;
type LocalUssro2Background = O2LocalUssro2Background;
type LocalNitroServerRoleIcon = O2LocalNitroServerRoleIcon;

interface ManagedPlugin {
    name: string;
    description: string;
}

const BADGES_KEY = O2_LOCAL_BADGES_KEY;
const BADGES_EVENT = O2_LOCAL_BADGES_UPDATED_EVENT;
const SHOW_ADD_BADGE_FEATURE = true;

const NAMEPLATES_KEY = O2_LOCAL_NAMEPLATES_KEY;
const NAMEPLATES_EVENT = O2_LOCAL_NAMEPLATES_UPDATED_EVENT;
const SHOW_ADD_NAMEPLATE_FEATURE = true;

const USSRO2_KEY = O2_USSRO2_LOCAL_BACKGROUNDS_KEY;
const USSRO2_EVENT = O2_USSRO2_LOCAL_BACKGROUNDS_UPDATED_EVENT;
const SHOW_USSRO2_FEATURE = true;

const NITROSERVER_KEY = O2_NITROSERVER_LOCAL_ROLE_ICONS_KEY;
const NITROSERVER_EVENT = O2_NITROSERVER_LOCAL_ROLE_ICONS_UPDATED_EVENT;
const SHOW_NITROSERVER_FEATURE = true;

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
        name: "ProfileTheme",
        description: "Private controls for the public ProfileTheme image/target (hidden from the normal plugin list)"
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
    if (key === NAMEPLATES_KEY)
        window.dispatchEvent(new CustomEvent(NAMEPLATES_EVENT, { detail: value }));
    if (key === USSRO2_KEY)
        window.dispatchEvent(new CustomEvent(USSRO2_EVENT, { detail: value }));
    if (key === NITROSERVER_KEY)
        window.dispatchEvent(new CustomEvent(NITROSERVER_EVENT, { detail: value }));
}

function makeBadgeId() {
    return "badge-" + Date.now().toString(36);
}

function makeNameplateId() {
    return "nameplate-" + Date.now().toString(36);
}

function makeUssro2Id() {
    return "ussro2-" + Date.now().toString(36);
}

function makeNitroServerId() {
    return "nitroserver-" + Date.now().toString(36);
}

function dataUrlToFile(dataUrl: string, filename: string): File | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return null;

    const [, mimeType, base64] = match;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return new File([bytes], filename, { type: mimeType });
}

function extensionForMime(mimeType: string) {
    if (mimeType === "video/webm") return "webm";
    if (mimeType === "video/mp4") return "mp4";
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/gif") return "gif";
    return "bin";
}

function isVideoDataUrl(dataUrl: string) {
    return dataUrl.startsWith("data:video/");
}

function normalizeBadgeSize(size: string | number | undefined) {
    const parsed = typeof size === "number" ? size : Number(size);
    if (!Number.isFinite(parsed)) return 22;

    return Math.min(40, Math.max(14, Math.round(parsed)));
}

function normalizeBadgeLink(value: string) {
    const link = value.trim();
    if (!link) return undefined;

    try {
        const { protocol } = new URL(link);
        return protocol === "http:" || protocol === "https:" ? link : undefined;
    } catch {
        return undefined;
    }
}

function getPublicBadgePayload(badge: LocalBadge) {
    return {
        badges: [{
            id: badge.id,
            userId: badge.userId,
            name: badge.name,
            image: badge.image,
            size: normalizeBadgeSize(badge.size),
            link: badge.link,
            enabled: badge.enabled !== false
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

type ActiveSettingsModal = "badge" | "nameplate" | "ussro2" | "nitroserver" | null;

function DebugO2Tab() {
    const [badges, setBadges] = useState<LocalBadge[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [userId, setUserId] = useState(() => UserStore.getCurrentUser()?.id ?? "");
    const [badgeName, setBadgeName] = useState("");
    const [badgeImage, setBadgeImage] = useState("");
    const [badgeSize, setBadgeSize] = useState("22");
    const [badgeLink, setBadgeLink] = useState("");
    const [saveStatus, setSaveStatus] = useState("");
    const [pluginStatus, setPluginStatus] = useState("");
    const [activeSettingsModal, setActiveSettingsModal] = useState<ActiveSettingsModal>(null);
    const settings = useSettings(["plugins.*"]);

    const [nameplates, setNameplates] = useState<LocalNameplate[]>([]);
    const [editingNameplateId, setEditingNameplateId] = useState<string | null>(null);
    const [nameplateUserId, setNameplateUserId] = useState(() => UserStore.getCurrentUser()?.id ?? "");
    const [nameplateVideo, setNameplateVideo] = useState("");
    const [nameplateStatus, setNameplateStatus] = useState("");

    const [ussro2Backgrounds, setUssro2Backgrounds] = useState<LocalUssro2Background[]>([]);
    const [editingUssro2Id, setEditingUssro2Id] = useState<string | null>(null);
    const [ussro2UserId, setUssro2UserId] = useState(() => UserStore.getCurrentUser()?.id ?? "");
    const [ussro2Image, setUssro2Image] = useState("");
    const [ussro2Status, setUssro2Status] = useState("");

    const [nitroServerIcons, setNitroServerIcons] = useState<LocalNitroServerRoleIcon[]>([]);
    const [editingNitroServerId, setEditingNitroServerId] = useState<string | null>(null);
    const [nitroServerRoleId, setNitroServerRoleId] = useState("");
    const [nitroServerImage, setNitroServerImage] = useState("");
    const [nitroServerStatus, setNitroServerStatus] = useState("");

    React.useEffect(() => {
        let cancelled = false;

        readStoredJson<LocalBadge[]>(BADGES_KEY, []).then(savedBadges => {
            if (cancelled) return;
            const nextBadges = Array.isArray(savedBadges) ? savedBadges : [];
            setBadges(nextBadges);
            window.dispatchEvent(new CustomEvent(BADGES_EVENT, { detail: nextBadges }));
        });

        readStoredJson<LocalNameplate[]>(NAMEPLATES_KEY, []).then(savedNameplates => {
            if (cancelled) return;
            const nextNameplates = Array.isArray(savedNameplates) ? savedNameplates : [];
            setNameplates(nextNameplates);
            window.dispatchEvent(new CustomEvent(NAMEPLATES_EVENT, { detail: nextNameplates }));
        });

        readStoredJson<LocalUssro2Background[]>(USSRO2_KEY, []).then(savedBackgrounds => {
            if (cancelled) return;
            const nextBackgrounds = Array.isArray(savedBackgrounds) ? savedBackgrounds : [];
            setUssro2Backgrounds(nextBackgrounds);
            window.dispatchEvent(new CustomEvent(USSRO2_EVENT, { detail: nextBackgrounds }));
        });

        readStoredJson<LocalNitroServerRoleIcon[]>(NITROSERVER_KEY, []).then(savedIcons => {
            if (cancelled) return;
            const nextIcons = Array.isArray(savedIcons) ? savedIcons : [];
            setNitroServerIcons(nextIcons);
            window.dispatchEvent(new CustomEvent(NITROSERVER_EVENT, { detail: nextIcons }));
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
        setBadgeLink("");
    }

    async function saveBadge() {
        const targetUserId = userId.trim() || (UserStore.getCurrentUser()?.id ?? "");
        const targetBadgeName = badgeName.trim() || "Custom Badge";
        const targetBadgeImage = badgeImage.trim();

        if (!targetUserId || !targetBadgeImage) {
            setSaveStatus("Add a Discord user ID and choose a badge image first.");
            return;
        }

        const existingBadge = editingId ? badges.find(badge => badge.id === editingId) : undefined;
        const nextBadge: LocalBadge = {
            id: editingId ?? makeBadgeId(),
            userId: targetUserId,
            name: targetBadgeName,
            image: targetBadgeImage,
            size: normalizeBadgeSize(badgeSize),
            link: normalizeBadgeLink(badgeLink),
            enabled: existingBadge?.enabled ?? true
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

    async function toggleBadgeEnabled(id: string, enabled: boolean) {
        const next = badges.map(badge => badge.id === id ? { ...badge, enabled } : badge);

        try {
            await writeStoredJson(BADGES_KEY, next);
            setBadges(next);
        } catch (e) {
            setSaveStatus(`Update failed: ${String(e)}`);
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
        setBadgeLink(badge.link ?? "");
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

    function downloadPublicBadgeJson() {
        const existingBadge = editingId ? badges.find(badge => badge.id === editingId) : undefined;
        const nextBadge: LocalBadge = {
            id: editingId ?? makeBadgeId(),
            userId: userId.trim() || (UserStore.getCurrentUser()?.id ?? ""),
            name: badgeName.trim() || "Custom Badge",
            image: badgeImage.trim(),
            size: normalizeBadgeSize(badgeSize),
            link: normalizeBadgeLink(badgeLink),
            enabled: existingBadge?.enabled ?? true
        };

        if (!nextBadge.userId || !nextBadge.image) {
            setSaveStatus("Add a Discord user ID and badge image first.");
            return;
        }

        const json = JSON.stringify(getPublicBadgePayload(nextBadge), null, 2);
        saveFile(new File([json], `o2cord-badge-${nextBadge.userId}.txt`, { type: "text/plain" }));
        setSaveStatus("Saved to your Downloads folder. Attach it to /add-badge in Discord.");
    }

    function resetNameplateForm() {
        const currentUserId = UserStore.getCurrentUser()?.id ?? "";
        setEditingNameplateId(null);
        setNameplateUserId(currentUserId);
        setNameplateVideo("");
    }

    async function saveNameplate() {
        const targetUserId = nameplateUserId.trim() || (UserStore.getCurrentUser()?.id ?? "");
        const targetVideo = nameplateVideo.trim();

        if (!targetUserId || !targetVideo) {
            setNameplateStatus("Add a Discord user ID and choose a video or image first.");
            return;
        }

        const nextNameplate: LocalNameplate = {
            id: editingNameplateId ?? makeNameplateId(),
            userId: targetUserId,
            videoUrl: targetVideo
        };

        const next = editingNameplateId
            ? nameplates.map(entry => entry.id === editingNameplateId ? nextNameplate : entry)
            : [...nameplates, nextNameplate];

        try {
            await writeStoredJson(NAMEPLATES_KEY, next);
            setNameplates(next);
            setNameplateStatus("Saved. Previews on your own client immediately - switch servers or scroll the member list to see it.");
            resetNameplateForm();
        } catch (e) {
            setNameplateStatus(`Save failed: ${String(e)}`);
        }
    }

    function useMyIdForNameplate() {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (currentUserId) setNameplateUserId(currentUserId);
    }

    function editNameplate(entry: LocalNameplate) {
        setEditingNameplateId(entry.id);
        setNameplateUserId(entry.userId);
        setNameplateVideo(entry.videoUrl);
        setActiveSettingsModal("nameplate");
    }

    async function deleteNameplate(id: string) {
        const next = nameplates.filter(entry => entry.id !== id);

        try {
            await writeStoredJson(NAMEPLATES_KEY, next);
            setNameplates(next);
            setNameplateStatus("Nameplate deleted.");
            if (editingNameplateId === id) resetNameplateForm();
        } catch (e) {
            setNameplateStatus(`Delete failed: ${String(e)}`);
        }
    }

    async function chooseNameplateVideo() {
        const file = await chooseFile("video/webm,video/mp4,image/png,image/jpeg,image/webp,image/gif");
        if (!file) return;

        const dataUrl = await fileToDataUrl(file);
        setNameplateVideo(dataUrl);
        if (!nameplateUserId.trim()) setNameplateUserId(UserStore.getCurrentUser()?.id ?? "");
        setNameplateStatus("Selected. Press Save to preview it, or download it to publish for everyone.");
    }

    function downloadNameplateVideoFile() {
        const targetUserId = nameplateUserId.trim() || (UserStore.getCurrentUser()?.id ?? "");
        if (!targetUserId || !nameplateVideo) {
            setNameplateStatus("Add a Discord user ID and choose a video or image first.");
            return;
        }

        const mimeMatch = nameplateVideo.match(/^data:([^;]+);/);
        const ext = extensionForMime(mimeMatch?.[1] ?? "");
        const file = dataUrlToFile(nameplateVideo, `o2cord-nameplate-${targetUserId}.${ext}`);
        if (!file) {
            setNameplateStatus("Could not read that file.");
            return;
        }

        saveFile(file);
        setNameplateStatus(`Video saved to your Downloads folder. Attach it with: -nameplate ${targetUserId}`);
    }

    async function saveAndDownloadNameplate() {
        // Download first - it reads the current form state, which
        // saveNameplate() clears afterwards via resetNameplateForm().
        downloadNameplateVideoFile();
        await saveNameplate();
    }

    function resetUssro2Form() {
        const currentUserId = UserStore.getCurrentUser()?.id ?? "";
        setEditingUssro2Id(null);
        setUssro2UserId(currentUserId);
        setUssro2Image("");
    }

    function buildUssro2PublishJson(entry?: LocalUssro2Background) {
        const targetUserId = cleanO2Ussro2UserId(entry?.userId ?? ussro2UserId);
        const targetImage = cleanO2Ussro2ImageUrl(entry?.imageUrl ?? ussro2Image);

        if (!targetUserId || !targetImage)
            return null;

        return JSON.stringify({ users: { [targetUserId]: targetImage } }, null, 4);
    }

    async function saveUssro2Background() {
        const targetUserId = cleanO2Ussro2UserId(ussro2UserId);
        const targetImage = cleanO2Ussro2ImageUrl(ussro2Image);

        if (!targetUserId || !targetImage) {
            setUssro2Status("Add a Discord user ID and choose an image or GIF first.");
            return;
        }

        const existing = editingUssro2Id
            ? ussro2Backgrounds.find(entry => entry.id === editingUssro2Id)
            : undefined;
        const nextEntry: LocalUssro2Background = {
            id: editingUssro2Id ?? makeUssro2Id(),
            userId: targetUserId,
            imageUrl: targetImage,
            enabled: existing?.enabled ?? true
        };

        const next = editingUssro2Id
            ? ussro2Backgrounds.map(entry => entry.id === editingUssro2Id ? nextEntry : entry)
            : [...ussro2Backgrounds, nextEntry];

        try {
            await writeStoredJson(USSRO2_KEY, next);
            setUssro2Backgrounds(next);
            setUssro2Status("ussro2 saved locally. Reopen that profile or voice tile to refresh.");
            resetUssro2Form();
        } catch (e) {
            setUssro2Status(`Save failed: ${String(e)}`);
        }
    }

    async function toggleUssro2Enabled(id: string, enabled: boolean) {
        const next = ussro2Backgrounds.map(entry => entry.id === id ? { ...entry, enabled } : entry);

        try {
            await writeStoredJson(USSRO2_KEY, next);
            setUssro2Backgrounds(next);
        } catch (e) {
            setUssro2Status(`Update failed: ${String(e)}`);
        }
    }

    function useMyIdForUssro2() {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (currentUserId) setUssro2UserId(currentUserId);
    }

    function editUssro2Background(entry: LocalUssro2Background) {
        setEditingUssro2Id(entry.id);
        setUssro2UserId(entry.userId);
        setUssro2Image(entry.imageUrl);
        setActiveSettingsModal("ussro2");
    }

    async function deleteUssro2Background(id: string) {
        const next = ussro2Backgrounds.filter(entry => entry.id !== id);

        try {
            await writeStoredJson(USSRO2_KEY, next);
            setUssro2Backgrounds(next);
            setUssro2Status("ussro2 background deleted.");
            if (editingUssro2Id === id) resetUssro2Form();
        } catch (e) {
            setUssro2Status(`Delete failed: ${String(e)}`);
        }
    }

    async function chooseUssro2Image() {
        const image = await chooseImage();
        if (!image) return;

        setUssro2Image(image);
        if (!ussro2UserId.trim()) setUssro2UserId(UserStore.getCurrentUser()?.id ?? "");
        setUssro2Status("Image selected. Press Save to apply it locally.");
    }

    async function copyUssro2PublicJson(entry?: LocalUssro2Background) {
        const json = buildUssro2PublishJson(entry);
        if (!json) {
            setUssro2Status("Add a Discord user ID and image first.");
            return;
        }

        try {
            await copyWithToast(json, "ussro2 public JSON copied.");
            setUssro2Status("Copied. Send it to publish into backgrounds.json.");
        } catch (e) {
            setUssro2Status(`Copy failed: ${String(e)}`);
        }
    }

    function downloadUssro2PublicJson(entry?: LocalUssro2Background) {
        const json = buildUssro2PublishJson(entry);
        const targetUserId = cleanO2Ussro2UserId(entry?.userId ?? ussro2UserId);
        if (!json || !targetUserId) {
            setUssro2Status("Add a Discord user ID and image first.");
            return;
        }

        saveFile(new File([json], `o2cord-ussro2-${targetUserId}.json`, { type: "application/json" }));
        setUssro2Status("Saved JSON to your Downloads folder.");
    }

    function resetNitroServerForm() {
        setEditingNitroServerId(null);
        setNitroServerRoleId("");
        setNitroServerImage("");
    }

    function buildNitroServerPublishJson(entry?: LocalNitroServerRoleIcon) {
        const targetRoleId = cleanO2NitroServerRoleId(entry?.roleId ?? nitroServerRoleId);
        const targetImage = cleanO2NitroServerImageUrl(entry?.imageUrl ?? nitroServerImage);

        if (!targetRoleId || !targetImage)
            return null;

        return JSON.stringify({ roles: { [targetRoleId]: targetImage } }, null, 4);
    }

    async function saveNitroServerRoleIcon() {
        const targetRoleId = cleanO2NitroServerRoleId(nitroServerRoleId);
        const targetImage = cleanO2NitroServerImageUrl(nitroServerImage);

        if (!targetRoleId || !targetImage) {
            setNitroServerStatus("Add a role ID and choose an image first.");
            return;
        }

        const existing = editingNitroServerId
            ? nitroServerIcons.find(entry => entry.id === editingNitroServerId)
            : undefined;
        const nextEntry: LocalNitroServerRoleIcon = {
            id: editingNitroServerId ?? makeNitroServerId(),
            roleId: targetRoleId,
            imageUrl: targetImage,
            enabled: existing?.enabled ?? true
        };

        const next = editingNitroServerId
            ? nitroServerIcons.map(entry => entry.id === editingNitroServerId ? nextEntry : entry)
            : [...nitroServerIcons, nextEntry];

        try {
            await writeStoredJson(NITROSERVER_KEY, next);
            setNitroServerIcons(next);
            setNitroServerStatus("Role icon saved locally.");
            resetNitroServerForm();
        } catch (e) {
            setNitroServerStatus(`Save failed: ${String(e)}`);
        }
    }

    async function toggleNitroServerEnabled(id: string, enabled: boolean) {
        const next = nitroServerIcons.map(entry => entry.id === id ? { ...entry, enabled } : entry);

        try {
            await writeStoredJson(NITROSERVER_KEY, next);
            setNitroServerIcons(next);
        } catch (e) {
            setNitroServerStatus(`Update failed: ${String(e)}`);
        }
    }

    function editNitroServerRoleIcon(entry: LocalNitroServerRoleIcon) {
        setEditingNitroServerId(entry.id);
        setNitroServerRoleId(entry.roleId);
        setNitroServerImage(entry.imageUrl);
        setActiveSettingsModal("nitroserver");
    }

    async function deleteNitroServerRoleIcon(id: string) {
        const next = nitroServerIcons.filter(entry => entry.id !== id);

        try {
            await writeStoredJson(NITROSERVER_KEY, next);
            setNitroServerIcons(next);
            setNitroServerStatus("Role icon deleted.");
            if (editingNitroServerId === id) resetNitroServerForm();
        } catch (e) {
            setNitroServerStatus(`Delete failed: ${String(e)}`);
        }
    }

    async function chooseNitroServerImage() {
        const image = await chooseImage();
        if (!image) return;

        setNitroServerImage(image);
        setNitroServerStatus("Image selected. Press Save to apply it locally.");
    }

    async function copyNitroServerPublicJson(entry?: LocalNitroServerRoleIcon) {
        const json = buildNitroServerPublishJson(entry);
        if (!json) {
            setNitroServerStatus("Add a role ID and image first.");
            return;
        }

        try {
            await copyWithToast(json, "NitroServer role icon JSON copied.");
            setNitroServerStatus("Copied. Send it to publish into role-icons.json.");
        } catch (e) {
            setNitroServerStatus(`Copy failed: ${String(e)}`);
        }
    }

    function downloadNitroServerPublicJson(entry?: LocalNitroServerRoleIcon) {
        const json = buildNitroServerPublishJson(entry);
        const targetRoleId = cleanO2NitroServerRoleId(entry?.roleId ?? nitroServerRoleId);
        if (!json || !targetRoleId) {
            setNitroServerStatus("Add a role ID and image first.");
            return;
        }

        saveFile(new File([json], `o2cord-nitroserver-${targetRoleId}.json`, { type: "application/json" }));
        setNitroServerStatus("Saved JSON to your Downloads folder.");
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

            {(SHOW_ADD_BADGE_FEATURE || SHOW_ADD_NAMEPLATE_FEATURE || SHOW_USSRO2_FEATURE || SHOW_NITROSERVER_FEATURE) && (
                <section className="o2-debug-feature-grid">
                    {SHOW_NITROSERVER_FEATURE && (
                        <DebugFeatureCard
                            title="NitroServer Role Icon"
                            description="Add a role icon locally, then export JSON for the public registry"
                            onSettingsClick={() => setActiveSettingsModal("nitroserver")}
                        />
                    )}
                    {SHOW_ADD_BADGE_FEATURE && (
                        <DebugFeatureCard
                            title="Add Badge"
                            description="Add custom image badges to Discord profile badge rows"
                            onSettingsClick={() => setActiveSettingsModal("badge")}
                        />
                    )}
                    {SHOW_ADD_NAMEPLATE_FEATURE && (
                        <DebugFeatureCard
                            title="Add Nameplate"
                            description="Add an animated video background behind a username in the member list"
                            onSettingsClick={() => setActiveSettingsModal("nameplate")}
                        />
                    )}
                    {SHOW_USSRO2_FEATURE && (
                        <DebugFeatureCard
                            title="ussro2"
                            description="Add profile or voice backgrounds locally, then export JSON for the public registry"
                            onSettingsClick={() => setActiveSettingsModal("ussro2")}
                        />
                    )}
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
                <section className="o2-debug-managed-section">
                    <Forms.FormTitle tag="h5">Saved Local Badges</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8}>
                        Toggle a badge off to hide it without losing its config. The gear opens it for
                        editing (name, image, size, link); the trash removes it for good.
                    </Forms.FormText>
                    <div className="o2-debug-managed-grid">
                        {badges.length === 0 && (
                            <Forms.FormText>No local badges saved yet.</Forms.FormText>
                        )}
                        {badges.map(badge => (
                            <AddonCard
                                key={badge.id}
                                name={badge.name}
                                description={badge.userId + (badge.link ? " · has link" : "")}
                                enabled={badge.enabled ?? true}
                                setEnabled={enabled => toggleBadgeEnabled(badge.id, enabled)}
                                infoButton={
                                    <div className="o2-debug-badge-card-actions">
                                        <button
                                            type="button"
                                            className="o2-debug-plugin-info"
                                            aria-label={`Edit ${badge.name}`}
                                            onClick={() => editBadge(badge)}
                                        >
                                            <CogWheel width={18} height={18} />
                                        </button>
                                        <button
                                            type="button"
                                            className="o2-debug-plugin-info"
                                            aria-label={`Delete ${badge.name}`}
                                            onClick={() => deleteBadge(badge.id)}
                                        >
                                            <DeleteIcon width={18} height={18} />
                                        </button>
                                    </div>
                                }
                            />
                        ))}
                    </div>
                </section>
            )}

            {SHOW_ADD_NAMEPLATE_FEATURE && (
                <section className="o2-debug-managed-section">
                    <Forms.FormTitle tag="h5">Saved Local Nameplates</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8}>
                        Previews on your own client only until you download the video and publish it with
                        the bot. The gear reopens it for editing; the trash removes it.
                    </Forms.FormText>
                    <div className="o2-debug-nameplate-list">
                        {nameplates.length === 0 && (
                            <Forms.FormText>No local nameplates saved yet.</Forms.FormText>
                        )}
                        {nameplates.map(entry => (
                            <div key={entry.id} className="o2-debug-nameplate-item">
                                {isVideoDataUrl(entry.videoUrl)
                                    ? <video src={entry.videoUrl} autoPlay loop muted playsInline />
                                    : <img src={entry.videoUrl} alt="" />}
                                <div className="o2-debug-nameplate-meta">
                                    <strong>{entry.userId}</strong>
                                </div>
                                <button
                                    type="button"
                                    className="o2-debug-plugin-info"
                                    aria-label={`Edit nameplate for ${entry.userId}`}
                                    onClick={() => editNameplate(entry)}
                                >
                                    <CogWheel width={18} height={18} />
                                </button>
                                <button
                                    type="button"
                                    className="o2-debug-plugin-info"
                                    aria-label={`Delete nameplate for ${entry.userId}`}
                                    onClick={() => deleteNameplate(entry.id)}
                                >
                                    <DeleteIcon width={18} height={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {SHOW_USSRO2_FEATURE && (
                <section className="o2-debug-managed-section">
                    <Forms.FormTitle tag="h5">Saved ussro2 Backgrounds</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8}>
                        These entries preview locally on debug builds. Copy or download JSON to publish the same image for everyone.
                    </Forms.FormText>
                    <div className="o2-debug-nameplate-list">
                        {ussro2Backgrounds.length === 0 && (
                            <Forms.FormText>No ussro2 backgrounds saved yet.</Forms.FormText>
                        )}
                        {ussro2Backgrounds.map(entry => (
                            <div key={entry.id} className="o2-debug-nameplate-item o2-debug-ussro2-item">
                                <img src={entry.imageUrl} alt="" />
                                <div className="o2-debug-nameplate-meta">
                                    <strong>{entry.userId}</strong>
                                    <span>{entry.enabled === false ? "Disabled" : "Enabled"}</span>
                                </div>
                                <Button
                                    size={Button.Sizes.SMALL}
                                    color={entry.enabled === false ? Button.Colors.GREEN : Button.Colors.PRIMARY}
                                    onClick={() => toggleUssro2Enabled(entry.id, entry.enabled === false)}
                                >
                                    {entry.enabled === false ? "Enable" : "Disable"}
                                </Button>
                                <button
                                    type="button"
                                    className="o2-debug-plugin-info"
                                    aria-label={`Edit ussro2 for ${entry.userId}`}
                                    onClick={() => editUssro2Background(entry)}
                                >
                                    <CogWheel width={18} height={18} />
                                </button>
                                <button
                                    type="button"
                                    className="o2-debug-plugin-info"
                                    aria-label={`Delete ussro2 for ${entry.userId}`}
                                    onClick={() => deleteUssro2Background(entry.id)}
                                >
                                    <DeleteIcon width={18} height={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                    {ussro2Status && (
                        <Forms.FormText className={Margins.top8}>{ussro2Status}</Forms.FormText>
                    )}
                </section>
            )}

            {SHOW_NITROSERVER_FEATURE && (
                <section className="o2-debug-managed-section">
                    <Forms.FormTitle tag="h5">Saved NitroServer Role Icons</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8}>
                        These entries preview locally on debug builds. Copy or download JSON to publish the same icon for everyone.
                    </Forms.FormText>
                    <div className="o2-debug-nameplate-list">
                        {nitroServerIcons.length === 0 && (
                            <Forms.FormText>No role icons saved yet.</Forms.FormText>
                        )}
                        {nitroServerIcons.map(entry => (
                            <div key={entry.id} className="o2-debug-nameplate-item o2-debug-ussro2-item">
                                <img src={entry.imageUrl} alt="" />
                                <div className="o2-debug-nameplate-meta">
                                    <strong>{entry.roleId}</strong>
                                    <span>{entry.enabled === false ? "Disabled" : "Enabled"}</span>
                                </div>
                                <Button
                                    size={Button.Sizes.SMALL}
                                    color={entry.enabled === false ? Button.Colors.GREEN : Button.Colors.PRIMARY}
                                    onClick={() => toggleNitroServerEnabled(entry.id, entry.enabled === false)}
                                >
                                    {entry.enabled === false ? "Enable" : "Disable"}
                                </Button>
                                <Button size={Button.Sizes.SMALL} color={Button.Colors.GREEN} onClick={() => copyNitroServerPublicJson(entry)}>
                                    Copy JSON
                                </Button>
                                <button
                                    type="button"
                                    className="o2-debug-plugin-info"
                                    aria-label={`Edit role icon for ${entry.roleId}`}
                                    onClick={() => editNitroServerRoleIcon(entry)}
                                >
                                    <CogWheel width={18} height={18} />
                                </button>
                                <button
                                    type="button"
                                    className="o2-debug-plugin-info"
                                    aria-label={`Delete role icon for ${entry.roleId}`}
                                    onClick={() => deleteNitroServerRoleIcon(entry.id)}
                                >
                                    <DeleteIcon width={18} height={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                    {nitroServerStatus && (
                        <Forms.FormText className={Margins.top8}>{nitroServerStatus}</Forms.FormText>
                    )}
                </section>
            )}

            {SHOW_ADD_BADGE_FEATURE && activeSettingsModal === "badge" && (
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
                                <TextInput
                                    placeholder="Link opened when the badge is clicked (optional)"
                                    value={badgeLink}
                                    onChange={setBadgeLink}
                                />
                                <div className="o2-debug-image-file-row">
                                    <div className="o2-debug-image-file-preview">
                                        {badgeImage ? <img src={badgeImage} alt="" /> : <span>No image</span>}
                                    </div>
                                    <Button size={Button.Sizes.SMALL} onClick={chooseBadgeImage}>Choose Image</Button>
                                </div>
                                <div className="o2-debug-actions">
                                    <Button onClick={saveBadge}>{editingId ? "Save Changes" : "Save Badge"}</Button>
                                    <Button color={Button.Colors.GREEN} onClick={downloadPublicBadgeJson}>Download Public JSON</Button>
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

            {SHOW_ADD_NAMEPLATE_FEATURE && activeSettingsModal === "nameplate" && (
                <div className="o2-debug-modal-backdrop" onClick={() => setActiveSettingsModal(null)}>
                    <div
                        className="o2-debug-modal o2-debug-modal-badge"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="o2-debug-modal-header">
                            <div>
                                <h2>Add Nameplate</h2>
                                <Forms.FormText>
                                    Add a Discord user ID and a short video or a static image (png, jpg, webp,
                                    gif). It previews on your own client right away; download it and publish
                                    with <code>-nameplate</code> to show it for everyone.
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
                                    value={nameplateUserId}
                                    onChange={setNameplateUserId}
                                />
                                <div className="o2-debug-actions">
                                    <Button size={Button.Sizes.SMALL} onClick={useMyIdForNameplate}>Use My ID</Button>
                                </div>
                                <div className="o2-debug-image-file-row">
                                    <div className="o2-debug-image-file-preview">
                                        {nameplateVideo
                                            ? (isVideoDataUrl(nameplateVideo)
                                                ? <video src={nameplateVideo} autoPlay loop muted playsInline />
                                                : <img src={nameplateVideo} alt="" />)
                                            : <span>No file</span>}
                                    </div>
                                    <Button size={Button.Sizes.SMALL} onClick={chooseNameplateVideo}>Choose Video/Image</Button>
                                </div>
                                <div className="o2-debug-actions">
                                    <Button onClick={saveNameplate}>{editingNameplateId ? "Save Changes" : "Save Nameplate"}</Button>
                                    <Button color={Button.Colors.GREEN} onClick={downloadNameplateVideoFile}>Download for Bot</Button>
                                    <Button color={Button.Colors.GREEN} onClick={saveAndDownloadNameplate}>Save & Download</Button>
                                    <Button color={Button.Colors.PRIMARY} onClick={resetNameplateForm}>Clear</Button>
                                </div>
                                {nameplateStatus && (
                                    <Forms.FormText className={Margins.top8}>{nameplateStatus}</Forms.FormText>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {SHOW_USSRO2_FEATURE && activeSettingsModal === "ussro2" && (
                <div className="o2-debug-modal-backdrop" onClick={() => setActiveSettingsModal(null)}>
                    <div
                        className="o2-debug-modal o2-debug-modal-badge"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="o2-debug-modal-header">
                            <div>
                                <h2>ussro2</h2>
                                <Forms.FormText>
                                    Add a Discord user ID and an image or GIF. Debug sees it locally;
                                    public builds see it after the JSON is published to backgrounds.json.
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
                                    value={ussro2UserId}
                                    onChange={setUssro2UserId}
                                />
                                <div className="o2-debug-actions">
                                    <Button size={Button.Sizes.SMALL} onClick={useMyIdForUssro2}>Use My ID</Button>
                                </div>
                                <TextInput
                                    placeholder="Image or GIF URL"
                                    value={ussro2Image}
                                    onChange={setUssro2Image}
                                />
                                <div className="o2-debug-image-file-row">
                                    <div className="o2-debug-image-file-preview o2-debug-image-file-preview-wide">
                                        {ussro2Image ? <img src={ussro2Image} alt="" /> : <span>No image</span>}
                                    </div>
                                    <Button size={Button.Sizes.SMALL} onClick={chooseUssro2Image}>Choose GIF/Image</Button>
                                </div>
                                <div className="o2-debug-actions">
                                    <Button onClick={saveUssro2Background}>{editingUssro2Id ? "Save Changes" : "Save"}</Button>
                                    <Button color={Button.Colors.GREEN} onClick={() => copyUssro2PublicJson()}>Copy Public JSON</Button>
                                    <Button color={Button.Colors.GREEN} onClick={() => downloadUssro2PublicJson()}>Download JSON</Button>
                                    <Button color={Button.Colors.PRIMARY} onClick={resetUssro2Form}>Clear</Button>
                                </div>
                                {ussro2Status && (
                                    <Forms.FormText className={Margins.top8}>{ussro2Status}</Forms.FormText>
                                )}
                            </div>
                        </section>

                        <section className="o2-debug-ussro2-preview-section">
                            <Forms.FormTitle tag="h5">Preview</Forms.FormTitle>
                            <div
                                className="o2-debug-ussro2-preview"
                                style={ussro2Image ? { backgroundImage: `url(${ussro2Image})` } : undefined}
                            >
                                <span>{ussro2Image ? "ussro2 preview" : "Choose an image or GIF"}</span>
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {SHOW_NITROSERVER_FEATURE && activeSettingsModal === "nitroserver" && (
                <div className="o2-debug-modal-backdrop" onClick={() => setActiveSettingsModal(null)}>
                    <div
                        className="o2-debug-modal o2-debug-modal-badge"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="o2-debug-modal-header">
                            <div>
                                <h2>NitroServer Role Icon</h2>
                                <Forms.FormText>
                                    Add a role ID (right-click a role &gt; Copy Role ID) and an image. Debug sees it
                                    locally right away; public builds see it after the JSON is published to role-icons.json.
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
                                    placeholder="Role ID"
                                    value={nitroServerRoleId}
                                    onChange={setNitroServerRoleId}
                                />
                                <div className="o2-debug-image-file-row">
                                    <div className="o2-debug-image-file-preview">
                                        {nitroServerImage ? <img src={nitroServerImage} alt="" /> : <span>No image</span>}
                                    </div>
                                    <Button size={Button.Sizes.SMALL} onClick={chooseNitroServerImage}>Choose Image</Button>
                                </div>
                                <div className="o2-debug-actions">
                                    <Button onClick={saveNitroServerRoleIcon}>{editingNitroServerId ? "Save Changes" : "Save"}</Button>
                                    <Button color={Button.Colors.GREEN} onClick={() => copyNitroServerPublicJson()}>Copy Public JSON</Button>
                                    <Button color={Button.Colors.GREEN} onClick={() => downloadNitroServerPublicJson()}>Download JSON</Button>
                                    <Button color={Button.Colors.PRIMARY} onClick={resetNitroServerForm}>Clear</Button>
                                </div>
                                {nitroServerStatus && (
                                    <Forms.FormText className={Margins.top8}>{nitroServerStatus}</Forms.FormText>
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
