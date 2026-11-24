/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// How a profile-theme picture sits inside the card: zoom + where it is moved to, and the little editor to set it.
// Same idea as Discord's own banner / avatar editors (drag the picture, zoom with a slider), made for the profile card.
import "./frame.css";

import { Button } from "@components/Button";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, React, Slider, Text } from "@webpack/common";

// z: 1 = the picture exactly covers the card (how it always looked), up to 4 = zoomed in
// x / y: 0-100, the same as CSS background-position (0 = left / top edge of the picture, 50 = centred, 100 = right / bottom)
export type ThemeFrame = { z: number; x: number; y: number; };

export const FRAME_MIN_Z = 1;
export const FRAME_MAX_Z = 4;
// the card the editor draws: a profile popout is about 300 wide and 600-700 tall (it depends on how many rows the profile has)
export const FRAME_CARD_W = 300;
export const FRAME_CARD_H = 640;
const CARD_W = FRAME_CARD_W;
const CARD_H = FRAME_CARD_H;

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function cleanFrame(raw: unknown): ThemeFrame | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const { z, x, y } = raw as Record<string, unknown>;
    if (typeof z !== "number" || typeof x !== "number" || typeof y !== "number") return null;
    if (![z, x, y].every(Number.isFinite)) return null;
    const frame = { z: round(clamp(z, FRAME_MIN_Z, FRAME_MAX_Z)), x: round(clamp(x, 0, 100)), y: round(clamp(y, 0, 100)) };
    // the untouched look is "no frame", so nothing extra has to be stored or published
    return frame.z === 1 && frame.x === 50 && frame.y === 50 ? null : frame;
}

export function parseFrame(json: string | undefined | null): ThemeFrame | null {
    if (!json) return null;
    try { return cleanFrame(JSON.parse(json)); } catch { return null; }
}

export const frameToJson = (frame: ThemeFrame | null) => frame ? JSON.stringify(frame) : "";

// CSS for a card of width W x height H holding a picture of iw x ih. Percentages of the card width keep it right when the
// card is resized (popout -> big profile window) without redoing anything.
export function frameCss(frame: ThemeFrame, W: number, H: number, iw: number, ih: number) {
    const coverWidth = Math.max(W, H * iw / ih);
    return {
        size: `${round(coverWidth * frame.z / W * 100)}% auto`,
        position: `${frame.x}% ${frame.y}%`
    };
}

// ---- picture sizes (needed to know how big "cover" is)
const dimsCache = new Map<string, { w: number; h: number; }>();
const dimsLoading = new Set<string>();

export function getImageDims(url: string, onLoad?: () => void) {
    const known = dimsCache.get(url);
    if (known) return known;
    if (!dimsLoading.has(url)) {
        dimsLoading.add(url);
        const image = new Image();
        image.onload = () => {
            dimsLoading.delete(url);
            if (image.naturalWidth && image.naturalHeight) dimsCache.set(url, { w: image.naturalWidth, h: image.naturalHeight });
            onLoad?.();
        };
        image.onerror = () => { dimsLoading.delete(url); };
        image.src = url;
    }
    return null;
}

const cssUrl = (value: string) => `url("${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/[\n\r\f]/g, "")}")`;

type EditorProps = RenderModalProps & {
    title: string;
    imageUrl: string;
    frame: ThemeFrame | null;
    brightness: number;
    onSave(frame: ThemeFrame | null): void;
};

