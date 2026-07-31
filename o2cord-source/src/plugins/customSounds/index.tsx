/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { AudioProcessor, PreprocessAudioData } from "@api/AudioPlayer";
import { get as getFromDataStore } from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { React, Select, showToast } from "@webpack/common";

import { clearAudioStore, getAllAudio, getAudioDataURI } from "./audioStore";
import { SoundOverrideComponent } from "./SoundOverrideComponent";
import { makeEmptyOverride, seasonalSounds, SoundOverride, soundTypes } from "./types";

const cl = classNameFactory("vc-custom-sounds-");

const allSoundTypes = soundTypes || [];

const AUDIO_STORE_KEY = "ScattrdCustomSounds";

const dataUriCache = new Map<string, string>();
const validSoundIds = new Set([
    "default",
    "custom",
    ...allSoundTypes.map(type => type.id),
    ...Object.keys(seasonalSounds)
]);

function normalizeOverride(value: unknown): SoundOverride {
    const fallback = makeEmptyOverride();

    if (!value || typeof value !== "object") return fallback;

    const override = value as Partial<SoundOverride>;
    const volume = Number(override.volume);
    const selectedSound = typeof override.selectedSound === "string" && validSoundIds.has(override.selectedSound)
        ? override.selectedSound
        : "default";

    return {
        enabled: Boolean(override.enabled),
        selectedSound,
        volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 100,
        useFile: selectedSound === "custom" || Boolean(override.useFile),
        selectedFileId: typeof override.selectedFileId === "string" && override.selectedFileId ? override.selectedFileId : undefined
    };
}

function getOverride(id: string): SoundOverride {
    const stored = settings.store[id];
    if (!stored) return makeEmptyOverride();

    if (typeof stored === "object") return normalizeOverride(stored);

    try {
        return normalizeOverride(JSON.parse(stored));
    } catch {
        return makeEmptyOverride();
    }
}

function setOverride(id: string, override: SoundOverride) {
    settings.store[id] = JSON.stringify(normalizeOverride(override));
}

function readSelectValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "value" in value) {
        const rawValue = (value as { value?: unknown; }).value;
        return typeof rawValue === "string" ? rawValue : "";
    }

    return "";
}

export const getCustomSoundURL: AudioProcessor = (data: PreprocessAudioData) => {
    try {
        if (!data || typeof data.audio !== "string") return;

        let audioOverride = data.audio;

        if (data.audio in seasonalSounds) {
            audioOverride = soundTypes.find(sound => sound.seasonal?.includes(data.audio))?.id || data.audio;
        }

        const override = getOverride(audioOverride);

        if (!override?.enabled) {
            return;
        }

        if (override.selectedSound === "custom" && override.selectedFileId) {
            const dataUri = dataUriCache.get(override.selectedFileId);
            if (dataUri) {
                data.audio = dataUri;
                data.volume = override.volume;
                return;
            }

            return;
        }

        if (override.selectedSound !== "default" && override.selectedSound !== "custom") {
            if (override.selectedSound in seasonalSounds) {
                data.audio = seasonalSounds[override.selectedSound];
                data.volume = override.volume;
                return;
            }

            const soundType = allSoundTypes.find(t => t.id === data.audio);

            if (soundType?.seasonal) {
                const seasonalId = soundType.seasonal.find(seasonalId =>
                    seasonalId.startsWith(`${override.selectedSound}_`)
                );

                if (seasonalId && seasonalId in seasonalSounds) {
                    data.audio = seasonalSounds[seasonalId];
                    data.volume = override.volume;
                    return;
                }
            }
        }

        data.volume = override.volume;
    } catch (error) {
        console.error("[CustomSounds] Audio processor failed:", error);
    }
};

export async function ensureDataURICached(fileId: string): Promise<string | null> {
    if (dataUriCache.has(fileId)) {
        return dataUriCache.get(fileId)!;
    }

    try {
        const dataUri = await getAudioDataURI(fileId);
        if (dataUri) {
            dataUriCache.set(fileId, dataUri);
            console.log(`[CustomSounds] Cached data URI for file ${fileId}`);
            return dataUri;
        }
    } catch (error) {
        console.error(`[CustomSounds] Error generating data URI for ${fileId}:`, error);
    }

    return null;
}

export async function refreshDataURI(id: string): Promise<void> {
    const override = getOverride(id);
    if (!override?.selectedFileId) {
        console.log(`[CustomSounds] refreshDataURI called for ${id} but no selectedFileId`);
        return;
    }

    console.log(`[CustomSounds] Refreshing data URI for ${id} with file ID ${override.selectedFileId}`);

    const dataUri = await ensureDataURICached(override.selectedFileId);
    if (dataUri) {
        console.log(`[CustomSounds] Successfully cached data URI for ${id} (length: ${dataUri.length})`);
    } else {
        console.error(`[CustomSounds] Failed to cache data URI for ${id}`);
    }
}

