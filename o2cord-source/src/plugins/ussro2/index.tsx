/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Forms, React, showToast, TextInput, Toasts, UserStore } from "@webpack/common";

type Backgrounds = Record<string, string>;
// This is stored as a plain string setting that gets re-serialized and
// synchronously rewritten to disk on every settings change, of any plugin,
// not just this one - a multi-MB data URL here makes every unrelated
// setting change stutter or hang. Local previews don't need full
// resolution, so this cap is intentionally much tighter than what the bot
// accepts for the actual published image.
const MAX_LOCAL_BACKGROUND_BYTES = 1.5 * 1024 * 1024;
const BACKGROUNDS_UPDATED_EVENT = "o2cord:ussro2-backgrounds-updated";

const backgroundRevisions = new Map<string, number>();

function normalizeUserId(value: string) {
    return value.replace(/\D/g, "").trim();
}

function normalizeImageUrl(value: string) {
    return value.trim();
}

function formatImageLabel(value: string) {
    const imageUrl = normalizeImageUrl(value);
    if (!imageUrl) return "";

    if (imageUrl.startsWith("data:image/")) {
        const mime = imageUrl.slice("data:".length, imageUrl.indexOf(";") === -1 ? undefined : imageUrl.indexOf(";"));
        const approxBytes = Math.round(imageUrl.length * 0.75);
        const size = approxBytes > 1024 * 1024
            ? `${(approxBytes / 1024 / 1024).toFixed(1)} MB`
            : `${Math.max(1, Math.round(approxBytes / 1024))} KB`;

        return `Local ${mime.replace("image/", "").toUpperCase()} image - ${size}`;
    }

    return imageUrl.length > 96 ? `${imageUrl.slice(0, 72)}...${imageUrl.slice(-18)}` : imageUrl;
}

function formatImageTitle(value: string) {
    const imageUrl = normalizeImageUrl(value);
    if (imageUrl.startsWith("data:image/"))
        return "Local image saved in o2cord settings";

    return imageUrl;
}

function cacheBustImageUrl(userId: string, imageUrl: string) {
    if (!imageUrl || imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) return imageUrl;

    const revision = backgroundRevisions.get(userId);
    if (!revision) return imageUrl;

    const separator = imageUrl.includes("?") ? "&" : "?";
    return `${imageUrl}${separator}o2rev=${revision}`;
}

function refreshProfilesNow(userId?: string) {
    try {
        const nextRevision = Date.now();
        if (userId) backgroundRevisions.set(userId, nextRevision);
        window.dispatchEvent(new CustomEvent(BACKGROUNDS_UPDATED_EVENT, { detail: { userId, revision: nextRevision } }));
    } catch { }

    try {
        const webpack = (Vencord as any).Webpack;
        webpack?.findByStoreName?.("UserStore")?.emitChange?.();
        webpack?.findByStoreName?.("UserProfileStore")?.emitChange?.();
        webpack?.findByProps?.("getUserProfile", "getGuildMemberProfile")?.emitChange?.();
    } catch { }
}

function pickLocalBackground(onLoad: (url: string) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";

    input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return;
        if (file.size > MAX_LOCAL_BACKGROUND_BYTES) {
            alert("This image is too large. Please use an image or GIF under 8 MB.");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") onLoad(reader.result);
        };
        reader.readAsDataURL(file);
    };

    input.click();
}

function readBackgrounds(): Backgrounds {
    const raw = settings.store.backgrounds;
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

        const backgrounds: Backgrounds = {};
        for (const [userId, imageUrl] of Object.entries(parsed)) {
            const cleanUserId = normalizeUserId(userId);
            const cleanImageUrl = typeof imageUrl === "string" ? normalizeImageUrl(imageUrl) : "";
            if (cleanUserId && cleanImageUrl) backgrounds[cleanUserId] = cleanImageUrl;
        }

        return backgrounds;
    } catch {
        return {};
    }
}

function writeBackgrounds(backgrounds: Backgrounds, changedUserId?: string) {
    settings.store.backgrounds = JSON.stringify(backgrounds);
    refreshProfilesNow(changedUserId);
}

function getPublicPayload(userId: string, imageUrl: string) {
    return {
        userId,
        imageUrl,
        users: {
            [userId]: imageUrl
        }
    };
}

