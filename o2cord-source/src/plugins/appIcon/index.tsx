/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AppIcon: change the picture on Discord's window and taskbar button. Pick any
 * picture from your device, choose its shape, and it stays across launches. The
 * window is the header-bar button; the work on the real window is in native.ts.
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Forms, Modal, openModal, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

type Shape = "square" | "rounded" | "circle";

const settings = definePluginSettings({}).withPrivateSettings<{ shape: Shape; }>();

const Native = () => VencordNative.pluginHelpers.AppIcon as Record<string, (...args: any[]) => Promise<any>> | undefined;

const SHAPES: [Shape, string][] = [["square", "Square"], ["rounded", "Rounded"], ["circle", "Circle"]];
const SOURCE_SIZE = 512;
const ICON_SIZE = 256;

const toB64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

async function loadBitmap(blob: Blob) {
    return createImageBitmap(blob);
}

// the picture, cut to a centred square
function toSquare(bmp: ImageBitmap): string {
    const c = document.createElement("canvas");
    c.width = c.height = SOURCE_SIZE;
    const side = Math.min(bmp.width, bmp.height);
    c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SOURCE_SIZE, SOURCE_SIZE);
    return c.toDataURL("image/png");
}

// the finished icon: the square picture with its shape applied
async function shaped(sourceDataUrl: string, shape: Shape): Promise<string> {
    const img = new Image();
    img.src = sourceDataUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = ICON_SIZE;
    const ctx = c.getContext("2d")!;
    ctx.beginPath();
    if (shape === "circle") ctx.arc(ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE / 2, 0, Math.PI * 2);
    else ctx.roundRect(0, 0, ICON_SIZE, ICON_SIZE, shape === "rounded" ? ICON_SIZE * 0.22 : 0);
    ctx.clip();
    ctx.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);
    return c.toDataURL("image/png");
}

function AppIconModal({ transitionState, onClose }: RenderModalProps) {
    const [source, setSource] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [shape, setShape] = useState<Shape>(settings.store.shape ?? "rounded");
    const [busy, setBusy] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    // what is applied now (kept from an earlier session)
    useEffect(() => {
        void Native()?.getSource().then((b64: string | null) => {
            if (b64) setSource(`data:image/png;base64,${b64}`);
        });
    }, []);

    useEffect(() => {
        if (!source) { setPreview(null); return; }
        let live = true;
        void shaped(source, shape).then(url => live && setPreview(url));
        return () => { live = false; };
    }, [source, shape]);

    async function apply(src: string, sh: Shape) {
        const native = Native();
        if (!native) {
            showToast("This needs the o2cord desktop app.", Toasts.Type.FAILURE);
            return;
        }
        setBusy(true);
        try {
            const ok = await native.saveIcon(toB64(src), toB64(await shaped(src, sh)));
            if (!ok) throw new Error("rejected");
            settings.store.shape = sh;
            showToast("App icon changed.", Toasts.Type.SUCCESS);
        } catch {
            showToast("Couldn't set that icon.", Toasts.Type.FAILURE);
        } finally {
            setBusy(false);
        }
    }

    async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            showToast("Pick a picture (PNG, JPG, WebP...).", Toasts.Type.FAILURE);
            return;
        }
        try {
            const src = toSquare(await loadBitmap(file));
            setSource(src);
            await apply(src, shape);
        } catch {
            showToast("Couldn't read that picture.", Toasts.Type.FAILURE);
        }
    }

    async function pickShape(sh: Shape) {
        setShape(sh);
        if (source) await apply(source, sh);
    }

    async function reset() {
        await Native()?.resetIcon();
        setSource(null);
        showToast("Back to Discord's own icon. Restart Discord to get the taskbar button back too.", Toasts.Type.SUCCESS);
    }

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="md"
            title={<BaseText tag="h1" weight="semibold" size="lg">App icon</BaseText>}
            subtitle={<Forms.FormText>The picture on Discord's window and taskbar button.</Forms.FormText>}
        >
            <div className="o2-ai">
                <div className="o2-ai-stage">
                    {preview
                        ? <img className="o2-ai-img" src={preview} alt="" />
                        : <div className="o2-ai-empty">Discord's own icon</div>}
                </div>

                <div className="o2-ai-seg" role="radiogroup">
                    {SHAPES.map(([value, label]) => (
                        <button
                            key={value}
                            role="radio"
                            aria-checked={shape === value}
                            className={classes("o2-ai-seg-btn", shape === value && "o2-ai-seg-on")}
                            disabled={busy}
                            onClick={() => void pickShape(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="o2-ai-actions">
                    <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPick} />
                    <Button variant="primary" disabled={busy} onClick={() => fileInput.current?.click()}>Choose a picture</Button>
                    <Button variant="dangerSecondary" disabled={busy || !source} onClick={() => void reset()}>Back to Discord's icon</Button>
                </div>

                <Forms.FormText>
                    The picture is cut to a square from its centre. Only this running window changes: the Discord shortcut and the tray icon keep their own.
                </Forms.FormText>
            </div>
        </Modal>
    );
}

function openAppIconModal() {
    openModal(props => <AppIconModal {...props} />);
}

function AppIconGlyph({ width = 20, height = 20, className }: { width?: number; height?: number; className?: string; }) {
    return (
        <svg aria-hidden="true" role="img" width={width} height={height} className={className} viewBox="0 0 24 24">
            <path
                fill="currentColor"
                d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm3.5 4.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM5 18l4.2-5.3 2.8 3.4 2-2.4L19 18H5Z"
            />
        </svg>
    );
}

export default definePlugin({
    name: "AppIcon",
    description: "Change the picture on Discord's window and taskbar button - pick any picture, choose its shape.",
    tags: ["Customisation", "Appearance"],
    authors: [Devs.Ryder],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: false,
    settings,

    toolboxActions: {
        "App icon": openAppIconModal
    },

    start() {
        addHeaderBarButton("o2cord-app-icon", () => (
            <HeaderBarButton icon={AppIconGlyph} tooltip="App icon" onClick={openAppIconModal} />
        ), 893);
        // the saved icon is also applied from the main process; this covers a
        // window that was already open before the plugin started
        void Native()?.applyIcon();
    },

    stop() {
        removeHeaderBarButton("o2cord-app-icon");
    }
});
