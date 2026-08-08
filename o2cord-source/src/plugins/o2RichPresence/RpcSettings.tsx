/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { resolveError } from "@components/settings/tabs/plugins/components/Common";
import { classNameFactory } from "@utils/css";
import { ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, Button, closeModal, Modal, openModal, Select, Text, TextInput, Toasts, useEffect, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { markUpdated, setRpc, settings, StatusDisplayType, TimestampMode } from ".";

const cl = classNameFactory("vc-o2rpc-settings-");

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

function isStreamLinkValid(value: string) {
    if (settings.store.type === ActivityType.STREAMING && !/https?:\/\/(www\.)?(twitch\.tv|youtube\.com)\/\w+/.test(value)) return "Streaming link must be a valid URL.";
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

function TimestampSection() {
    const s = settings.use();

    const options = [
        { value: TimestampMode.NONE, label: "None" },
        { value: TimestampMode.SINCE_START, label: "Since last connection" },
        { value: TimestampMode.SINCE_UPDATE, label: "Since last presence update" },
        { value: TimestampMode.LOCAL_TIME, label: "Your local time" },
        { value: TimestampMode.CUSTOM, label: "Custom timestamp" }
    ];

    return (
        <div className={cl("timestamp")}>
            <Heading tag="h5">Timestamp</Heading>
            {options.map(opt => (
                <label key={opt.value} className={cl("radio-row")}>
                    <input
                        type="radio"
                        name="o2rpc-timestamp-mode"
                        checked={(s.timestampMode ?? TimestampMode.NONE) === opt.value}
                        onChange={() => { settings.store.timestampMode = opt.value; markUpdated(); }}
                    />
                    {opt.label}
                </label>
            ))}

            {s.timestampMode === TimestampMode.CUSTOM && (
                <div className={cl("pair", "timestamp-custom")}>
                    <SingleSetting
                        settingsKey="startTime" label="Start Timestamp (in milliseconds)"
                        transform={parseNumber} isValid={isNumberValid}
                    />
                    <SingleSetting
                        settingsKey="endTime" label="End Timestamp (in milliseconds)"
                        transform={parseNumber} isValid={isNumberValid}
                    />
                </div>
            )}
        </div>
    );
}

function ImageGroup({ title, keySettingsKey, textSettingsKey, urlSettingsKey }: {
    title: string;
    keySettingsKey: SettingsKey;
    textSettingsKey: SettingsKey;
    urlSettingsKey: SettingsKey;
}) {
    return (
        <div className={cl("image-group")}>
            <Heading tag="h5">{title}</Heading>
            <div className={cl("pair")}>
                <SingleSetting
                    settingsKey={keySettingsKey} label="Key"
                    isValid={isImageKeyValid}
                    action={<BrowseAssetsButton settingsKey={keySettingsKey} />}
                />
                <SingleSetting settingsKey={textSettingsKey} label="Text" isValid={maxLength128} />
            </div>
            <SingleSetting settingsKey={urlSettingsKey} label="URL" isValid={isUrlValid} />
        </div>
    );
}

function ActionButtons() {
    return (
        <div className={cl("actions")}>
            <Button onClick={() => setRpc()}>Connect</Button>
            <Button color={Button.Colors.RED} onClick={() => setRpc(true)}>Disconnect</Button>
            <Button onClick={() => markUpdated()}>Update Presence</Button>
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
            markUpdated();
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

function SelectSetting<T>({ settingsKey, label, options, disabled }: SelectOption<T>) {
    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <Select
                placeholder={"Select an option"}
                options={options}
                maxVisibleItems={5}
                closeOnSelect={true}
                select={v => { settings.store[settingsKey] = v; markUpdated(); }}
                isSelected={v => v === settings.store[settingsKey]}
                serialize={v => String(v)}
                isDisabled={disabled}
            />
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
            Toasts.show({ message: "Set an Application ID first.", id: Toasts.genId(), type: Toasts.Type.FAILURE });
            return;
        }

        openAssetPicker(appID, name => {
            settings.store[settingsKey] = name as any;
            markUpdated();
        });
    }

    return (
        <Button size={Button.Sizes.SMALL} disabled={disabled} onClick={open}>
            Browse Assets
        </Button>
    );
}

export function RPCSettings() {
    const s = settings.use();

    return (
        <div className={cl("root")}>
            <div className={cl("triple")}>
                <SingleSetting settingsKey="appID" label="ID" isValid={isAppIdValid} />
                <SelectSetting
                    settingsKey="type"
                    label="Type"
                    options={[
                        { label: "Playing", value: ActivityType.PLAYING, default: true },
                        { label: "Streaming", value: ActivityType.STREAMING },
                        { label: "Listening", value: ActivityType.LISTENING },
                        { label: "Watching", value: ActivityType.WATCHING },
                        { label: "Competing", value: ActivityType.COMPETING }
                    ]}
                />
                <SelectSetting
                    settingsKey="displayType"
                    label="Display"
                    options={[
                        { label: "Name", value: StatusDisplayType.NAME, default: true },
                        { label: "Details", value: StatusDisplayType.DETAILS },
                        { label: "State", value: StatusDisplayType.STATE }
                    ]}
                />
            </div>

            <SingleSetting settingsKey="name" label="Name" isValid={makeValidator(128, true)} />

            <PairSetting data={[
                { settingsKey: "details", label: "Details", isValid: maxLength128 },
                { settingsKey: "detailsURL", label: "URL", isValid: isUrlValid },
            ]} />

            <PairSetting data={[
                { settingsKey: "state", label: "State", isValid: maxLength128 },
                { settingsKey: "stateURL", label: "URL", isValid: isUrlValid },
            ]} />

            <SingleSetting
                settingsKey="streamLink"
                label="Stream Link (Twitch or YouTube, only if Type is Streaming)"
                disabled={s.type !== ActivityType.STREAMING}
                isValid={isStreamLinkValid}
            />

            <PairSetting data={[
                {
                    settingsKey: "partySize", label: "Party",
                    transform: parseNumber, isValid: isNumberValid,
                    disabled: s.type !== ActivityType.PLAYING,
                },
                {
                    settingsKey: "partyMaxSize", label: "of",
                    transform: parseNumber, isValid: isNumberValid,
                    disabled: s.type !== ActivityType.PLAYING,
                },
            ]} />

            <Divider />

            <TimestampSection />

            <Divider />

            <ImageGroup title="Large Image" keySettingsKey="imageBig" textSettingsKey="imageBigTooltip" urlSettingsKey="imageBigURL" />
            <ImageGroup title="Small Image" keySettingsKey="imageSmall" textSettingsKey="imageSmallTooltip" urlSettingsKey="imageSmallURL" />

            <Divider />

            <PairSetting data={[
                { settingsKey: "buttonOneText", label: "Button 1 Text", isValid: makeValidator(31) },
                { settingsKey: "buttonOneURL", label: "Button 1 URL", isValid: isUrlValid },
            ]} />
            <PairSetting data={[
                { settingsKey: "buttonTwoText", label: "Button 2 Text", isValid: makeValidator(31) },
                { settingsKey: "buttonTwoURL", label: "Button 2 URL", isValid: isUrlValid },
            ]} />

            <Divider />

            <ActionButtons />
        </div>
    );
}