async function copyPublicPayload(userId: string, imageUrl: string) {
    await navigator.clipboard?.writeText?.(JSON.stringify(getPublicPayload(userId, imageUrl), null, 2));
}

async function publishSharedBackground(userId: string, imageUrl: string) {
    const endpoint = normalizeImageUrl(settings.store.publishEndpoint);
    if (!endpoint) {
        await copyPublicPayload(userId, imageUrl);
        showToast("Copied shared ussro2 JSON. Add a publish endpoint for one-click updates.", Toasts.Type.MESSAGE);
        return false;
    }

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(getPublicPayload(userId, imageUrl))
    });

    if (!res.ok) throw new Error(`Publish endpoint returned ${res.status}`);
    showToast("Shared ussro2 background published.", Toasts.Type.SUCCESS);
    return true;
}

function getBackgroundUrl(userId?: string | null) {
    if (!userId) return null;

    const imageUrl = readBackgrounds()[userId] ?? null;
    return imageUrl ? cacheBustImageUrl(userId, imageUrl) : null;
}

function Ussro2Settings() {
    const [userId, setUserId] = React.useState("");
    const [imageUrl, setImageUrl] = React.useState("");
    const [isPublishing, setIsPublishing] = React.useState(false);
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const backgrounds = readBackgrounds();
    const entries = Object.entries(backgrounds);

    const save = (reset = true) => {
        const cleanUserId = normalizeUserId(userId);
        const cleanImageUrl = normalizeImageUrl(imageUrl);
        if (!cleanUserId || !cleanImageUrl) return null;

        if (cleanImageUrl.startsWith("data:") && cleanImageUrl.length * 0.75 > MAX_LOCAL_BACKGROUND_BYTES) {
            alert("This image is too large. Please use an image or GIF under 1.5 MB, or a hosted URL instead.");
            return null;
        }

        writeBackgrounds({
            ...backgrounds,
            [cleanUserId]: cleanImageUrl
        }, cleanUserId);

        if (reset) {
            setUserId("");
            setImageUrl("");
        }
        forceUpdate();
        return { userId: cleanUserId, imageUrl: cleanImageUrl };
    };

    const publish = async () => {
        const saved = save(false);
        if (!saved) return;

        setIsPublishing(true);
        try {
            await publishSharedBackground(saved.userId, saved.imageUrl);
            setUserId("");
            setImageUrl("");
            forceUpdate();
        } catch (error) {
            console.error("[ussro2] Failed to publish shared background", error);
            try {
                await copyPublicPayload(saved.userId, saved.imageUrl);
                showToast("Publish failed. Copied shared ussro2 JSON instead.", Toasts.Type.FAILURE);
            } catch {
                showToast("Publish failed. Check the console for details.", Toasts.Type.FAILURE);
            }
        } finally {
            setIsPublishing(false);
        }
    };

    const useMyId = () => {
        const currentUser = UserStore.getCurrentUser();
        if (currentUser?.id) setUserId(currentUser.id);
    };

    const edit = (id: string, url: string) => {
        setUserId(id);
        setImageUrl(url);
    };

    const remove = (id: string) => {
        const next = { ...backgrounds };
        delete next[id];
        writeBackgrounds(next, id);
        forceUpdate();
    };

    React.useEffect(() => {
        const onUpdated = () => forceUpdate();
        window.addEventListener(BACKGROUNDS_UPDATED_EVENT, onUpdated);

        return () => window.removeEventListener(BACKGROUNDS_UPDATED_EVENT, onUpdated);
    }, []);

    return (
        <Forms.FormSection className="ussro2-manager">
            <Forms.FormTitle>Local Backgrounds</Forms.FormTitle>
            <Forms.FormText>
                Add a Discord user ID and an image or GIF URL. Save keeps it local; Publish Shared sends it to your configured public registry endpoint.
            </Forms.FormText>

            <div className="ussro2-row">
                <TextInput
                    value={userId}
                    onChange={value => setUserId(normalizeUserId(value))}
                    placeholder="Discord user ID"
                />
                <TextInput
                    value={imageUrl}
                    onChange={setImageUrl}
                    placeholder="Image or GIF URL"
                />
                <Button
                    onClick={() => pickLocalBackground(setImageUrl)}
                    color={Button.Colors.BRAND}
                >
                    Choose GIF/Image
                </Button>
                <Button onClick={() => save()} disabled={!normalizeUserId(userId) || !normalizeImageUrl(imageUrl)}>
                    Save Local
                </Button>
            </div>

            <div className="ussro2-actions">
                <Button size={Button.Sizes.SMALL} onClick={useMyId}>
                    Use My ID
                </Button>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.GREEN}
                    disabled={isPublishing || !normalizeUserId(userId) || !normalizeImageUrl(imageUrl)}
                    onClick={publish}
                >
                    {isPublishing ? "Publishing..." : "Publish Shared"}
                </Button>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.RED}
                    disabled={!entries.length}
                    onClick={() => {
                        writeBackgrounds({});
                        forceUpdate();
                    }}
                >
                    Clear All
                </Button>
            </div>

            <Forms.FormTitle>Saved Backgrounds</Forms.FormTitle>
            <div className="ussro2-list">
                {entries.length === 0 && <div className="ussro2-empty">No local backgrounds saved.</div>}
                {entries.map(([id, url]) => (
                    <div className="ussro2-entry" key={id}>
                        <div className="ussro2-preview" style={{ backgroundImage: `url(${url})` }} />
                        <div className="ussro2-meta">
                            <div className="ussro2-user">{id}</div>
                            <div className="ussro2-url" title={formatImageTitle(url)}>
                                {formatImageLabel(url)}
                            </div>
                        </div>
                        <div className="ussro2-actions">
                            <Button size={Button.Sizes.SMALL} onClick={() => edit(id, url)}>
                                Edit
                            </Button>
                            <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => remove(id)}>
                                Delete
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </Forms.FormSection>
    );
}

