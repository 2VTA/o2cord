/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { isPluginEnabled } from "@api/PluginManager";
import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { resolveError } from "@components/settings/tabs/plugins/components/Common";
import { debounce } from "@shared/debounce";
import { classNameFactory } from "@utils/css";
import { ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, Button, closeModal, Modal, openModal, Select, Text, TextInput, Toasts, useEffect, useState } from "@webpack/common";
import type { ReactNode } from "react";

import CustomRPCPlugin, { setRpc, settings, TimestampMode } from ".";

const cl = classNameFactory("vc-customRPC-settings-");

type SettingsKey = keyof typeof settings.store;

interface TextOption<T> {
    settingsKey: SettingsKey;
    label: string;
    disabled?: boolean;
    transform?: (value: string) => T;
    isValid?: (value: T) => true | string;
    action?: ReactNode;
}

interface SelectOption<T> {
    settingsKey: SettingsKey;
    label: string;
    disabled?: boolean;
    options: { label: string; value: T; default?: boolean; }[];
}

const makeValidator = (maxLength: number, isRequired = false) => (value: string) => {
    if (isRequired && !value) return "This field is required.";
    if (value.length > maxLength) return `Must be not longer than ${maxLength} characters.`;
    return true;
};

const maxLength128 = makeValidator(128);

function isAppIdValid(value: string) {
    if (!/^\d{16,21}$/.test(value)) return "Must be a valid Discord ID.";
    return true;
}

const updateRPC = debounce(() => {
    setRpc(true);
    if (isPluginEnabled(CustomRPCPlugin.name)) setRpc();
});

function isStreamLinkDisabled() {
    return settings.store.type !== ActivityType.STREAMING;
}

function isStreamLinkValid(value: string) {
    if (!isStreamLinkDisabled() && !/https?:\/\/(www\.)?(twitch\.tv|youtube\.com)\/\w+/.test(value)) return "Streaming link must be a valid URL.";
    if (value && value.length > 512) return "Streaming link must be not longer than 512 characters.";
    return true;
}

function parseNumber(value: string) {
    return value ? parseInt(value, 10) : 0;
}

function isNumberValid(value: number) {
    if (isNaN(value)) return "Must be a number.";
    if (value < 0) return "Must be a positive number.";
    return true;
}

function isUrlValid(value: string) {
    if (value && !/^https?:\/\/.+/.test(value)) return "Must be a valid URL.";
    return true;
}

function isImageKeyValid(value: string) {
    if (/https?:\/\/(?!i\.)?imgur\.com\//.test(value)) return "Imgur link must be a direct link to the image (e.g. https://i.imgur.com/...). Right click the image and click 'Copy image address'";
    if (/https?:\/\/(?!media\.)?tenor\.com\//.test(value)) return "Tenor link must be a direct link to the image (e.g. https://media.tenor.com/...). Right click the GIF and click 'Copy image address'";
    return true;
}

function PairSetting<T>(props: { data: [TextOption<T>, TextOption<T>]; }) {
    const [left, right] = props.data;

    return (
        <div className={cl("pair")}>
            <SingleSetting {...left} />
            <SingleSetting {...right} />
        </div>
    );
}

function SingleSetting<T>({ settingsKey, label, disabled, isValid, transform, action }: TextOption<T>) {
    const [state, setState] = useState(settings.store[settingsKey] ?? "");
    const [error, setError] = useState<string | null>(null);

    function handleChange(newValue: any) {
        if (transform) newValue = transform(newValue);

        const valid = isValid?.(newValue) ?? true;

        setState(newValue);
        setError(resolveError(valid));

        if (valid === true) {
            settings.store[settingsKey] = newValue;
            updateRPC();
        }
    }

    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <div className={cl("input-row")}>
                <TextInput
                    type="text"
                    placeholder={"Enter a value"}
                    value={state}
                    onChange={handleChange}
                    disabled={disabled}
                />
                {action}
            </div>
            {error && <Text className={cl("error")} variant="text-sm/normal">{error}</Text>}
        </div>
    );
}

interface AppAsset {
    id: string;
    name: string;
}

function assetImageUrl(appID: string, assetId: string) {
    return `https://cdn.discordapp.com/app-assets/${appID}/${assetId}.png`;
}

function openAssetPicker(appID: string, onPick: (name: string) => void) {
    const key = openModal(props => (
        <Modal {...props} size="medium" title="Choose an Asset">
            <AssetPickerBody appID={appID} onPick={name => { onPick(name); closeModal(key); }} />
        </Modal>
    ));
}

function AssetPickerBody({ appID, onPick }: { appID: string; onPick: (name: string) => void; }) {
    const [assets, setAssets] = useState<AppAsset[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        ApplicationAssetUtils.getAssets(appID)
            .then((result: AppAsset[]) => setAssets(result ?? []))
            .catch(() => setError("Could not load assets for this Application ID."));
    }, [appID]);

    if (error) return <Text className={cl("error")} variant="text-md/normal">{error}</Text>;
    if (!assets) return <Text variant="text-md/normal">Loading...</Text>;
    if (!assets.length) return <Text variant="text-md/normal">This application has no uploaded Rich Presence assets yet. Add some on the Developer Portal first.</Text>;

    return (
        <div className={cl("asset-grid")}>
            {assets.map(asset => (
                <div key={asset.id} className={cl("asset-item")} onClick={() => onPick(asset.name)}>
                    <img src={assetImageUrl(appID, asset.id)} alt={asset.name} />
                    <Text variant="text-sm/normal">{asset.name}</Text>
                </div>
            ))}
        </div>
    );
}

