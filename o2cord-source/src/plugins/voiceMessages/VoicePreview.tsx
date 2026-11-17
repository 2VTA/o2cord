/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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

import { useTimer } from "@utils/react";
import { useEffect, useRef, useState } from "@webpack/common";

import { cl, isVoiceMessageReady, VoiceMessage } from ".";

export type VoicePreviewOptions = {
    src?: string;
    waveform: string;
    recording?: boolean;
};

/** The preview player of our own: play/pause, the waveform with the played part lit, and the time. */
function OwnPlayer({ src, waveform }: { src: string; waveform: string; }) {
    const audio = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);

    let bars: number[] = [];
    try { bars = [...atob(waveform)].map(c => c.charCodeAt(0)); } catch { /* an unreadable waveform just shows a flat line */ }
    if (!bars.length) bars = new Array(32).fill(24);

    useEffect(() => () => audio.current?.pause(), []);

    const clock = (sec: number) => Math.floor(sec / 60) + ":" + Math.floor(sec % 60).toString().padStart(2, "0");
    const progress = duration > 0 ? time / duration : 0;

    return (
        <div className={cl("player")}>
            <button
                type="button"
                className={cl("player-button")}
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => {
                    const a = audio.current;
                    if (!a) return;
                    if (a.paused) void a.play(); else a.pause();
                }}
            >
                {playing ? "❚❚" : "▶"}
            </button>
            <div
                className={cl("player-wave")}
                onClick={e => {
                    const a = audio.current;
                    if (!a || !duration) return;
                    const box = e.currentTarget.getBoundingClientRect();
                    a.currentTime = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * duration;
                }}
            >
                {bars.map((v, i) => (
                    <i key={i} className={i / bars.length < progress ? cl("bar-on") : undefined} style={{ height: Math.max(8, Math.round((v / 255) * 100)) + "%" }} />
                ))}
            </div>
            <span className={cl("player-time")}>{clock(playing || time > 0 ? time : duration)}</span>
            <audio
                ref={audio}
                src={src}
                preload="metadata"
                onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
                onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setTime(0); }}
            />
        </div>
    );
}

export const VoicePreview = ({
    src,
    waveform,
    recording,
}: VoicePreviewOptions) => {
    const durationMs = useTimer({
        deps: [recording]
    });

    const durationSeconds = recording ? Math.floor(durationMs / 1000) : 0;
    const durationDisplay = Math.floor(durationSeconds / 60) + ":" + (durationSeconds % 60).toString().padStart(2, "0");

    if (src && !recording)
        return isVoiceMessageReady()
            ? <VoiceMessage key={src} src={src} waveform={waveform} />
            : <OwnPlayer key={src} src={src} waveform={waveform} />;

    return (
        <div className={cl("preview", recording ? "preview-recording" : [])}>
            <div className={cl("preview-indicator")} />
            <div className={cl("preview-time")}>{durationDisplay}</div>
            <div className={cl("preview-label")}>{recording ? "RECORDING" : "----"}</div>
        </div>
    );
};
