/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { checkForUpdates, getRepo, update as runUpdate } from "@utils/updater";
import { Forms, React, Toasts } from "@webpack/common";

import gitHash from "~git-hash";

// Errors thrown by the main process cross IPC as plain objects (prototypes
// don't survive), so `instanceof Error` fails on them even though they carry
// a real .message - that was silently swallowing the actual failure reason
// behind a generic "Could not check for updates." with no diagnostic value.
function describeUpdaterError(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "message" in error && typeof (error as any).message === "string")
        return (error as any).message;
    if (typeof error === "string") return error;
    return fallback;
}

function openO2cordFolder() {
    VencordNative.native.openO2cordFolder().catch(() => {
        Toasts.show({
            message: "Could not open the o2cord folder.",
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE,
            options: {
                position: Toasts.Position.BOTTOM
            }
        });
    });
}

function Updater() {
    const [source, setSource] = React.useState("");
    const [status, setStatus] = React.useState("Ready.");
    const [checking, setChecking] = React.useState(false);
    const [updating, setUpdating] = React.useState(false);
    const [hasUpdate, setHasUpdate] = React.useState(false);

    React.useEffect(() => {
        getRepo().then(setSource).catch(() => setSource("No update source configured."));
    }, []);

    React.useEffect(() => {
        if (O2CORD_UPDATE_MANIFEST) check();
    }, []);

    async function check() {
        setChecking(true);
        setStatus("Checking for updates...");

        try {
            const outdated = await checkForUpdates();
            setHasUpdate(outdated);
            setStatus(outdated ? "Update available." : "You are up to date.");
        } catch (error) {
            setStatus(describeUpdaterError(error, "Could not check for updates."));
        } finally {
            setChecking(false);
        }
    }

    async function apply() {
        setUpdating(true);
        setStatus("Downloading update...");

        try {
            const updated = await runUpdate();
            if (!updated) {
                setStatus("No update was available.");
                setHasUpdate(false);
                return;
            }

            setStatus("Update installed. Relaunch Discord to finish.");
            setHasUpdate(false);
            Toasts.show({
                message: "o2cord update installed. Relaunch Discord to finish.",
                id: Toasts.genId(),
                type: Toasts.Type.SUCCESS
            });
        } catch (error) {
            setStatus(describeUpdaterError(error, "Could not install update."));
        } finally {
            setUpdating(false);
        }
    }

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h5">o2cord Updater</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom20}>
                Check and install updates from the o2cord update manifest.
            </Forms.FormText>

            <Card variant="info">
                <HeadingSecondary>Installed Build</HeadingSecondary>
                <Paragraph>Version: {VERSION}</Paragraph>
                <Paragraph>Build: {gitHash}</Paragraph>
                <Paragraph>Mode: {O2CORD_DEBUG ? "Private Debug" : "Public Build"}</Paragraph>
                <Paragraph>Source: {source || "Loading..."}</Paragraph>
                <Paragraph>Status: {status}</Paragraph>
            </Card>

            <Flex className={Margins.top20} flexDirection="column" gap="0.75em">
                <Button onClick={check} disabled={checking || updating || !O2CORD_UPDATE_MANIFEST}>
                    {checking ? "Checking..." : "Check for Updates"}
                </Button>
                <Button onClick={apply} disabled={checking || updating || !hasUpdate}>
                    {updating ? "Updating..." : "Install Update"}
                </Button>
                <Button onClick={openO2cordFolder}>
                    Open o2cord Folder
                </Button>
                <Button variant="secondary" onClick={relaunch}>
                    Relaunch Discord
                </Button>
            </Flex>
        </SettingsTab>
    );
}

export default IS_UPDATER_DISABLED
    ? null
    : wrapTab(Updater, "Updater");