function BrowseAssetsButton({ settingsKey, disabled }: { settingsKey: SettingsKey; disabled?: boolean; }) {
    const appID = settings.store.appID;

    function open() {
        if (!appID) {
            Toasts.show({
                message: "Set an Application ID first.",
                id: Toasts.genId(),
                type: Toasts.Type.FAILURE
            });
            return;
        }

        openAssetPicker(appID, name => {
            settings.store[settingsKey] = name as any;
            updateRPC();
        });
    }

    return (
        <Button size={Button.Sizes.SMALL} disabled={disabled} onClick={open}>
            Browse Assets
        </Button>
    );
}

function SelectSetting<T>({ settingsKey, label, options, disabled }: SelectOption<T>) {
    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <Select
                placeholder={"Select an option"}
                options={options}
                maxVisibleItems={5}
                closeOnSelect={true}
                select={v => settings.store[settingsKey] = v}
                isSelected={v => v === settings.store[settingsKey]}
                serialize={v => String(v)}
                isDisabled={disabled}
            />
        </div>
    );
}

export function RPCSettings() {
    const s = settings.use();

    return (
        <div className={cl("root")}>
            <SelectSetting
                settingsKey="type"
                label="Activity Type"
                options={[
                    {
                        label: "Playing",
                        value: ActivityType.PLAYING,
                        default: true
                    },
                    {
                        label: "Streaming",
                        value: ActivityType.STREAMING
                    },
                    {
                        label: "Listening",
                        value: ActivityType.LISTENING
                    },
                    {
                        label: "Watching",
                        value: ActivityType.WATCHING
                    },
                    {
                        label: "Competing",
                        value: ActivityType.COMPETING
                    }
                ]}
            />

            <PairSetting data={[
                { settingsKey: "appID", label: "Application ID", isValid: isAppIdValid },
                { settingsKey: "appName", label: "Application Name", isValid: makeValidator(128, true) },
            ]} />

            <PairSetting data={[
                { settingsKey: "details", label: "Detail (line 1)", isValid: maxLength128 },
                { settingsKey: "detailsURL", label: "Detail URL", isValid: isUrlValid },
            ]} />

            <PairSetting data={[
                { settingsKey: "state", label: "State (line 2)", isValid: maxLength128 },
                { settingsKey: "stateURL", label: "State URL", isValid: isUrlValid },
            ]} />

            <SingleSetting
                settingsKey="streamLink"
                label="Stream Link (Twitch or YouTube, only if activity type is Streaming)"
                disabled={s.type !== ActivityType.STREAMING}
                isValid={isStreamLinkValid}
            />

            <PairSetting data={[
                {
                    settingsKey: "partySize",
                    label: "Party Size",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: s.type !== ActivityType.PLAYING,
                },
                {
                    settingsKey: "partyMaxSize",
                    label: "Maximum Party Size",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: s.type !== ActivityType.PLAYING,
                },
            ]} />

            <Divider />

            <PairSetting data={[
                {
                    settingsKey: "imageBig",
                    label: "Large Image URL/Key",
                    isValid: isImageKeyValid,
                    action: <BrowseAssetsButton settingsKey="imageBig" />
                },
                { settingsKey: "imageBigTooltip", label: "Large Image Text", isValid: maxLength128 },
            ]} />
            <SingleSetting settingsKey="imageBigURL" label="Large Image clickable URL" isValid={isUrlValid} />

            <PairSetting data={[
                {
                    settingsKey: "imageSmall",
                    label: "Small Image URL/Key",
                    isValid: isImageKeyValid,
                    action: <BrowseAssetsButton settingsKey="imageSmall" />
                },
                { settingsKey: "imageSmallTooltip", label: "Small Image Text", isValid: maxLength128 },
            ]} />
            <SingleSetting settingsKey="imageSmallURL" label="Small Image clickable URL" isValid={isUrlValid} />

            <Divider />

            <PairSetting data={[
                { settingsKey: "buttonOneText", label: "Button1 Text", isValid: makeValidator(31) },
                { settingsKey: "buttonOneURL", label: "Button1 URL", isValid: isUrlValid },
            ]} />
            <PairSetting data={[
                { settingsKey: "buttonTwoText", label: "Button2 Text", isValid: makeValidator(31) },
                { settingsKey: "buttonTwoURL", label: "Button2 URL", isValid: isUrlValid },
            ]} />

            <Divider />

            <SelectSetting
                settingsKey="timestampMode"
                label="Timestamp Mode"
                options={[
                    {
                        label: "None",
                        value: TimestampMode.NONE,
                        default: true
                    },
                    {
                        label: "Since discord open",
                        value: TimestampMode.NOW
                    },
                    {
                        label: "Same as your current time (not reset after 24h)",
                        value: TimestampMode.TIME
                    },
                    {
                        label: "Custom",
                        value: TimestampMode.CUSTOM
                    }
                ]}
            />

            <PairSetting data={[
                {
                    settingsKey: "startTime",
                    label: "Start Timestamp (in milliseconds)",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: s.timestampMode !== TimestampMode.CUSTOM,
                },
                {
                    settingsKey: "endTime",
                    label: "End Timestamp (in milliseconds)",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: s.timestampMode !== TimestampMode.CUSTOM,
                },
            ]} />
        </div>
    );
}
