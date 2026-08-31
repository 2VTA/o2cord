/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Shows "Playing X" on your profile without X actually running - either
 * inside or outside o2cord. Native game detection (RunningGameStore, the
 * store behind Settings > Registered Games) was tried first and confirmed
 * live NOT to broadcast anything by itself (faking its getters didn't push
 * any activity into PresenceStore) - there's a separate internal pipeline
 * that turns a real detection into an actual presence update, and it isn't
 * triggered by RunningGameStore state alone.
 *
 * What actually broadcasts a visible "Playing X" (proven by the existing
 * CustomRPC plugin) is a plain FluxDispatcher.dispatch({type:
 * "LOCAL_ACTIVITY_UPDATE", activity, socketId}) call - same mechanism used
 * here, just pre-filled with a real game's own application_id/name (pulled
 * from RunningGameStore.getGamesSeen(), Ryder's own real "Added Games"
 * list) instead of a manually configured custom activity. Using the game's
 * real Discord application_id also means its real icon shows up, same as
 * an actual detected session would look.
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ActivityType } from "@vencord/discord-types/enums";
import { findStoreLazy } from "@webpack";
import { Clickable, FluxDispatcher, Popout, useRef, useState, useStateFromStores } from "@webpack/common";

interface SeenGame {
    id: string;
    name: string;
}

const RunningGameStore = findStoreLazy("RunningGameStore");
const SOCKET_ID = "o2cord-FakePlaying";

const settings = definePluginSettings({
    selectedGameId: {
        type: OptionType.STRING,
        description: "Currently faked game's application id",
        default: "",
        hidden: true
    },
    selectedGameName: {
        type: OptionType.STRING,
        description: "Currently faked game's display name",
        default: "",
        hidden: true
    }
});

function applyActivity() {
    const { selectedGameId, selectedGameName } = settings.store;

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: selectedGameId ? {
            application_id: selectedGameId,
            name: selectedGameName,
            type: ActivityType.PLAYING,
            flags: 1 << 0
        } : null,
        socketId: SOCKET_ID
    });
}

function playGame(game: SeenGame) {
    settings.store.selectedGameId = game.id;
    settings.store.selectedGameName = game.name;
    applyActivity();
}

function stopPlaying() {
    settings.store.selectedGameId = "";
    settings.store.selectedGameName = "";
    applyActivity();
}

function FakePlayingIcon(props: { width?: number; height?: number; color?: string; }) {
    return (
        <svg width={props.width ?? 18} height={props.height ?? 18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                stroke={props.color ?? "currentColor"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 9h3m-1.5-1.5v3M15.5 10h.01M17.5 12h.01M6 6h12a3 3 0 0 1 3 3.2l-.6 6A3 3 0 0 1 17.42 18a3 3 0 0 1-2.3-1.08L14 15.5a2 2 0 0 0-1.54-.72h-.92c-.58 0-1.14.26-1.54.72l-1.12 1.42A3 3 0 0 1 6.58 18a3 3 0 0 1-2.98-2.8l-.6-6A3 3 0 0 1 6 6Z"
            />
        </svg>
    );
}

function FakePlayingPopout({ onClose, onChange }: { onClose: () => void; onChange: () => void; }) {
    const seenGames: SeenGame[] = useStateFromStores([RunningGameStore], () =>
        RunningGameStore.isGamesSeenLoaded() ? RunningGameStore.getGamesSeen() : []
    );
    const [, forceUpdate] = useState(0);
    const currentId = settings.store.selectedGameId;

    function handlePlay(game: SeenGame) {
        playGame(game);
        forceUpdate(n => n + 1);
        onChange();
    }

    function handleStop() {
        stopPlaying();
        forceUpdate(n => n + 1);
        onChange();
    }

    return (
        <div className="o2-fake-playing-popout">
            <div className="o2-fake-playing-titlebar">
                <div className="o2-fake-playing-header">Fake Playing</div>
                <Clickable className="o2-fake-playing-close" onClick={onClose}>×</Clickable>
            </div>

            <div className="o2-fake-playing-explainer">
                Shows "Playing X" on your profile using a real registered game's own id/icon - nothing is actually launched.
            </div>

            {seenGames.length === 0 && (
                <div className="o2-fake-playing-empty">
                    No registered games found yet. Add one from Discord's own Settings &gt; Registered Games first.
                </div>
            )}

            {seenGames.map(game => (
                <div key={game.id} className="o2-fake-playing-row">
                    <span className="o2-fake-playing-name">{game.name}</span>
                    {currentId === game.id ? (
                        <Clickable className="o2-fake-playing-btn o2-fake-playing-btn-stop" onClick={handleStop}>
                            Stop
                        </Clickable>
                    ) : (
                        <Clickable className="o2-fake-playing-btn" onClick={() => handlePlay(game)}>
                            Play
                        </Clickable>
                    )}
                </div>
            ))}
        </div>
    );
}

function FakePlayingHeaderButton() {
    const [isOpen, setIsOpen] = useState(false);
    const [, forceUpdate] = useState(0);
    const popoutRef = useRef<HTMLDivElement>(null);
    const isActive = Boolean(settings.store.selectedGameId);

    return (
        <Popout
            targetElementRef={popoutRef}
            renderPopout={() => <FakePlayingPopout onClose={() => setIsOpen(false)} onChange={() => forceUpdate(n => n + 1)} />}
            shouldShow={isOpen}
            onRequestClose={() => setIsOpen(false)}
            position="bottom"
            align="right"
            spacing={8}
        >
            {() => (
                <div ref={popoutRef as any} style={{ display: "flex" }}>
                    <HeaderBarButton
                        icon={FakePlayingIcon}
                        tooltip={isActive ? `Playing ${settings.store.selectedGameName}` : "Fake Playing"}
                        onClick={() => setIsOpen(v => !v)}
                        selected={isOpen || isActive}
                    />
                </div>
            )}
        </Popout>
    );
}

export default definePlugin({
    name: "FakePlaying",
    description: "Shows \"Playing X\" on your profile using one of your registered games - nothing actually runs.",
    tags: ["Activity", "Customisation"],
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: false,
    settings,
    start() {
        addHeaderBarButton("o2cord-fake-playing", () => <FakePlayingHeaderButton />, 900);
        if (settings.store.selectedGameId) applyActivity();
    },
    stop() {
        removeHeaderBarButton("o2cord-fake-playing");
        FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: null, socketId: SOCKET_ID });
    }
});