function cleanupInvalidCustomOverrides(files: Record<string, unknown>) {
    for (const soundType of allSoundTypes) {
        const override = getOverride(soundType.id);
        if (override.selectedSound !== "custom") continue;

        if (!override.selectedFileId || !(override.selectedFileId in files)) {
            setOverride(soundType.id, makeEmptyOverride());
        }
    }
}

async function cleanCustomSoundsStore() {
    console.log("[CustomSounds] Cleaning saved audio store...");

    try {
        const files = await getAllAudio();
        cleanupInvalidCustomOverrides(files);
        dataUriCache.clear();
    } catch (error) {
        console.error("[CustomSounds] Failed to clean audio store:", error);
    }

    console.log("[CustomSounds] Startup cleanup complete");
}

export async function debugCustomSounds() {
    console.log("[CustomSounds] === DEBUG INFO ===");

    const rawDataStore = await getFromDataStore(AUDIO_STORE_KEY);
    console.log("[CustomSounds] Raw DataStore content:", rawDataStore);

    const allFiles = await getAllAudio().catch(error => {
        console.error("[CustomSounds] Failed to inspect audio store:", error);
        return {};
    });
    console.log(`[CustomSounds] Stored files: ${Object.keys(allFiles).length}`);

    let totalBufferSize = 0;
    let totalDataUriSize = 0;

    for (const [id, file] of Object.entries(allFiles)) {
        const bufferSize = file.buffer?.byteLength || 0;
        const dataUriSize = file.dataUri?.length || 0;
        totalBufferSize += bufferSize;
        totalDataUriSize += dataUriSize;

        console.log(`[CustomSounds] File ${id}:`, {
            name: file.name,
            type: file.type,
            bufferSize: `${(bufferSize / 1024).toFixed(1)}KB`,
            hasValidBuffer: file.buffer instanceof ArrayBuffer,
            hasDataUri: !!file.dataUri,
            dataUriSize: `${(dataUriSize / 1024).toFixed(1)}KB`
        });
    }

    console.log(`[CustomSounds] Total storage - Buffers: ${(totalBufferSize / 1024).toFixed(1)}KB, DataURIs: ${(totalDataUriSize / 1024).toFixed(1)}KB`);

    console.log(`[CustomSounds] Memory cache contains ${dataUriCache.size} data URIs`);

    console.log("[CustomSounds] Settings store structure:", Object.keys(settings.store));

    console.log("[CustomSounds] Sound override status:");
    let enabledCount = 0;
    let totalSettingsSize = 0;

    for (const soundType of allSoundTypes) {
        const override = getOverride(soundType.id);
        const settingsSize = JSON.stringify(override).length;
        totalSettingsSize += settingsSize;

        console.log(`[CustomSounds] ${soundType.id}:`, {
            enabled: override.enabled,
            selectedSound: override.selectedSound,
            selectedFileId: override.selectedFileId,
            volume: override.volume,
            settingsSize: `${settingsSize}B`
        });

        if (override.enabled) enabledCount++;
    }

    console.log(`[CustomSounds] Total enabled overrides: ${enabledCount}`);
    console.log(`[CustomSounds] Estimated settings size: ${(totalSettingsSize / 1024).toFixed(1)}KB`);
    console.log("[CustomSounds] === END DEBUG ===");
}

const soundSettings = Object.fromEntries(
    allSoundTypes.map(type => [
        type.id,
        {
            type: OptionType.STRING,
            description: `Override for ${type.name}`,
            default: JSON.stringify(makeEmptyOverride()),
            hidden: true
        }
    ])
);