function FrameEditor({ transitionState, onClose, title, imageUrl, frame, brightness, onSave }: EditorProps) {
    const [z, setZ] = React.useState(frame?.z ?? 1);
    const [x, setX] = React.useState(frame?.x ?? 50);
    const [y, setY] = React.useState(frame?.y ?? 50);
    const [guides, setGuides] = React.useState(true);
    // the slider keeps its own value while it is dragged; this remounts it when the zoom changed some other way (wheel, reset)
    const [sliderKey, setSliderKey] = React.useState(0);
    const [dims, setDims] = React.useState(() => getImageDims(imageUrl, () => setDims(getImageDims(imageUrl))));
    const drag = React.useRef<{ px: number; py: number; x: number; y: number; } | null>(null);

    // how far the picture can move in each direction at this zoom (px in the editor's card)
    const slack = React.useMemo(() => {
        if (!dims) return { x: 0, y: 0 };
        const coverWidth = Math.max(CARD_W, CARD_H * dims.w / dims.h);
        const w = coverWidth * z;
        return { x: Math.max(0, w - CARD_W), y: Math.max(0, w * dims.h / dims.w - CARD_H) };
    }, [dims, z]);

    const css = dims ? frameCss({ z, x, y }, CARD_W, CARD_H, dims.w, dims.h) : { size: "cover", position: "center" };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        drag.current = { px: e.clientX, py: e.clientY, x, y };
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d) return;
        // dragging the picture right moves it right: its left edge goes up, so the position % goes down
        if (slack.x > 0.5) setX(round(clamp(d.x - (e.clientX - d.px) / slack.x * 100, 0, 100)));
        if (slack.y > 0.5) setY(round(clamp(d.y - (e.clientY - d.py) / slack.y * 100, 0, 100)));
    };
    const onPointerUp = () => { drag.current = null; };
    const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        setZ(v => round(clamp(v - e.deltaY * 0.002, FRAME_MIN_Z, FRAME_MAX_Z)));
        setSliderKey(k => k + 1);
    };

    const reset = () => { setZ(1); setX(50); setY(50); setSliderKey(k => k + 1); };

    return (
        <Modal transitionState={transitionState} onClose={onClose} size="md" title={title} subtitle="Drag the picture to move it, use the slider or the mouse wheel to zoom.">
            <div className="o2pt-frame">
                <div
                    className="o2pt-frame-card"
                    style={{ width: CARD_W, height: CARD_H }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onWheel={onWheel}
                >
                    <div
                        className="o2pt-frame-picture"
                        style={{ backgroundImage: cssUrl(imageUrl), backgroundSize: css.size, backgroundPosition: css.position, opacity: brightness }}
                    />
                    <div className="o2pt-frame-scrim" />
                    {guides && (
                        <div className="o2pt-frame-guides">
                            <div className="o2pt-frame-avatar" />
                            <div className="o2pt-frame-line o2pt-frame-line-name" />
                            <div className="o2pt-frame-line o2pt-frame-line-sub" />
                            <div className="o2pt-frame-panel o2pt-frame-panel-1" />
                            <div className="o2pt-frame-panel o2pt-frame-panel-2" />
                        </div>
                    )}
                    {!dims && <div className="o2pt-frame-loading">Loading…</div>}
                </div>

                <div className="o2pt-frame-side">
                <Text variant="text-sm/semibold" className="o2pt-frame-label">Zoom: {Math.round(z * 100)}%</Text>
                <Slider
                    initialValue={z}
                    minValue={FRAME_MIN_Z}
                    maxValue={FRAME_MAX_Z}
                    markers={[1, 1.5, 2, 2.5, 3, 3.5, 4]}
                    stickToMarkers={false}
                    onValueChange={v => setZ(round(clamp(v, FRAME_MIN_Z, FRAME_MAX_Z)))}
                    onValueRender={v => `${Math.round(v * 100)}%`}
                    key={sliderKey}
                />

                <div className="o2pt-frame-actions">
                    <Button variant="secondary" size="small" onClick={reset}>Reset</Button>
                    <Button variant="secondary" size="small" onClick={() => setGuides(g => !g)}>{guides ? "Hide guides" : "Show guides"}</Button>
                    <span className="o2pt-frame-spacer" />
                    <Button variant="secondary" size="small" onClick={onClose}>Cancel</Button>
                    <Button size="small" onClick={() => { onSave(cleanFrame({ z, x, y })); onClose(); }}>Save</Button>
                </div>
                <Text variant="text-xs/normal" className="o2pt-frame-hint">The dashed circle and boxes show where the avatar, name and Discord's panels sit on the real card.</Text>
                </div>
            </div>
        </Modal>
    );
}

export function openFrameEditor(props: Omit<EditorProps, keyof RenderModalProps>) {
    openModal(modalProps => <FrameEditor {...modalProps} {...props} />);
}

// The picture the way it will sit in the card, for places that only show it (the Callie window). The card keeps the
// editor's proportions, so the same zoom / position looks the same here.
export function FramePreview({ imageUrl, frame, height = 300, brightness = 0.6 }: { imageUrl: string; frame: ThemeFrame | null; height?: number; brightness?: number; }) {
    const [dims, setDims] = React.useState(() => getImageDims(imageUrl, () => setDims(getImageDims(imageUrl))));
    React.useEffect(() => { setDims(getImageDims(imageUrl, () => setDims(getImageDims(imageUrl)))); }, [imageUrl]);

    const css = dims ? frameCss(frame ?? { z: 1, x: 50, y: 50 }, FRAME_CARD_W, FRAME_CARD_H, dims.w, dims.h) : { size: "cover", position: "center" };
    return (
        <div className="o2pt-frame-mini" style={{ height, aspectRatio: `${FRAME_CARD_W} / ${FRAME_CARD_H}` }}>
            <div className="o2pt-frame-picture" style={{ backgroundImage: cssUrl(imageUrl), backgroundSize: css.size, backgroundPosition: css.position, opacity: brightness }} />
            <div className="o2pt-frame-scrim" />
        </div>
    );
}
