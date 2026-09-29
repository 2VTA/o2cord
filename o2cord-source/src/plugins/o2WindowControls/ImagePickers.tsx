/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * One picker per window button: choose between a link or an image from the
 * device (Ryder's ask - "مخير بين يحط رابط او صوره من جهازه").
 */

import "./styles.css";

import { Button } from "@components/Button";
import { classes } from "@utils/misc";
import { chooseFile } from "@utils/web";
import { Forms, showToast, TextInput, Toasts, useState } from "@webpack/common";

import { ControlKind, getImageFor, getSource, localImages, setLocalImage, settings, updateStyle } from "./index";

const MAX_BYTES = 4 * 1024 * 1024;

const LABELS: Record<ControlKind, string> = {
    minimize: "Minimize button",
    maximize: "Maximize / restore button",
    close: "Close button"
};

function readAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(file);
    });
}

function ImagePicker({ kind }: { kind: ControlKind; }) {
    const [source, setSourceState] = useState(getSource(kind));
    const [url, setUrl] = useState(settings.store[`${kind}Image`] ?? "");
    const [, rerender] = useState(0);
    const preview = getImageFor(kind);

    function setSource(next: "url" | "file") {
        settings.store[`${kind}Source`] = next;
        setSourceState(next);
        updateStyle();
    }

    function onUrlChange(value: string) {
        setUrl(value);
        settings.store[`${kind}Image`] = value;
        updateStyle();
    }

    async function pickFile() {
        const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            showToast("Choose an image or GIF file.", Toasts.Type.FAILURE);
            return;
        }
        if (file.size > MAX_BYTES) {
            showToast("Use an image under 4 MB.", Toasts.Type.FAILURE);
            return;
        }
        await setLocalImage(kind, await readAsDataUrl(file));
        rerender(n => n + 1);
        showToast("Image saved.", Toasts.Type.SUCCESS);
    }

    async function removeFile() {
        await setLocalImage(kind, "");
        rerender(n => n + 1);
    }

    return (
        <div className="o2-wc-picker">
            <div className="o2-wc-picker-head">
                <div className="o2-wc-preview">
                    {preview ? <img src={preview} alt="" /> : <span>None</span>}
                </div>
                <Forms.FormTitle tag="h5" className="o2-wc-picker-title">{LABELS[kind]}</Forms.FormTitle>
                <div className="o2-wc-switch" role="radiogroup">
                    <button
                        className={classes("o2-wc-switch-btn", source === "url" && "o2-wc-switch-on")}
                        role="radio"
                        aria-checked={source === "url"}
                        onClick={() => setSource("url")}
                    >
                        Link
                    </button>
                    <button
                        className={classes("o2-wc-switch-btn", source === "file" && "o2-wc-switch-on")}
                        role="radio"
                        aria-checked={source === "file"}
                        onClick={() => setSource("file")}
                    >
                        From device
                    </button>
                </div>
            </div>

            {source === "url" ? (
                <TextInput
                    value={url}
                    onChange={onUrlChange}
                    placeholder="https://example.com/image.png - leave empty for the default icon"
                />
            ) : (
                <div className="o2-wc-file-row">
                    <Button variant="primary" size="small" onClick={pickFile}>
                        {localImages[kind] ? "Change image" : "Choose image"}
                    </Button>
                    {localImages[kind] && (
                        <Button variant="dangerSecondary" size="small" onClick={removeFile}>Remove</Button>
                    )}
                    <span className="o2-wc-file-note">PNG, JPG, WebP or GIF, up to 4 MB. Saved on this device only.</span>
                </div>
            )}
        </div>
    );
}

export function ImagePickers() {
    return (
        <div className="o2-wc-pickers">
            <ImagePicker kind="minimize" />
            <ImagePicker kind="maximize" />
            <ImagePicker kind="close" />
        </div>
    );
}
