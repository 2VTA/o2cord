/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { Devs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { Margins } from "@utils/margins";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { chooseFile } from "@utils/web";
import { Button, Forms, React, Select, showToast, TextInput, Toasts } from "@webpack/common";

const STYLE_ID = "o2-profile-theme-vars";
const TARGET_CLASS = "o2-profile-theme-target";
const MAX_LOCAL_IMAGE_BYTES = 8 * 1024 * 1024;

type ThemeMode = "dim" | "full";

let observer: MutationObserver | null = null;
let scanFrame: number | null = null;
let scanTimeouts: ReturnType<typeof setTimeout>[] = [];
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let styleElement: HTMLStyleElement | null = null;
let lifecycleListenersActive = false;

function cleanImageUrl(value: string) {
    return value.trim();
}

function cssString(value: string) {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, "\\\"")
        .replace(/[\n\r\f]/g, "");
}

function getModeVars(mode: ThemeMode) {
    if (mode === "full") {
        return {
            imageOpacity: "1",
            dim: "0.18",
            panelBg: "rgba(12, 12, 16, 0.34)"
        };
    }

    return {
        imageOpacity: "0.48",
        dim: "0.58",
        panelBg: "rgba(18, 18, 24, 0.66)"
    };
}

const PROFILE_TARGET_SELECTOR = [
    "[class*='popoutContainer'][class*='accountPopout'] [class*='outer_c0bea0']",
    "[class*='accountPopout'] [class*='outer_c0bea0']",
    "[role='dialog'] [class*='outer_c0bea0']",
    "[class*='outer_c0bea0']",
    "[class*='userProfileOuter']",
    "[class*='userPopoutOuter']",
    "[class*='themeContainer_ce8328']",
    "[class*='profilePanel'] [class*='userProfile']",
    "[style*='--profile-gradient-primary-color']",
    "[style*='--profile-gradient-secondary-color']"
].join(",");

function markProfileTargets() {
    if (!O2CORD_DEBUG || !settings.store.imageUrl) return;

    const targets = new Set(document.querySelectorAll<HTMLElement>(PROFILE_TARGET_SELECTOR));

    document.querySelectorAll(`.${TARGET_CLASS}`).forEach(element => {
        if (!document.documentElement.contains(element))
            element.classList.remove(TARGET_CLASS);
    });

    targets.forEach(element => element.classList.add(TARGET_CLASS));
}

function ensureProfileThemeStyle() {
    if (styleElement?.isConnected) return styleElement;

    document.getElementById(STYLE_ID)?.remove();
    styleElement = createAndAppendStyle(STYLE_ID, managedStyleRootNode);
    return styleElement;
}

function queueProfileTargetScan() {
    if (scanFrame != null) return;

    scanFrame = requestAnimationFrame(() => {
        scanFrame = null;
        markProfileTargets();
    });
}

function queueImmediateProfileTargetScan() {
    if (!O2CORD_DEBUG || !settings.store.imageUrl) return;

    try {
        markProfileTargets();
    } catch { }
}

function startProfileWatcher() {
    stopProfileWatcher(false);

    scheduleProfileScans();
    observer = new MutationObserver(() => {
        writeProfileThemeVars();
        queueProfileTargetScan();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"]
    });
    addLifecycleListeners();
    startKeepAlive();
}

function scheduleProfileScans() {
    scanTimeouts.forEach(clearTimeout);
    scanTimeouts = [];
    queueProfileTargetScan();

    for (const delay of [50, 150, 350, 800, 1600, 3000, 5000])
        scanTimeouts.push(setTimeout(queueImmediateProfileTargetScan, delay));
}

function handleAppLifecycleChange() {
    if (!settings.store.imageUrl) return;
    refreshProfileTheme();
}

function startKeepAlive() {
    if (keepAliveInterval != null) return;

    keepAliveInterval = setInterval(() => {
        if (!settings.store.imageUrl) return;

        writeProfileThemeVars();
        markProfileTargets();
    }, 1000);
}

function stopKeepAlive() {
    if (keepAliveInterval == null) return;

    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
}

function addLifecycleListeners() {
    if (lifecycleListenersActive) return;

    lifecycleListenersActive = true;
    window.addEventListener("blur", handleAppLifecycleChange);
    window.addEventListener("focus", handleAppLifecycleChange);
    window.addEventListener("resize", handleAppLifecycleChange);
    document.addEventListener("visibilitychange", handleAppLifecycleChange);
}

function removeLifecycleListeners() {
    if (!lifecycleListenersActive) return;

    lifecycleListenersActive = false;
    window.removeEventListener("blur", handleAppLifecycleChange);
    window.removeEventListener("focus", handleAppLifecycleChange);
    window.removeEventListener("resize", handleAppLifecycleChange);
    document.removeEventListener("visibilitychange", handleAppLifecycleChange);
}

function stopProfileWatcher(clearTargets = true) {
    observer?.disconnect();
    observer = null;
    removeLifecycleListeners();

    if (scanFrame != null) {
        cancelAnimationFrame(scanFrame);
        scanFrame = null;
    }

    scanTimeouts.forEach(clearTimeout);
    scanTimeouts = [];
    stopKeepAlive();

    if (clearTargets)
        document.querySelectorAll(`.${TARGET_CLASS}`).forEach(element => element.classList.remove(TARGET_CLASS));
}

function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
    });
}

