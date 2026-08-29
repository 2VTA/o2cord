/*
 * o2cord's voice panel behavior - always on, not a toggleable plugin.
 * Right-click the screen-share button in the voice-panel call-controls
 * row (camera / screen-share / reactions / soundboard) to instantly stop
 * sharing, in one click - instead of Discord's own native right-click
 * menu (Stop Streaming / Change Stream / Stream Quality / ...), which is
 * intercepted (preventDefault + stopPropagation on the contextmenu event)
 * so it never opens. The button has no stable aria-label to hang a
 * selector on, so it's identified by position (2nd button in that row)
 * instead - verified live against the current build. streamKey format is
 * "streamType:guildId:channelId:ownerId" - confirmed live by round-
 * tripping it through ApplicationStreamingStore.getActiveStreamForStreamKey,
 * which only resolved once the streamType prefix was included (an earlier
 * version without it silently no-opped: the STREAM_STOP action dispatched
 * fine but never matched a real stream).
 */

import { findByCodeLazy, findStoreLazy } from "@webpack";
import { UserStore } from "@webpack/common";

const stopStream = findByCodeLazy('type:"STREAM_STOP"');
const ApplicationStreamingStore = findStoreLazy("ApplicationStreamingStore");

function getStreamKey() {
    const stream = ApplicationStreamingStore.getCurrentUserActiveStream();
    if (!stream || stream.ownerId !== UserStore.getCurrentUser().id) return null;
    return `${stream.streamType}:${stream.guildId ?? "call"}:${stream.channelId}:${stream.ownerId}`;
}

function getScreenShareButton(target: HTMLElement) {
    const actionButtons = target.closest('[class*="actionButtons_"]');
    if (!actionButtons) return null;

    const button = actionButtons.querySelectorAll("button")[1];
    if (!button || !button.contains(target)) return null;

    return button;
}

function onContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!getScreenShareButton(target)) return;

    const streamKey = getStreamKey();
    if (!streamKey) return;

    e.preventDefault();
    e.stopPropagation();
    stopStream(streamKey);
}

export function initVoicePanel() {
    document.addEventListener("contextmenu", onContextMenu, true);
}
