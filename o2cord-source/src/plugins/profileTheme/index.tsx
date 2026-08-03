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
import { Button, Forms, React, Select, showToast, TextInput, Toasts, UserStore } from "@webpack/common";

const STYLE_ID = "o2-profile-theme-vars";
const TARGET_CLASS = "o2-profile-theme-target";
const TARGET_ATTR = "data-o2-profile-theme-target";
const IMAGE_LAYER_ATTR = "data-o2-profile-theme-layer";
const TRANSPARENT_CHILD_ATTR = "data-o2-profile-theme-transparent";
const PANEL_CHILD_ATTR = "data-o2-profile-theme-panel";
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
    "[class*='profileFrameContainer']",
    "[class*='custom-profile-frame']",
    "[class*='profilePanel'] [class*='userProfile']",
    "[style*='--profile-gradient-primary-color']",
    "[style*='--profile-gradient-secondary-color']"
].join(",");

const PROFILE_SHELL_SELECTOR = [
    "[class*='outer_c0bea0']",
    "[class*='userProfileOuter']",
    "[class*='userPopoutOuter']",
    "[class*='themeContainer_ce8328']",
    "[class*='custom-user-profile-theme']",
    "[class*='user-profile-popout']",
    "[class*='profileFrameContainer']",
    "[class*='custom-profile-frame']"
].join(",");

const PROFILE_FRAME_SELECTOR = [
    "[class*='profileFrameContainer']",
    "[class*='custom-profile-frame']",
    "[class*='profileFrameLayer']",
    "[class*='profileFrameMask']",
    "[class*='avatarDecoration']",
    "[class*='decoration']",
    "[src*='collectibles-shop']",
    "[class*='profileEffect']"
].join(",");

const PROFILE_THEME_EXCLUDED_SELECTOR = [
    "[class*='frameGridItem']",
    "[class*='profilePreviewContainer']",
    "[class*='profileContainer_c9a5b2']",
    "[class*='previewContainer_c9a5b2']",
    "[aria-label*='Profile Frame Preview']",
    "[class*='collectiblesShop']",
    "[class*='collectibles-shop']",
    "[class*='shop_']",
    "[class*='shop__']"
].join(",");

const TRANSPARENT_CHILD_SELECTOR = [
    "[class*='inner_c0bea0']",
    "[class*='userProfileInner']",
    "[class*='overlayBackground']",
    "[class*='bodyInnerWrapper']",
    "[class*='body_ce8328']",
    "[class*='userInfo_ce8328']",
    "[class*='scrollerBase']",
    "[class*='thin_']",
    "[style*='--profile-gradient-modal-background-color']"
].join(",");

const PANEL_CHILD_SELECTOR = [
    "[class*='activity']",
    "[class*='section']",
    "[class*='menuOverlay']",
    "[class*='card_']",
    "[class*='card__']"
].join(",");

function getProfileShell(element: Element) {
    if (element.closest(PROFILE_THEME_EXCLUDED_SELECTOR))
        return null;

    if (element.matches(PROFILE_SHELL_SELECTOR))
        return element as HTMLElement;

    const shell = element.closest<HTMLElement>(PROFILE_SHELL_SELECTOR);
    if (shell?.closest(PROFILE_THEME_EXCLUDED_SELECTOR))
        return null;

    return shell;
}

function getClassName(element: Element) {
    const { className } = element as HTMLElement;
    return typeof className === "string" ? className : "";
}

function isProfileFramePart(element: Element) {
    const className = getClassName(element);

    return className.includes("profileFrameLayer")
        || className.includes("profileFrameMask")
        || className.includes("avatarDecoration")
        || (element instanceof HTMLImageElement && element.src.includes("collectibles-shop"));
}

function addTargetFromElement(targets: Set<HTMLElement>, element: Element) {
    const shell = getProfileShell(element);
    if (shell && isCurrentUserProfileShell(shell)) targets.add(shell);
}

