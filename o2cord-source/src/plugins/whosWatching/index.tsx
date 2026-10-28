/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { Heading, HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { getIntlMessage, openUserProfile } from "@utils/discord";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { User } from "@vencord/discord-types";
import { findComponentByCodeLazy, findCssClassesLazy, findStoreLazy } from "@webpack";
import { Clickable, RelationshipStore, Tooltip, UserStore, useEffect, useRef, useState, useStateFromStores } from "@webpack/common";
import { JSX } from "react";

interface WatchingProps {
    userIds: string[];
    guildId?: string;
}

const ApplicationStreamingStore = findStoreLazy("ApplicationStreamingStore");
const SpeakingStore = findStoreLazy("SpeakingStore");
const UserSummaryItem = findComponentByCodeLazy("defaultRenderUser", "showDefaultAvatarsForNullUsers");
const AvatarStyles = findCssClassesLazy("moreUsers", "clickableAvatar", "avatar");
const cl = classNameFactory("vc-whos-watching-");

function getUsername(user: User): string {
    return RelationshipStore.getNickname(user.id) || user.globalName || user.username;
}

function Watching({ userIds, guildId }: WatchingProps): JSX.Element {
    let missingUsers = 0;
    const users = userIds.map(id => UserStore.getUser(id)).filter(user => Boolean(user) ? true : (missingUsers += 1, false));
    return (
        <div className={cl("content")}>
            {userIds.length ?
                (
                    <div className={cl("spectating")}>
                        <Heading>{getIntlMessage("SPECTATORS", { numViewers: userIds.length })}</Heading>
                        <Flex flexDirection="column" gap="6" >
                            {users.map(user => (
                                <Flex key={user.id} flexDirection="row" gap="6" alignContent="center">
                                    <img className={cl("user-avatar")} src={user.getAvatarURL(guildId)} alt="" />
                                    {getUsername(user)}
                                </Flex>
                            ))}
                            {missingUsers > 0 &&
                                <span className={cl("more-users")}>
                                    {`+${getIntlMessage("NUM_USERS", { num: missingUsers })}`}
                                </span>
                            }
                        </Flex>
                    </div>
                )
                : (
                    <span className={cl("no-viewers")}>
                        No spectators
                    </span>
                )
            }
        </div>
    );
}

const settings = definePluginSettings({
    showPanel: {
        description: "Show spectators under screenshare panel",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: true
    },
    // Old home of the share image (a data URL inside settings.json - ~5 MB that was kept in memory and
    // rewritten to disk on every settings change). Moved to DataStore on start; kept only to migrate.
    shareAvatarImage: {
        description: "Legacy storage of the share image (moved to DataStore)",
        type: OptionType.STRING,
        default: "",
        hidden: true
    },
    shareAvatarStaticFrame: {
        description: "Legacy storage of the share image's first frame (moved to DataStore)",
        type: OptionType.STRING,
        default: "",
        hidden: true
    },
    shareAvatarMode: {
        description: "When to show the custom share avatar image",
        type: OptionType.SELECT,
        options: [
            { label: "Show when talking", value: "talking", default: true },
            { label: "Always show", value: "always" }
        ]
    }
});

// Draws the gif's first frame to a canvas and returns it as a PNG -
// used as the "paused" look, since CSS can't pause a gif and swapping an
// <img src> to itself just restarts it rather than freezing it.
function extractFirstFrame(url: string): Promise<Blob | undefined> {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(undefined);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(b => resolve(b ?? undefined), "image/png");
        };
        img.onerror = () => resolve(undefined);
        img.src = url;
    });
}

// ---- the share image lives in DataStore (IndexedDB) as binary blobs and is shown through object URLs,
// so it isn't a multi-MB string in settings.json, in memory twice, and rewritten on every settings change.

const SHARE_KEY = "WhosWatching_shareAvatar";
interface StoredShare { image: Blob; frame?: Blob; }

