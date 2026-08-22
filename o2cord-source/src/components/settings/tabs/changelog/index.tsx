/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { ErrorCard } from "@components/ErrorCard";
import { Heading } from "@components/Heading";
import { DeleteIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { HashLink } from "@components/settings/tabs/updater/Components";
import { Margins } from "@utils/margins";
import { UpdateLogger } from "@utils/updater";
import { Alerts, React, Toasts } from "@webpack/common";

import gitHash from "~git-hash";

import {
    ChangelogEntry,
    ChangelogHistory,
    clearChangelogHistory,
    clearIndividualLog,
    formatTimestamp,
    getChangelogHistory,
    getCommitsSinceLastSeen,
    getLastRepositoryCheckHash,
    getNewPlugins,
    getNewSettings,
    getNewSettingsEntries,
    getNewSettingsSize,
    getUpdatedPlugins,
    initializeChangelog,
    saveUpdateSession,
    UpdateSession,
} from "./changelogManager";
import { NewPluginsCompact, NewPluginsSection } from "./NewPluginsSection";

// o2cord's update source is a manifest.json URL, not a github.com repo URL, so
// we point commit links / the repository-comparison lookup at the real repo
// directly rather than trying to derive it from the manifest URL.
const REPO_URL = "https://github.com/2VTA/o2cord";

function ChangelogCard({
    entry,
}: {
    entry: ChangelogEntry;
}) {
    return (
        <Card className="vc-changelog-entry">
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25em",
                }}
            >
                <div className="vc-changelog-entry-header">
                    <code className="vc-changelog-entry-hash">
                        <HashLink repo={REPO_URL} hash={entry.hash} />
                    </code>
                    <span className="vc-changelog-entry-author">
                        by {entry.author}
                    </span>
                </div>
                <div className="vc-changelog-entry-message">
                    {entry.message}
                </div>
            </div>
        </Card>
    );
}