const settings = definePluginSettings({
    nitroFirst: {
        description: "Banner to use if both Discord and ussro2 local backgrounds are present",
        type: OptionType.SELECT,
        options: [
            { label: "Discord banner first", value: true, default: true },
            { label: "ussro2 local background first", value: false },
        ]
    },
    voiceBackground: {
        description: "Use saved ussro2 images as voice chat backgrounds",
        type: OptionType.BOOLEAN,
        default: false,
        restartNeeded: true
    },
    backgrounds: {
        type: OptionType.STRING,
        description: "Saved local user background map",
        default: "{}",
        hidden: true
    },
    publishEndpoint: {
        type: OptionType.STRING,
        description: "Optional private endpoint used by debug o2 to publish shared ussro2 backgrounds",
        default: ""
    },
    manager: {
        type: OptionType.COMPONENT,
        description: "",
        component: Ussro2Settings
    }
});

export default definePlugin({
    name: "ussro2",
    description: "Local-only user background images for profile previews.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    hidden: true,
    settings,
    patches: [
        {
            find: ':"SHOULD_LOAD");',
            replacement: {
                match: /\i(?:\?)?.getPreviewBanner\(\i,\i,\i\)(?=.{0,100}"COMPLETE")/,
                replace: "$self.patchBannerUrl(arguments[0])||$&"
            }
        },
        {
            find: "\"data-selenium-video-tile\":",
            predicate: () => settings.store.voiceBackground,
            replacement: [
                {
                    match: /(?<=function\((\i),\i\)\{)(?=let.{20,40},style:)/,
                    replace: "$1.style=$self.getVoiceBackgroundStyles($1);"
                }
            ]
        },
        {
            find: '"VideoBackground-web"',
            predicate: () => settings.store.voiceBackground,
            replacement: {
                match: /backgroundColor:.{0,25},\{style:(?=\i\?)/,
                replace: "$&$self.userHasBackground(arguments[0]?.userId)?null:",
            }
        }
    ],

    getVoiceBackgroundStyles({ className, participantUserId }: any) {
        const imageUrl = getBackgroundUrl(participantUserId);
        if (!className?.includes?.("tile") || !imageUrl) return;

        return {
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat"
        };
    },

    patchBannerUrl({ displayProfile }: any) {
        if (displayProfile?.banner && settings.store.nitroFirst) return;

        return getBackgroundUrl(displayProfile?.userId);
    },

    userHasBackground(userId: string) {
        return Boolean(getBackgroundUrl(userId));
    }
});