function isCurrentUserProfileShell(element: HTMLElement) {
    const me = UserStore.getCurrentUser() as any;
    if (!me?.id) return false;

    const text = element.textContent ?? "";
    const names = [
        me.id,
        me.username,
        me.globalName,
        me.displayName
    ].filter((name): name is string => typeof name === "string" && name.length > 1);

    if (names.some(name => text.includes(name))) return true;

    const avatarUrl = typeof me.getAvatarURL === "function"
        ? me.getAvatarURL(undefined, 128, true)
        : "";
    const avatarHash = typeof me.avatar === "string" ? me.avatar : "";

    return Array.from(element.querySelectorAll<HTMLImageElement>("img"))
        .some(img => {
            const src = img.src || "";
            return Boolean((avatarUrl && src.includes(avatarUrl.split("?")[0])) || (avatarHash && src.includes(avatarHash)));
        });
}

function ensureImageLayer(element: HTMLElement) {
    const existingLayer = Array
        .from(element.children)
        .find(child => child instanceof HTMLElement && child.hasAttribute(IMAGE_LAYER_ATTR));

    if (existingLayer) return;

    const layer = document.createElement("div");
    layer.className = "o2-profile-theme-image-layer";
    layer.setAttribute(IMAGE_LAYER_ATTR, "true");
    layer.setAttribute("aria-hidden", "true");
    element.prepend(layer);
}

function applyTargetFallback(element: HTMLElement) {
    element.classList.add(TARGET_CLASS);
    element.setAttribute(TARGET_ATTR, "true");
    ensureImageLayer(element);
    element.style.setProperty("background-color", "transparent", "important");
    applyChildFallbacks(element);
}

function applyTransparentChildFallback(element: HTMLElement) {
    if (isProfileFramePart(element)) return;

    element.setAttribute(TRANSPARENT_CHILD_ATTR, "true");
    element.style.setProperty("background", "transparent", "important");
    element.style.setProperty("background-color", "transparent", "important");
}

function applyPanelChildFallback(element: HTMLElement) {
    if (isProfileFramePart(element)) return;

    element.setAttribute(PANEL_CHILD_ATTR, "true");
    element.style.setProperty("background", "var(--o2-profile-theme-panel-bg)", "important");
    element.style.setProperty("background-color", "transparent", "important");
}

function applyChildFallbacks(element: HTMLElement) {
    element
        .querySelectorAll<HTMLElement>(TRANSPARENT_CHILD_SELECTOR)
        .forEach(applyTransparentChildFallback);

    element
        .querySelectorAll<HTMLElement>(PANEL_CHILD_SELECTOR)
        .forEach(applyPanelChildFallback);
}

function clearTargetFallback(element: Element) {
    element.classList.remove(TARGET_CLASS);
    element.removeAttribute(TARGET_ATTR);

    element
        .querySelectorAll(`[${IMAGE_LAYER_ATTR}]`)
        .forEach(layer => layer.remove());

    element
        .querySelectorAll(`[${TRANSPARENT_CHILD_ATTR}], [${PANEL_CHILD_ATTR}]`)
        .forEach(clearChildFallback);

    if (element instanceof HTMLElement) {
        element.style.removeProperty("background");
        element.style.removeProperty("background-color");
    }
}

function clearChildFallback(element: Element) {
    element.removeAttribute(TRANSPARENT_CHILD_ATTR);
    element.removeAttribute(PANEL_CHILD_ATTR);

    if (element instanceof HTMLElement) {
        element.style.removeProperty("background");
        element.style.removeProperty("background-color");
    }
}

function markProfileTargets() {
    if (!O2CORD_DEBUG || !settings.store.imageUrl) return;

    const targets = new Set<HTMLElement>();

    document
        .querySelectorAll<HTMLElement>(PROFILE_TARGET_SELECTOR)
        .forEach(element => addTargetFromElement(targets, element));

    document
        .querySelectorAll<HTMLElement>(PROFILE_FRAME_SELECTOR)
        .forEach(element => addTargetFromElement(targets, element));

    document.querySelectorAll(`.${TARGET_CLASS}, [${TARGET_ATTR}]`).forEach(element => {
        if (!document.documentElement.contains(element) || !targets.has(element as HTMLElement))
            clearTargetFallback(element);
    });

    targets.forEach(applyTargetFallback);
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
        document.querySelectorAll(`.${TARGET_CLASS}, [${TARGET_ATTR}]`).forEach(clearTargetFallback);
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