const share = { image: "", frame: "", isGif: false };
const shareListeners = new Set<() => void>();

function applyShare(stored: StoredShare | undefined) {
    if (share.image) URL.revokeObjectURL(share.image);
    if (share.frame) URL.revokeObjectURL(share.frame);
    share.image = stored?.image ? URL.createObjectURL(stored.image) : "";
    share.frame = stored?.frame ? URL.createObjectURL(stored.frame) : "";
    share.isGif = stored?.image?.type === "image/gif";
    shareListeners.forEach(l => l());
}

async function saveShare(stored: StoredShare | undefined) {
    if (stored) await DataStore.set(SHARE_KEY, stored);
    else await DataStore.del(SHARE_KEY);
    applyShare(stored);
}

async function loadShare() {
    let stored = await DataStore.get<StoredShare>(SHARE_KEY).catch(() => undefined);
    const legacy = settings.store.shareAvatarImage;
    if (!stored && legacy) {
        // one-time move out of settings.json
        const toBlob = async (url: string) => url ? (await fetch(url)).blob() : undefined;
        const image = await toBlob(legacy);
        if (image) {
            stored = { image, frame: await toBlob(settings.store.shareAvatarStaticFrame) };
            await DataStore.set(SHARE_KEY, stored);
        }
    }
    if (legacy || settings.store.shareAvatarStaticFrame) {
        settings.store.shareAvatarImage = "";
        settings.store.shareAvatarStaticFrame = "";
    }
    applyShare(stored);
}

// Ryder's own add-on: when nobody's watching the stream, that space is
// empty - lets him drop in a custom image/gif there instead, either always
// visible or only while SpeakingStore reports he's actually talking.
function ShareAvatarSlot() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const l = () => forceUpdate(n => n + 1);
        shareListeners.add(l);
        return () => void shareListeners.delete(l);
    }, []);
    const image = share.image;
    const staticFrame = share.frame;
    const mode = settings.store.shareAvatarMode || "talking";
    const isSpeaking = useStateFromStores([SpeakingStore], () => SpeakingStore.isCurrentUserSpeaking());
    const { isGif } = share;
    // A gif only actually plays while talking - paused on its first frame
    // otherwise. Non-gif images have nothing to pause, always show as-is.
    const animating = mode === "always" || isSpeaking;

    async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        let frame: Blob | undefined;
        if (file.type === "image/gif") {
            const url = URL.createObjectURL(file);
            frame = await extractFirstFrame(url);
            URL.revokeObjectURL(url);
        }
        await saveShare({ image: file, frame });
    }

    if (!image) {
        return (
            <div className={cl("share-avatar-add")} onClick={() => fileInputRef.current?.click()}>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={onFileChosen}
                />
                <span>+</span>
            </div>
        );
    }

    const displaySrc = isGif && !animating && staticFrame ? staticFrame : image;

    return (
        <>
            <div className={cl("share-avatar-wrapper")}>
                {/* No key here on purpose - forcing a remount on every talk-state
                    toggle destroyed and recreated this element each time,
                    which is what caused the flicker. Swapping src in place on
                    the same element is enough; browsers restart gif playback
                    from frame 0 whenever src genuinely changes value. */}
                <img
                    className={cl("share-avatar-image")}
                    src={displaySrc}
                    alt=""
                />
            </div>
            <div className={cl("share-avatar-controls")}>
                <Clickable
                    className={cl("share-avatar-control-btn")}
                    onClick={() => fileInputRef.current?.click()}
                >
                    Change
                </Clickable>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={onFileChosen}
                />
                <Clickable
                    className={cl("share-avatar-control-btn")}
                    onClick={() => {
                        settings.store.shareAvatarMode = mode === "talking" ? "always" : "talking";
                        forceUpdate(n => n + 1);
                    }}
                >
                    {mode === "talking" ? "When talking" : "Always"}
                </Clickable>
                <Clickable
                    className={cl("share-avatar-control-btn")}
                    onClick={() => void saveShare(undefined)}
                >
                    Remove
                </Clickable>
            </div>
        </>
    );
}

