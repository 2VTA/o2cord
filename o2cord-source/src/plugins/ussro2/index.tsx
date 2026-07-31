/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Forms, React, TextInput, UserStore } from "@webpack/common";

type Backgrounds = Record<string, string>;
const MAX_LOCAL_BACKGROUND_BYTES = 8 * 1024 * 1024;

function normalizeUserId(value: string) {
    return value.replace(/\D/g, "").trim();
}

function normalizeImageUrl(value: string) {
    return value.trim();
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

function writeBackgrounds(backgrounds: Backgrounds) {
    settings.store.backgrounds = JSON.stringify(backgrounds);
}

function getBackgroundUrl(userId?: string | null) {
    if (!userId) return null;

    return readBackgrounds()[userId] ?? null;
}

function Ussro2Settings() {
    const [userId, setUserId] = React.useState("");
    const [imageUrl, setImageUrl] = React.useState("");
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const backgrounds = readBackgrounds();
    const entries = Object.entries(backgrounds);

    const save = () => {
        const cleanUserId = normalizeUserId(userId);
        const cleanImageUrl = normalizeImageUrl(imageUrl);
        if (!cleanUserId || !cleanImageUrl) return;

        writeBackgrounds({
            ...backgrounds,
            [cleanUserId]: cleanImageUrl
        });

        setUserId("");
        setImageUrl("");
        forceUpdate();
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
        writeBackgrounds(next);
        forceUpdate();
    };

    return (
        <Forms.FormSection className="ussro2-manager">
            <Forms.FormTitle>Local Backgrounds</Forms.FormTitle>
            <Forms.FormText>
                Add a Discord user ID and an image or GIF URL. o2cord only saves this locally on your device.
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
                <Button onClick={save} disabled={!normalizeUserId(userId) || !normalizeImageUrl(imageUrl)}>
                    Save
                </Button>
            </div>

            <div className="ussro2-actions">
                <Button size={Button.Sizes.SMALL} onClick={useMyId}>
                    Use My ID
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
                            <div className="ussro2-url">{url}</div>
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
