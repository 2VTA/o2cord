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
import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { findStoreLazy } from "@webpack";
import { FluxDispatcher, Forms, Modal, openModal, RestAPI, Text, TextInput, useEffect, useState, useStateFromStores } from "@webpack/common";

interface SeenGame {
    id: string;
    name: string;
    lastLaunched?: number;
}

const RunningGameStore = findStoreLazy("RunningGameStore");
const ApplicationStore = findStoreLazy("ApplicationStore");

// Game icon hashes, kept for the session. ApplicationStore only has icons for
// games Discord has already loaded (CS2/Overwatch had one, TF2 didn't -
// checked live); the rest come from /applications/<id>/rpc, the same public
// app info Discord itself fetches to show a game's icon on an activity.
const iconCache = new Map<string, string | null>();

async function loadIcons(ids: string[], onLoaded: () => void) {
    const todo = ids.filter(id => !iconCache.has(id));
    for (let i = 0; i < todo.length; i += 4) {
        await Promise.all(todo.slice(i, i + 4).map(async id => {
            let icon: string | null = ApplicationStore.getApplication(id)?.icon ?? null;
            if (!icon) {
                icon = await RestAPI.get({ url: `/applications/${id}/rpc` })
                    .then(res => res.body?.icon ?? null)
                    .catch(() => null);
            }
            iconCache.set(id, icon);
        }));
        onLoaded();
    }
}

function getIconUrl(id?: string) {
    const hash = id && iconCache.get(id);
    return hash ? `https://cdn.discordapp.com/app-icons/${id}/${hash}.png?size=64` : null;
}

