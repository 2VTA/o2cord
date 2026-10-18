/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * "Edit Image" - the same shape as Discord's own avatar cropper: the picture in
 * a circle, drag to move it, slider to zoom, Reset / Cancel / Apply. Apply gives
 * back a 512 x 512 PNG of what is inside the circle.
 */

import { Button } from "@components/Button";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, useEffect, useRef, useState } from "@webpack/common";

const VIEW = 300; // circle size on screen
const OUT = 512; // exported size

function CropModal({ src, onApply, transitionState, onClose }: RenderModalProps & { src: string; onApply(png: Blob): void; }) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [zoom, setZoom] = useState(1);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const drag = useRef<{ x: number; y: number; px: number; py: number; } | null>(null);

    useEffect(() => {
        const i = new Image();
        i.onload = () => setImg(i);
        i.src = src;
    }, [src]);

    // base scale: the picture covers the circle at zoom 1
    const base = img ? Math.max(VIEW / img.width, VIEW / img.height) : 1;
    const scale = base * zoom;
    const w = img ? img.width * scale : 0, h = img ? img.height * scale : 0;
    // keep the circle covered
    const clamp = (p: { x: number; y: number; }) => ({
        x: Math.min((w - VIEW) / 2, Math.max(-(w - VIEW) / 2, p.x)),
        y: Math.min((h - VIEW) / 2, Math.max(-(h - VIEW) / 2, p.y))
    });
    const at = clamp(pos);

    function apply() {
        if (!img) return;
        const c = document.createElement("canvas");
        c.width = c.height = OUT;
        const ctx = c.getContext("2d")!;
        const k = OUT / VIEW;
        ctx.drawImage(img, (VIEW / 2 - w / 2 + at.x) * k, (VIEW / 2 - h / 2 + at.y) * k, w * k, h * k);
        c.toBlob(b => { if (b) { onApply(b); onClose(); } }, "image/png");
    }

    return (
        <Modal transitionState={transitionState} onClose={onClose} size="sm" title="Edit Image">
            <div className="o2-ar-crop">
                <div
                    className="o2-ar-stage"
                    onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: at.x, py: at.y }; }}
                    onPointerMove={e => { const d = drag.current; if (d) setPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }); }}
                    onPointerUp={() => { drag.current = null; }}
                >
                    {img && <img src={src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${at.x}px, ${at.y}px)` }} />}
                    <div className="o2-ar-ring" />
                </div>
                <div className="o2-ar-zoom">
                    <span>-</span>
                    <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} />
                    <span>+</span>
                </div>
                <div className="o2-ar-actions">
                    <button className="o2-ar-reset" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }}>Reset</button>
                    <span style={{ flex: 1 }} />
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" disabled={!img} onClick={apply}>Apply</Button>
                </div>
            </div>
        </Modal>
    );
}

export function openCropModal(src: string, onApply: (png: Blob) => void) {
    openModal(props => <CropModal {...props} src={src} onApply={onApply} />);
}