export default definePlugin({
    name: "WhosWatching",
    enabledByDefault: true,
    description: "Hover over the screenshare icon to view what users are watching your stream",
    tags: ["Activity"],
    authors: [Devs.Ryder, Devs.thororen],
    settings,
    start() {
        void loadShare();
    },
    patches: [
        {
            find: ".Masks.STATUS_SCREENSHARE,width:32",
            replacement: {
                match: /\((\i\.\i)(?=,{mask:\i\.\i\.Masks\.STATUS_SCREENSHARE)/,
                replace: "($self.component({OriginalComponent:$1})"
            }
        },
        {
            find: ",setIsForceShowSharingPopout:",
            replacement: {
                match: /"div"(?=.{0,50}stream:\i,canGoLive:\i)/,
                replace: "$self.WrapperComponent"
            }
        }
    ],
    WrapperComponent: ErrorBoundary.wrap(props => {
        const stream = useStateFromStores([ApplicationStreamingStore], () => ApplicationStreamingStore.getCurrentUserActiveStream());
        if (!stream) return <div {...props}>{props.children}</div>;

        let missingUsers = 0;
        const userIds: string[] = ApplicationStreamingStore.getViewerIds(stream);
        const users = userIds.map(id => UserStore.getUser(id)).filter(user => Boolean(user) ? true : (missingUsers += 1, false));

        function renderMoreUsers(_label: string, count: number) {
            const sliced = users.slice(count - 1);
            return (
                <Tooltip text={<Watching userIds={userIds} guildId={stream.guildId} />}>
                    {({ onMouseEnter, onMouseLeave }) => (
                        <div
                            className={AvatarStyles.moreUsers}
                            onMouseEnter={onMouseEnter}
                            onMouseLeave={onMouseLeave}
                        >
                            +{sliced.length + missingUsers}
                        </div>
                    )}
                </Tooltip>
            );
        }

        return (
            <div className={cl("screenshare-panel")}>
                <div {...props}>{props.children}</div>
                <div className={classes(cl("spectating-panel"), Margins.top8)}>
                    <HeadingSecondary className={cl("spectating-header")}>
                        {getIntlMessage("SPECTATORS", { numViewers: userIds.length })}
                    </HeadingSecondary>
                    {/* the picture (or the "+" to add one) is shown whether or not someone is watching */}
                    <ShareAvatarSlot />
                    {users.length > 0 &&
                        <div className={cl("spectating-users")}>
                            <UserSummaryItem
                                users={users}
                                count={userIds.length}
                                renderIcon={false}
                                max={12}
                                showDefaultAvatarsForNullUsers
                                renderMoreUsers={renderMoreUsers}
                                renderUser={(user: User, index: number) => (
                                    <Clickable
                                        key={index}
                                        className={AvatarStyles.clickableAvatar}
                                        onClick={() => openUserProfile(user.id)}
                                    >
                                        <img
                                            className={AvatarStyles.avatar}
                                            src={user.getAvatarURL(void 0, 80, true)}
                                            alt={user.username}
                                            title={user.username}
                                        />
                                    </Clickable>
                                )}
                            />
                        </div>
                    }
                </div>
            </div>
        );
    }),
    component: function ({ OriginalComponent }) {
        return ErrorBoundary.wrap(props => {
            const stream = useStateFromStores([ApplicationStreamingStore], () => ApplicationStreamingStore.getCurrentUserActiveStream());
            if (!stream) return null;

            const viewers = ApplicationStreamingStore.getViewerIds(stream);
            return <Tooltip text={<Watching userIds={viewers} guildId={stream.guildId} />}>
                {({ onMouseEnter, onMouseLeave }) => (
                    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
                        <OriginalComponent {...props} />
                    </div>
                )}
            </Tooltip>;
        });
    }
});