function timeAgo(ms?: number) {
    if (!ms) return null;
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days < 1) return "Last played today";
    if (days === 1) return "Last played yesterday";
    if (days < 30) return `Last played ${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `Last played ${months} month${months === 1 ? "" : "s"} ago`;
    return "Last played over a year ago";
}

function GameIcon({ id, name, size }: { id?: string; name: string; size: number; }) {
    const url = getIconUrl(id);
    return url
        ? <img className="o2-fake-playing-icon" src={url} alt="" width={size} height={size} />
        : (
            <div className="o2-fake-playing-icon o2-fake-playing-icon-letter" style={{ width: size, height: size, fontSize: size * 0.42 }}>
                {name.trim().charAt(0).toUpperCase() || "?"}
            </div>
        );
}
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
    },
    savedGames: {
        type: OptionType.STRING,
        description: "Games added by application id (JSON list of {id, name})",
        default: "[]",
        hidden: true
    }
});

// Games added by typing an application id - kept so they can be played again with
// one click. Only {id, name} is stored; the icon is fetched like for any game.
const MAX_SAVED = 30;

function getSavedGames(): SeenGame[] {
    try {
        const list = JSON.parse(settings.store.savedGames);
        return Array.isArray(list) ? list.filter(g => /^\d{17,20}$/.test(g?.id) && typeof g?.name === "string") : [];
    } catch {
        return [];
    }
}

function saveGame(game: SeenGame) {
    const rest = getSavedGames().filter(g => g.id !== game.id);
    settings.store.savedGames = JSON.stringify([{ id: game.id, name: game.name }, ...rest].slice(0, MAX_SAVED));
}

function forgetGame(id: string) {
    settings.store.savedGames = JSON.stringify(getSavedGames().filter(g => g.id !== id));
}

// A game's real name and icon from its application id: the same public app info
// Discord itself reads to draw an activity (works for any game, not just ones
// this PC has launched). Resolves null if the id isn't a known application.
async function lookupGame(id: string): Promise<SeenGame | null> {
    if (!/^\d{17,20}$/.test(id)) return null;
    try {
        const { body } = await RestAPI.get({ url: `/applications/${id}/rpc` });
        if (!body?.name) return null;
        iconCache.set(id, body.icon ?? null);
        return { id, name: String(body.name) };
    } catch {
        return null;
    }
}

function applyActivity() {
    const { selectedGameId, selectedGameName } = settings.store;

    // A typed custom name has no real application_id - "0" is the same
    // placeholder CustomRPC already uses for that case, and Discord still
    // broadcasts and shows the activity fine without a real game icon.
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: selectedGameName ? {
            application_id: selectedGameId || "0",
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

function playCustomName(name: string) {
    settings.store.selectedGameId = "";
    settings.store.selectedGameName = name;
    applyActivity();
}

function stopPlaying() {
    settings.store.selectedGameId = "";
    settings.store.selectedGameName = "";
    applyActivity();
}

// The header button lives outside the modal, so it's told directly when the
// activity changes instead of only on its own clicks.
const changeListeners = new Set<() => void>();
function notifyChange() {
    changeListeners.forEach(fn => fn());
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

function useActivityState() {
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const fn = () => forceUpdate(n => n + 1);
        changeListeners.add(fn);
        return () => void changeListeners.delete(fn);
    }, []);
    return { currentId: settings.store.selectedGameId, currentName: settings.store.selectedGameName };
}

// Laid out like PluginModal (the plugin settings window): title + short
// description at the top, then headed sections - Ryder asked for FakePlaying
// "على نظام PluginModal" instead of the small header-bar popout.
function FakePlayingModal({ transitionState, onClose }: RenderModalProps) {
    const seenGames: SeenGame[] = useStateFromStores([RunningGameStore], () =>
        RunningGameStore.isGamesSeenLoaded() ? RunningGameStore.getGamesSeen() : []
    );
    const { currentId, currentName } = useActivityState();
    const [customName, setCustomName] = useState("");
    const [gameId, setGameId] = useState("");
    const [lookingUp, setLookingUp] = useState(false);
    const [idError, setIdError] = useState("");
    const [savedGames, setSavedGames] = useState<SeenGame[]>(getSavedGames);
    const [, setIconsLoaded] = useState(0);

    useEffect(() => {
        let alive = true;
        loadIcons([...seenGames, ...savedGames].map(g => g.id), () => alive && setIconsLoaded(n => n + 1));
        return () => void (alive = false);
    }, [seenGames.length, savedGames.length]);

    // Looks the id up, shows the real name/icon on the profile and remembers it.
    async function handlePlayId() {
        const id = gameId.trim();
        if (!id || lookingUp) return;
        setIdError("");
        if (!/^\d{17,20}$/.test(id)) {
            setIdError("That doesn't look like an application ID (17-20 digits).");
            return;
        }
        setLookingUp(true);
        const game = await lookupGame(id);
        setLookingUp(false);
        if (!game) {
            setIdError("Discord doesn't know a game with that ID.");
            return;
        }
        saveGame(game);
        setSavedGames(getSavedGames());
        playGame(game);
        notifyChange();
        setGameId("");
    }

    function handleForget(id: string) {
        forgetGame(id);
        setSavedGames(getSavedGames());
    }

    function handlePlayCustom() {
        const name = customName.trim();
        if (!name) return;
        playCustomName(name);
        setCustomName("");
        notifyChange();
    }

    function handlePlay(game: SeenGame) {
        playGame(game);
        notifyChange();
    }

    function handleStop() {
        stopPlaying();
        notifyChange();
    }

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="md"
            title={<BaseText tag="h1" weight="semibold" size="lg">Fake Playing</BaseText>}
            subtitle={<Forms.FormText>Shows "Playing X" on your profile. Nothing is actually launched.</Forms.FormText>}
        >
            <div className="o2-fake-playing-content">
                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top8, Margins.bottom8)}>Now Playing</Text>
                    {currentName ? (
                        <div className="o2-fake-playing-now">
                            <GameIcon id={currentId || undefined} name={currentName} size={48} />
                            <div className="o2-fake-playing-meta">
                                <span className="o2-fake-playing-label">Playing</span>
                                <span className="o2-fake-playing-name o2-fake-playing-name-lg">{currentName}</span>
                            </div>
                            <Button variant="dangerPrimary" size="small" onClick={handleStop}>Stop</Button>
                        </div>
                    ) : (
                        <Forms.FormText>Nothing right now. Type a name below or pick one of your games.</Forms.FormText>
                    )}
                </section>

                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Custom Name</Text>
                    <Forms.FormText className={Margins.bottom8}>Anything you type shows as the game name.</Forms.FormText>
                    <div className="o2-fake-playing-custom-row">
                        <TextInput
                            className="o2-fake-playing-custom-input"
                            value={customName}
                            onChange={setCustomName}
                            placeholder="Type anything..."
                            onKeyDown={(e: { key: string; }) => {
                                if (e.key === "Enter") handlePlayCustom();
                            }}
                        />
                        <Button variant="positive" size="small" disabled={!customName.trim()} onClick={handlePlayCustom}>Play</Button>
                    </div>
                </section>

                <section>
                    <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Game ID</Text>
                    <Forms.FormText className={Margins.bottom8}>
                        Paste a game's application ID to show the real game with its icon. Developer Mode, then right-click the game on a profile and Copy ID, or find it on the game's page in the Discord Developer Portal.
                    </Forms.FormText>
                    <div className="o2-fake-playing-custom-row">
                        <TextInput
                            className="o2-fake-playing-custom-input"
                            value={gameId}
                            onChange={(v: string) => { setGameId(v.replace(/\D/g, "").slice(0, 20)); setIdError(""); }}
                            placeholder="e.g. 542075586886107149"
                            onKeyDown={(e: { key: string; }) => {
                                if (e.key === "Enter") handlePlayId();
                            }}
                        />
                        <Button variant="positive" size="small" disabled={!gameId.trim() || lookingUp} onClick={handlePlayId}>
                            {lookingUp ? "Looking up..." : "Play"}
                        </Button>
                    </div>
                    {idError && <div className="o2-fake-playing-error">{idError}</div>}

                    {savedGames.length > 0 && (
                        <div className={classes("o2-fake-playing-list", Margins.top8)}>
                            {savedGames.map(game => (
                                <div key={game.id} className={classes("o2-fake-playing-row", currentId === game.id && "o2-fake-playing-row-active")}>
                                    <GameIcon id={game.id} name={game.name} size={36} />
                                    <div className="o2-fake-playing-meta">
                                        <span className="o2-fake-playing-name">{game.name}</span>
                                        <span className="o2-fake-playing-sub">{game.id}</span>
                                    </div>
                                    {currentId === game.id ? (
                                        <Button variant="dangerPrimary" size="small" onClick={handleStop}>Stop</Button>
                                    ) : (
                                        <Button variant="positive" size="small" onClick={() => handlePlay(game)}>Play</Button>
                                    )}
                                    <button className="o2-fake-playing-forget" title="Remove from this list" onClick={() => handleForget(game.id)}>×</button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {seenGames.length > 0 && (
                    <section>
                        <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Registered Games</Text>
                        <Forms.FormText className={Margins.bottom8}>Uses the game's real icon, same as when it's actually running.</Forms.FormText>
                        <div className="o2-fake-playing-list">
                            {[...seenGames].sort((a, b) => (b.lastLaunched ?? 0) - (a.lastLaunched ?? 0)).map(game => (
                                <div key={game.id} className={classes("o2-fake-playing-row", currentId === game.id && "o2-fake-playing-row-active")}>
                                    <GameIcon id={game.id} name={game.name} size={36} />
                                    <div className="o2-fake-playing-meta">
                                        <span className="o2-fake-playing-name">{game.name}</span>
                                        {timeAgo(game.lastLaunched) && <span className="o2-fake-playing-sub">{timeAgo(game.lastLaunched)}</span>}
                                    </div>
                                    {currentId === game.id ? (
                                        <Button variant="dangerPrimary" size="small" onClick={handleStop}>Stop</Button>
                                    ) : (
                                        <Button variant="positive" size="small" onClick={() => handlePlay(game)}>Play</Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </Modal>
    );
}

function openFakePlayingModal() {
    openModal(props => <FakePlayingModal {...props} />);
}

function FakePlayingHeaderButton() {
    const { currentName } = useActivityState();

    return (
        <HeaderBarButton
            icon={FakePlayingIcon}
            tooltip={currentName ? `Playing ${currentName}` : "Fake Playing"}
            onClick={openFakePlayingModal}
            selected={Boolean(currentName)}
        />
    );
}

export default definePlugin({
    name: "FakePlaying",
    description: "Shows \"Playing X\" on your profile - type anything, or pick a registered game. Nothing actually runs.",
    tags: ["Activity", "Customisation"],
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: false,
    settings,
    start() {
        addHeaderBarButton("o2cord-fake-playing", () => <FakePlayingHeaderButton />, 900);
        if (settings.store.selectedGameName) applyActivity();
    },
    stop() {
        removeHeaderBarButton("o2cord-fake-playing");
        FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: null, socketId: SOCKET_ID });
    }
});