async function pickLocalImage() {
    const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
    if (!file) return null;

    if (!file.type.startsWith("image/")) {
        showToast("Choose an image or GIF file.", Toasts.Type.FAILURE);
        return null;
    }

    if (file.size > MAX_LOCAL_IMAGE_BYTES) {
        showToast("Use an image or GIF under 8 MB.", Toasts.Type.FAILURE);
        return null;
    }

    return readFileAsDataUrl(file);
}

function writeProfileThemeVars() {
    if (!O2CORD_DEBUG) return false;

    const imageUrl = cleanImageUrl(settings.store.imageUrl);
    const root = document.documentElement;

    if (!imageUrl) {
        removeProfileTheme();
        return false;
    }

    const modeVars = getModeVars(settings.store.mode as ThemeMode);
    const style = ensureProfileThemeStyle();

    style.textContent = `
        :root {
            --o2-profile-theme-image: url("${cssString(imageUrl)}");
            --o2-profile-theme-image-opacity: ${modeVars.imageOpacity};
            --o2-profile-theme-dim: ${modeVars.dim};
            --o2-profile-theme-panel-bg: ${modeVars.panelBg};
        }
    `;
    root.classList.add("o2-profile-theme-active");
    return true;
}

function refreshProfileTheme() {
    if (!settings.store.imageUrl) return;

    if (writeProfileThemeVars())
        scheduleProfileScans();
}

function applyProfileTheme() {
    if (!O2CORD_DEBUG) return;

    if (!writeProfileThemeVars()) return;
    startProfileWatcher();
    scheduleProfileScans();
}

function removeProfileTheme() {
    document.documentElement.classList.remove("o2-profile-theme-active");
    document.getElementById(STYLE_ID)?.remove();
    styleElement = null;
    stopProfileWatcher();
}

function clearProfileTheme() {
    settings.store.imageUrl = "";
    removeProfileTheme();
}

function ProfileThemeSettings() {
    const [imageUrl, setImageUrl] = React.useState(settings.store.imageUrl);
    const [mode, setMode] = React.useState<ThemeMode>((settings.store.mode as ThemeMode) || "dim");

    const save = (nextImageUrl = imageUrl, nextMode = mode) => {
        settings.store.imageUrl = cleanImageUrl(nextImageUrl);
        settings.store.mode = nextMode;
        applyProfileTheme();
        showToast("ProfileTheme applied.", Toasts.Type.SUCCESS);
    };

    const chooseImage = async () => {
        const picked = await pickLocalImage();
        if (!picked) return;

        setImageUrl(picked);
        save(picked, mode);
    };

    const clear = () => {
        setImageUrl("");
        clearProfileTheme();
        showToast("ProfileTheme cleared.", Toasts.Type.MESSAGE);
    };

    const previewVars = {
        "--o2-profile-theme-settings-preview-image": imageUrl ? `url("${cssString(imageUrl)}")` : "none",
        "--o2-profile-theme-settings-preview-opacity": getModeVars(mode).imageOpacity
    } as React.CSSProperties;

    return (
        <Forms.FormSection className="o2-profile-theme-settings">
            <Forms.FormTitle tag="h3">Profile Theme</Forms.FormTitle>
            <Forms.FormText>
                Set a local 320x580-style profile background image or GIF for your own client.
            </Forms.FormText>

            <Forms.FormTitle tag="h5">Image</Forms.FormTitle>
            <div className="o2-profile-theme-row">
                <TextInput
                    value={imageUrl}
                    onChange={setImageUrl}
                    placeholder="Image or GIF URL"
                />
                <Button onClick={chooseImage}>Choose Image</Button>
            </div>

            <Forms.FormTitle tag="h5">Visibility</Forms.FormTitle>
            <Select
                options={[
                    { label: "Dim image", value: "dim" },
                    { label: "Full image", value: "full" }
                ]}
                select={value => {
                    const nextMode = value as ThemeMode;
                    setMode(nextMode);
                    save(imageUrl, nextMode);
                }}
                isSelected={value => value === mode}
                serialize={value => String(value)}
            />

            <div className="o2-profile-theme-actions">
                <Button onClick={() => save()}>Apply</Button>
                <Button color={Button.Colors.RED} onClick={clear}>Clear</Button>
            </div>

            <Forms.FormTitle tag="h5" className={Margins.top8}>Preview 320x580</Forms.FormTitle>
            <div className="o2-profile-theme-preview" style={previewVars}>
                {!imageUrl && <div className="o2-profile-theme-preview-empty">No image selected</div>}
                <div className="o2-profile-theme-preview-card">
                    <div className="o2-profile-theme-preview-name">o2 Profile</div>
                    <div className="o2-profile-theme-preview-subtitle">
                        {mode === "full" ? "Full image mode" : "Dim image mode"}
                    </div>
                </div>
            </div>
        </Forms.FormSection>
    );
}

const settings = definePluginSettings({
    imageUrl: {
        type: OptionType.STRING,
        description: "ProfileTheme image or GIF URL",
        default: "",
        hidden: true,
        onChange: applyProfileTheme
    },
    mode: {
        type: OptionType.SELECT,
        description: "ProfileTheme image visibility",
        options: [
            { label: "Dim image", value: "dim", default: true },
            { label: "Full image", value: "full" }
        ],
        onChange: applyProfileTheme
    },
    manager: {
        type: OptionType.COMPONENT,
        description: "",
        component: ProfileThemeSettings
    }
});

export default definePlugin({
    name: "ProfileTheme",
    description: "Private debug profile theme image background.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    hidden: !O2CORD_DEBUG,
    enabledByDefault: O2CORD_DEBUG,
    settings,
    startAt: StartAt.DOMContentLoaded,
    start: applyProfileTheme,
    stop: removeProfileTheme
});