function UpdateLogCard({
    log,
    isExpanded,
    onToggleExpand,
    onClearLog,
}: {
    log: UpdateSession;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onClearLog: (logId: string) => void;
}) {
    const isRepositoryFetch =
        log.type === "repository_fetch" ||
        (log.type === undefined &&
            log.fromHash === log.toHash &&
            log.commits.length === 0);
    const isUpToDate = log.fromHash === log.toHash;

    return (
        <Card className="vc-changelog-log">
            <div className="vc-changelog-log-header" onClick={onToggleExpand}>
                <div className="vc-changelog-log-info">
                    <div className="vc-changelog-log-title">
                        <span>
                            {isRepositoryFetch
                                ? isUpToDate
                                    ? `Repository check: ${log.fromHash.slice(0, 7)} (up to date)`
                                    : `Repository check: ${log.fromHash.slice(0, 7)} → ${log.toHash.slice(0, 7)}`
                                : `Update: ${log.fromHash.slice(0, 7)} → ${log.toHash.slice(0, 7)}`}
                        </span>
                        <Button
                            size="min"
                            variant="secondary"
                            className="vc-changelog-delete-button"
                            style={{
                                padding: "4px",
                                color: "var(--status-danger)",
                                opacity: 0.6,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                            onClick={e => {
                                e.stopPropagation();
                                onClearLog(log.id);
                            }}
                        >
                            <DeleteIcon width={16} height={16} />
                        </Button>
                    </div>
                    <div className="vc-changelog-log-meta">
                        {formatTimestamp(log.timestamp)}
                        {log.commits.length > 0 &&
                            ` • ${log.commits.length} commits available`}
                        {log.commits.length === 0 && " • No new commits"}
                        {log.newPlugins.length > 0 &&
                            ` • ${log.newPlugins.length} new plugins`}
                        {log.updatedPlugins.length > 0 &&
                            ` • ${log.updatedPlugins.length} updated plugins`}
                        {log.newSettings &&
                            getNewSettingsSize(log.newSettings) > 0 &&
                            ` • ${getNewSettingsEntries(log.newSettings).reduce((sum, [, arr]) => sum + arr.length, 0)} new settings`}
                    </div>
                </div>
                <div
                    className={`vc-changelog-log-toggle ${isExpanded ? "expanded" : ""}`}
                >
                    ▼
                </div>
            </div>

            {isExpanded && (
                <div className="vc-changelog-log-content">
                    {log.newPlugins.length > 0 && (
                        <div className="vc-changelog-log-plugins">
                            <NewPluginsCompact
                                newPlugins={log.newPlugins}
                                maxDisplay={50}
                            />
                        </div>
                    )}

                    {log.updatedPlugins.length > 0 && (
                        <div className="vc-changelog-log-plugins">
                            <Heading className={Margins.bottom8}>
                                Updated Plugins
                            </Heading>
                            <NewPluginsCompact
                                newPlugins={log.updatedPlugins}
                                maxDisplay={50}
                            />
                        </div>
                    )}

                    {log.newSettings &&
                        getNewSettingsSize(log.newSettings) > 0 && (
                            <div className="vc-changelog-log-plugins">
                                <Heading className={Margins.bottom8}>
                                    New Settings
                                </Heading>
                                <div className="vc-changelog-new-plugins-list">
                                    {getNewSettingsEntries(log.newSettings).map(
                                        ([pluginName, settings]) =>
                                            settings.map(setting => (
                                                <span
                                                    key={`${pluginName}-${setting}`}
                                                    className="vc-changelog-new-plugin-tag"
                                                    title={`New setting in ${pluginName}`}
                                                >
                                                    {pluginName}.{setting}
                                                </span>
                                            )),
                                    )}
                                </div>
                            </div>
                        )}

                    {log.commits.length > 0 && (
                        <div className="vc-changelog-log-commits">
                            <div className="vc-changelog-log-commits-list">
                                {log.commits.map(entry => (
                                    <ChangelogCard
                                        key={entry.hash}
                                        entry={entry}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}

function ChangelogContent() {
    const [changelog, setChangelog] = React.useState<ChangelogEntry[]>([]);
    const [changelogHistory, setChangelogHistory] =
        React.useState<ChangelogHistory>([]);
    const [newPlugins, setNewPlugins] = React.useState<string[]>([]);
    const [updatedPlugins, setUpdatedPlugins] = React.useState<string[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [expandedLogs, setExpandedLogs] = React.useState<Set<string>>(
        new Set(),
    );
    const [showHistory, setShowHistory] = React.useState(false);
    const [recentlyChecked, setRecentlyChecked] = React.useState(false);

    React.useEffect(() => {
        const init = async () => {
            try {
                await initializeChangelog();
                await loadChangelogHistory();
            } catch (err) {
                console.error("Failed to initialize changelog:", err);
            }
        };
        init();
    }, []);

    const loadChangelogHistory = React.useCallback(async () => {
        try {
            const history = await getChangelogHistory();
            setChangelogHistory(history);
        } catch (err) {
            console.error("Failed to load changelog history:", err);
        }
    }, []);

    const loadNewPlugins = React.useCallback(async () => {
        try {
            const newPlgs = await getNewPlugins();
            const updatedPlgs = await getUpdatedPlugins();
            setNewPlugins(newPlgs);
            setUpdatedPlugins(updatedPlgs);
        } catch (err) {
            console.error("Failed to load new plugins:", err);
        }
    }, []);

    const ensureLocalUpdateLogged = React.useCallback(async () => {
        try {
            const commits = await getCommitsSinceLastSeen();
            if (commits.length === 0) return false;

            const newPlgs = await getNewPlugins();
            const updatedPlgs = await getUpdatedPlugins();
            const newSettings = await getNewSettings();

            await saveUpdateSession(commits, newPlgs, updatedPlgs, newSettings);

            setChangelog(commits);
            setNewPlugins(newPlgs);
            setUpdatedPlugins(updatedPlgs);
            await loadChangelogHistory();
            return true;
        } catch (err) {
            console.error("Failed to log local update:", err);
            return false;
        }
    }, [loadChangelogHistory]);

    // check if the repository was recently refreshed
    React.useEffect(() => {
        const checkRecentStatus = async () => {
            try {
                const lastRepoCheck = await getLastRepositoryCheckHash();
                const updates = await VencordNative.updater.getUpdates();

                if (updates.ok) {
                    const currentRepoHash =
                        updates.value.length > 0
                            ? updates.value[0].hash
                            : gitHash;
                    setRecentlyChecked(lastRepoCheck === currentRepoHash);
                }
            } catch (err) {
                setRecentlyChecked(false);
            }
        };

        checkRecentStatus();
    }, []);

    const fetchChangelog = React.useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            // check if the repository was recently refreshed and that nothing has changed
            const updates = await VencordNative.updater.getUpdates();
            const lastRepoCheck = await getLastRepositoryCheckHash();
            const currentRepoHash =
                updates.ok && updates.value.length > 0
                    ? updates.value[0].hash
                    : gitHash;

            // If repository state hasn't changed since last check
            if (lastRepoCheck === currentRepoHash) {
                setIsLoading(false);
                setRecentlyChecked(true);
                const logged = await ensureLocalUpdateLogged();
                if (!logged) {
                    setChangelog([]);
                    Toasts.show({
                        message: "Already up to date with repository",
                        id: Toasts.genId(),
                        type: Toasts.Type.MESSAGE,
                        options: {
                            position: Toasts.Position.BOTTOM,
                        },
                    });
                }
                return;
            }

            if (updates.ok && updates.value) {
                if (updates.value.length > 0) {
                    setChangelog(updates.value);

                    const newPlgs = await getNewPlugins();
                    const updatedPlgs = await getUpdatedPlugins();
                    const newSettings = await getNewSettings();
                    setNewPlugins(newPlgs);
                    setUpdatedPlugins(updatedPlgs);

                    await saveUpdateSession(
                        updates.value,
                        newPlgs,
                        updatedPlgs,
                        newSettings,
                        true,
                    );
                    await loadChangelogHistory();
                    setRecentlyChecked(true);

                    Toasts.show({
                        message: `Found ${updates.value.length} update${updates.value.length === 1 ? "" : "s"} from o2cord`,
                        id: Toasts.genId(),
                        type: Toasts.Type.SUCCESS,
                        options: {
                            position: Toasts.Position.BOTTOM,
                        },
                    });
                } else {
                    const logged = await ensureLocalUpdateLogged();
                    setRecentlyChecked(true);
                    Toasts.show({
                        message: logged
                            ? "Logged commits from your latest update"
                            : "o2cord is up to date",
                        id: Toasts.genId(),
                        type: logged ? Toasts.Type.SUCCESS : Toasts.Type.MESSAGE,
                        options: {
                            position: Toasts.Position.BOTTOM,
                        },
                    });
                    if (!logged) {
                        setChangelog([]);
                    }
                }
            } else if (!updates.ok) {
                throw new Error(
                    updates.error?.message || "Failed to check for updates",
                );
            }
        } catch (err: any) {
            UpdateLogger.error("Failed to fetch o2cord update info", err);
            const errorMessage =
                err?.message ||
                "Failed to check for updates. Check your internet connection.";
            setError(errorMessage);

            Toasts.show({
                message: "Could not check for updates",
                id: Toasts.genId(),
                type: Toasts.Type.FAILURE,
                options: {
                    position: Toasts.Position.BOTTOM,
                },
            });
        } finally {
            setIsLoading(false);
        }
    }, [loadNewPlugins, loadChangelogHistory, ensureLocalUpdateLogged]);

    React.useEffect(() => {
        const loadInitialData = async () => {
            await loadNewPlugins();
            const logged = await ensureLocalUpdateLogged();
            if (!logged) {
                await fetchChangelog();
            } else {
                setIsLoading(false);
            }
        };
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleLogExpanded = (logId: string) => {
        const newExpanded = new Set(expandedLogs);
        if (newExpanded.has(logId)) {
            newExpanded.delete(logId);
        } else {
            newExpanded.add(logId);
        }
        setExpandedLogs(newExpanded);
    };

    const hasCurrentChanges =
        changelog.length > 0 ||
        newPlugins.length > 0 ||
        updatedPlugins.length > 0;

    return (
        <>
            <Heading className={Margins.top16}>Fetch Changes</Heading>
            <Paragraph className={Margins.bottom16}>
                Check for new o2cord updates, plugin additions, and new settings. This compares your current version with the latest available and shows you what's new.
            </Paragraph>

            <div className="vc-changelog-controls">
                <Button
                    size="small"
                    disabled={isLoading}
                    onClick={fetchChangelog}
                    variant={recentlyChecked ? "positive" : "primary"}
                >
                    {isLoading
                        ? "Loading..."
                        : recentlyChecked
                            ? "o2cord Up to Date"
                            : "Check for Updates"}
                </Button>

                {changelogHistory.length > 0 && (
                    <>
                        <Button
                            size="small"
                            variant={showHistory ? "primary" : "secondary"}
                            onClick={() => setShowHistory(!showHistory)}
                            style={{ marginLeft: "8px" }}
                        >
                            {showHistory ? "Hide Logs" : "Show Logs"}
                        </Button>
                        <Button
                            size="small"
                            variant="dangerPrimary"
                            onClick={() => {
                                Alerts.show({
                                    title: "Clear All Logs",
                                    body: "Are you sure you would like to clear all logs? This can't be undone.",
                                    confirmText: "Clear All",
                                    confirmColor: "danger",
                                    cancelText: "Cancel",
                                    onConfirm: async () => {
                                        await clearChangelogHistory();
                                        await loadChangelogHistory();
                                        setShowHistory(false);
                                        Toasts.show({
                                            message: "All logs have been cleared",
                                            id: Toasts.genId(),
                                            type: Toasts.Type.SUCCESS,
                                            options: {
                                                position: Toasts.Position.BOTTOM,
                                            },
                                        });
                                    },
                                });
                            }}
                            style={{ marginLeft: "8px" }}
                        >
                            Clear All Logs
                        </Button>
                    </>
                )}
            </div>

            {error && (
                <ErrorCard style={{ padding: "1em", marginTop: "1em" }}>
                    <Paragraph>{error}</Paragraph>
                    <Paragraph color="text-subtle" style={{ marginTop: "0.5em" }}>
                        Make sure you have an internet connection and try again.
                    </Paragraph>
                </ErrorCard>
            )}

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>Repository</Heading>
            <Paragraph className={Margins.bottom8}>
                This is the GitHub repository o2cord is published from.
            </Paragraph>
            <Paragraph color="text-subtle">
                <Link href={REPO_URL}>
                    {REPO_URL.replace("https://github.com/", "")}
                </Link>
                {" "}(<HashLink repo={REPO_URL} hash={gitHash} />)
            </Paragraph>

            {hasCurrentChanges && (
                <>
                    <Divider className={Margins.top20} />

                    <Heading className={Margins.top20}>Recent Changes</Heading>
                    <Paragraph className={Margins.bottom16}>
                        These are the new updates and plugin additions since your last version.
                    </Paragraph>

                    {newPlugins.length > 0 && (
                        <div className={Margins.bottom16}>
                            <NewPluginsSection
                                newPlugins={newPlugins}
                                onPluginToggle={() => { }}
                            />
                        </div>
                    )}

                    {updatedPlugins.length > 0 && (
                        <div className={Margins.bottom16}>
                            <Heading className={Margins.bottom8}>
                                Updated Plugins ({updatedPlugins.length})
                            </Heading>
                            <NewPluginsCompact newPlugins={updatedPlugins} />
                        </div>
                    )}

                    {changelog.length > 0 && (
                        <div>
                            <Heading className={Margins.bottom8}>
                                Update Notes ({changelog.length} {changelog.length === 1 ? "entry" : "entries"})
                            </Heading>
                            <div className="vc-changelog-commits-list">
                                {changelog.map(entry => (
                                    <ChangelogCard
                                        key={entry.hash}
                                        entry={entry}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {!hasCurrentChanges && !isLoading && !error && (
                <>
                    <Divider className={Margins.top20} />
                    <Heading className={Margins.top20}>Recent Changes</Heading>
                    <Paragraph color="text-subtle">
                        No updates available ahead of your current version. Click "Check for Updates" to check again.
                    </Paragraph>
                </>
            )}

            {showHistory && changelogHistory.length > 0 && (
                <>
                    <Divider className={Margins.top20} />

                    <Heading className={Margins.top20}>
                        Update Logs ({changelogHistory.length} {changelogHistory.length === 1 ? "log" : "logs"})
                    </Heading>
                    <Paragraph className={Margins.bottom16}>
                        A history of your previous update sessions with their notes and plugin changes. Click on a log to expand it and see the details.
                    </Paragraph>

                    <div className="vc-changelog-history-list">
                        {changelogHistory.map(log => (
                            <UpdateLogCard
                                key={log.id}
                                log={log}
                                isExpanded={expandedLogs.has(log.id)}
                                onToggleExpand={() => toggleLogExpanded(log.id)}
                                onClearLog={logId => {
                                    Alerts.show({
                                        title: "Clear Log",
                                        body: "Are you sure you would like to clear this log? This can't be undone.",
                                        confirmText: "Clear Log",
                                        confirmColor: "danger",
                                        cancelText: "Cancel",
                                        onConfirm: async () => {
                                            await clearIndividualLog(logId);
                                            await loadChangelogHistory();
                                            setExpandedLogs(
                                                new Set(
                                                    Array.from(expandedLogs).filter(id => id !== logId),
                                                ),
                                            );
                                            Toasts.show({
                                                message: "Log has been cleared",
                                                id: Toasts.genId(),
                                                type: Toasts.Type.SUCCESS,
                                                options: {
                                                    position: Toasts.Position.BOTTOM,
                                                },
                                            });
                                        },
                                    });
                                }}
                            />
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

function ChangelogTab() {
    return (
        <SettingsTab>
            <ChangelogContent />
        </SettingsTab>
    );
}

export default wrapTab(ChangelogTab, "Changelog");