const settings = definePluginSettings({
    ...soundSettings,
    overrides: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => {
            const [resetTrigger, setResetTrigger] = React.useState(0);
            const [selectedSoundId, setSelectedSoundId] = React.useState(allSoundTypes[0]?.id ?? "");
            const fileInputRef = React.useRef<HTMLInputElement>(null);

            React.useEffect(() => {
                allSoundTypes.forEach(type => {
                    setOverride(type.id, getOverride(type.id));
                });
            }, []);

            const resetOverrides = () => {
                allSoundTypes.forEach(type => {
                    setOverride(type.id, makeEmptyOverride());
                });
                dataUriCache.clear();
                setResetTrigger(prev => prev + 1);
                showToast("All overrides reset successfully!");
            };

            const resetUploadedFiles = async () => {
                await clearAudioStore();
                dataUriCache.clear();
                allSoundTypes.forEach(type => {
                    const override = getOverride(type.id);
                    if (override.selectedSound === "custom") {
                        setOverride(type.id, makeEmptyOverride());
                    }
                });
                setResetTrigger(prev => prev + 1);
                showToast("CustomSounds uploaded files cleared.");
            };

            const triggerFileUpload = () => {
                fileInputRef.current?.click();
            };

            const handleSettingsUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (e: ProgressEvent<FileReader>) => {
                        try {
                            resetOverrides();
                            const imported = JSON.parse(e.target?.result as string);

                            if (imported.overrides && Array.isArray(imported.overrides)) {
                                imported.overrides.forEach((setting: any) => {
                                    if (setting.id) {
                                        const override: SoundOverride = {
                                            enabled: setting.enabled ?? false,
                                            selectedSound: setting.selectedSound ?? "default",
                                            selectedFileId: setting.selectedFileId ?? undefined,
                                            volume: setting.volume ?? 100,
                                            useFile: false
                                        };
                                        setOverride(setting.id, override);
                                    }
                                });
                            }

                            setResetTrigger(prev => prev + 1);
                            showToast("Settings imported successfully!");
                        } catch (error) {
                            console.error("Error importing settings:", error);
                            showToast("Error importing settings. Check console for details.");
                        }
                    };

                    reader.readAsText(file);
                    event.target.value = "";
                }
            };

            const downloadSettings = async () => {
                const overrides = allSoundTypes.map(type => {
                    const override = getOverride(type.id);
                    return {
                        id: type.id,
                        enabled: override.enabled,
                        selectedSound: override.selectedSound,
                        selectedFileId: override.selectedFileId ?? undefined,
                        volume: override.volume
                    };
                }).filter(o => o.enabled || o.selectedSound !== "default");

                const exportPayload = {
                    overrides,
                    __note: "Audio files are not included in exports and will need to be re-uploaded after import"
                };

                const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "customSounds-settings.json";
                a.click();
                URL.revokeObjectURL(url);

                showToast(`Exported ${overrides.length} settings (audio files not included)`);
            };

            const selectedSoundType = allSoundTypes.find(type => type.id === selectedSoundId) ?? allSoundTypes[0];
            const selectedOverride = selectedSoundType ? getOverride(selectedSoundType.id) : null;

            return (
                <div>
                    <div className="vc-custom-sounds-buttons">
                        <Button variant="primary" onClick={triggerFileUpload}>Import</Button>
                        <Button variant="secondary" onClick={downloadSettings}>Export</Button>
                        <Button variant="dangerPrimary" onClick={resetOverrides}>Reset All</Button>
                        <Button variant="dangerPrimary" onClick={resetUploadedFiles}>Clear Files</Button>
                        <input
                            className={cl("file-input")}
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleSettingsUpload}
                        />
                    </div>

                    <div className={cl("sound-picker")}>
                        <Heading>Sound To Edit</Heading>
                        <Select
                            options={allSoundTypes.map(type => ({
                                value: type.id,
                                label: type.name
                            }))}
                            isSelected={value => value === selectedSoundId}
                            select={value => setSelectedSoundId(readSelectValue(value) || allSoundTypes[0]?.id || "")}
                            serialize={value => readSelectValue(value)}
                            maxVisibleItems={8}
                        />
                    </div>

                    <div className={cl("sounds-list")}>
                        {selectedSoundType && selectedOverride && (
                            <ErrorBoundary noop key={`${selectedSoundType.id}-${resetTrigger}`} message={`Failed to render CustomSounds setting for ${selectedSoundType.name}`}>
                                <SoundOverrideComponent
                                    type={selectedSoundType}
                                    override={selectedOverride}
                                    onChange={async () => {
                                        setOverride(selectedSoundType.id, selectedOverride);

                                        if (selectedOverride.enabled && selectedOverride.selectedSound === "custom" && selectedOverride.selectedFileId) {
                                            try {
                                                const dataUri = await ensureDataURICached(selectedOverride.selectedFileId);
                                                if (!dataUri) {
                                                    setOverride(selectedSoundType.id, makeEmptyOverride());
                                                    setResetTrigger(prev => prev + 1);
                                                    showToast("Custom sound was missing or too large, so it was reset.");
                                                }
                                            } catch (error) {
                                                console.error(`[CustomSounds] Failed to cache data URI for ${selectedSoundType.id}:`, error);
                                                showToast("Error loading custom sound file");
                                            }
                                        }

                                        console.log(`[CustomSounds] Settings saved for ${selectedSoundType.id}:`, selectedOverride);
                                    }}
                                />
                            </ErrorBoundary>
                        )}
                    </div>
                </div>
            );
        }
    }
});

export function isOverriden(id: string): boolean {
    return !!getOverride(id)?.enabled;
}

export function findOverride(id: string): SoundOverride | null {
    const override = getOverride(id);
    return override?.enabled ? override : null;
}

export default definePlugin({
    name: "CustomSounds",
    description: "Customize Discord's sounds.",
    dependencies: ["AudioPlayerAPI"],
    tags: ["Customisation", "Notifications", "Voice"],
    authors: [Devs.Ryder],
    settings,
    startAt: StartAt.Init,
    audioProcessor: getCustomSoundURL,

    async start() {
        console.log("[CustomSounds] Plugin starting...");

        try {
            await cleanCustomSoundsStore();
            console.log("[CustomSounds] Startup complete");
        } catch (error) {
            console.error("[CustomSounds] Startup failed:", error);
        }
    },

    stop() {
        console.log("[CustomSounds] Plugin stopped");
    }
});
