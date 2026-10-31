/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";
import "./o2Plugins.css";

import * as DataStore from "@api/DataStore";
import { isPluginEnabled } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { isTruthy } from "@utils/guards";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { DEBUG_ONLY_PLUGINS } from "@utils/o2Debug";
import { isLoadedExtraPlugin, isPluginHidden } from "@utils/o2TestPlugins";
import { useAwaiter, useCleanupEffect } from "@utils/react";
import { PluginTag, PluginTags } from "@utils/types";
import { Clickable, ConfirmModal, lodash, openModal, Parser, React, SearchableSelect, TextInput, Tooltip, useMemo, useRef, useState } from "@webpack/common";
import { JSX } from "react";

import Plugins, { ExcludedPlugins, PluginMeta } from "~plugins";

import { PluginCard } from "./PluginCard";
import { UIElementsModal } from "./UIElements";

export const cl = classNameFactory("vc-plugins-");
export const logger = new Logger("PluginSettings", "#a6d189");

// o2cord: only shown when something actually needs a restart.
function ReloadRequiredCard({ required }: { required: boolean; }) {
    if (!required) return null;
    return (
        <div className="o2s-hero o2s-restart">
            <div className="o2s-grow">
                <div className="o2s-row-title">Restart to finish</div>
                <div className="o2s-muted">Some plugins you turned on or off need a restart</div>
            </div>
            <Clickable className="o2s-btn o2s-btn-on" onClick={() => location.reload()}>Restart</Clickable>
        </div>
    );
}

const enum SearchStatus {
    ALL,
    ENABLED,
    DISABLED,
    NEW,
    USER_PLUGINS,
    API_PLUGINS,
    O2_PLUGINS
}

// "Show o2Plugins" used to just check authors.includes(Devs.Ryder), which
// matched 78 plugins - most of them ordinary ported/customized community
// plugins Ryder is credited on, not the curated set he actually wants this
// filter to surface. Explicit allowlist instead, independent of authorship
// credit (removing a plugin from here doesn't touch its real authors).
const O2_PLUGIN_NAMES = new Set([
    "ussro2Public",
    "ProfileTheme",
    "CustomProfile",
    "NitroServer",
    "FakePlaying",
    "O2Presence",
    "AntiMoveDeco",
    "AppIcon",
    "CustomTyping",
    "Nameplate",
    "ProfileImages",
    "Widget",
    "RetroTerminal",
    "VHS",
    "o2Settings",
    "O2WhatsNew",
    "O2WindowControls",
    "CallieRequests",
    "ProfileSong"
]);

function ExcludedPluginsList({ search }: { search: string; }) {
    const matchingExcludedPlugins = search
        ? Object.entries(ExcludedPlugins)
            .filter(([name]) => name.toLowerCase().includes(search))
        : [];

    const ExcludedReasons: Record<"web" | "discordDesktop" | "vesktop" | "desktop" | "dev", string> = {
        desktop: "Discord Desktop app or Vesktop",
        discordDesktop: "Discord Desktop app",
        vesktop: "Vesktop app",
        web: "Vesktop app and the Web version of Discord",
        dev: "Developer version of o2cord"
    };

    return (
        <Paragraph className={Margins.top16}>
            {matchingExcludedPlugins.length
                ? <>
                    <Paragraph>Are you looking for:</Paragraph>
                    <ul>
                        {matchingExcludedPlugins.map(([name, reason]) => (
                            <li key={name}>
                                <b>{name}</b>: Only available on the {ExcludedReasons[reason]}
                            </li>
                        ))}
                    </ul>
                </>
                : "No plugins meet the search criteria."
            }
        </Paragraph>
    );
}

function PluginSettings() {
    const settings = useSettings();
    const changeRef = useRef<ChangeList<string>>(null);
    const changes = changeRef.current ??= new ChangeList<string>();

    useCleanupEffect(() => {
        if (changes.hasChanges)
            openModal(props => (
                <ConfirmModal
                    {...props}
                    title="Restart required"
                    confirmText="Restart now"
                    cancelText="Later!"
                    variant="primary"
                    onConfirm={() => location.reload()}
                >
                    <>
                        <p>The following plugins require a restart:</p>
                        <div>{changes.map((s, i) => (
                            <>
                                {i > 0 && ", "}
                                {Parser.parse("`" + s.split(".")[0] + "`")}
                            </>
                        ))}</div>
                    </>
                </ConfirmModal>
            ));
    }, []);

    const depMap = useMemo(() => {
        const o = {} as Record<string, string[]>;
        for (const plugin in Plugins) {
            const deps = Plugins[plugin].dependencies;
            if (deps) {
                for (const dep of deps) {
                    o[dep] ??= [];
                    o[dep].push(plugin);
                }
            }
        }
        return o;
    }, []);

    const sortedPlugins = useMemo(() =>
        Object.values(Plugins).sort((a, b) => a.name.localeCompare(b.name)),
        []
    );

    const hasUserPlugins = useMemo(() => !IS_STANDALONE && Object.values(PluginMeta).some(m => m.userPlugin), []);

    const [searchValue, setSearchValue] = useState({ value: "", tags: [] as PluginTag[], status: SearchStatus.ALL });
    const [showRequired, setShowRequired] = useState(false);

    const search = searchValue.value.toLowerCase();
    const onSearch = (query: string) => setSearchValue(prev => ({ ...prev, value: query }));

    const pluginFilter = (plugin: typeof Plugins[keyof typeof Plugins]) => {
        const { status, tags } = searchValue;

        // managed only from debug o2 / hidden there on this device
        if (DEBUG_ONLY_PLUGINS.has(plugin.name) || isPluginHidden(plugin.name)) return false;

        switch (status) {
            case SearchStatus.DISABLED:
                if (isPluginEnabled(plugin.name)) return false;
                break;
            case SearchStatus.ENABLED:
                if (!isPluginEnabled(plugin.name)) return false;
                break;
            case SearchStatus.NEW:
                if (!newPlugins?.includes(plugin.name)) return false;
                break;
            case SearchStatus.USER_PLUGINS:
                if (!PluginMeta[plugin.name]?.userPlugin) return false;
                break;
            case SearchStatus.API_PLUGINS:
                if (!plugin.name.endsWith("API")) return false;
                break;
            case SearchStatus.O2_PLUGINS:
                if (!O2_PLUGIN_NAMES.has(plugin.name) && !isLoadedExtraPlugin(plugin.name)) return false;
                break;
        }

        if (tags.length && tags.some(t => !plugin.tags?.includes(t))) return false;

        if (!search.length) return true;

        return (
            plugin.name.toLowerCase().includes(search) ||
            plugin.name.match(/[A-Z]/g)?.join("").toLowerCase().includes(search) || // acronyms like BF for BetterFolders
            plugin.description.toLowerCase().includes(search) ||
            plugin.searchTerms?.some(t => t.toLowerCase().includes(search))
        );
    };

    const [newPlugins] = useAwaiter(() => DataStore.get("Vencord_existingPlugins").then((cachedPlugins: Record<string, number> | undefined) => {
        const now = Date.now() / 1000;
        const existingTimestamps: Record<string, number> = {};
        const sortedPluginNames = Object.values(sortedPlugins).map(plugin => plugin.name);

        const newPlugins: string[] = [];
        for (const { name: p } of sortedPlugins) {
            const time = existingTimestamps[p] = cachedPlugins?.[p] ?? now;
            if ((time + 60 * 60 * 24 * 2) > now) {
                newPlugins.push(p);
            }
        }
        DataStore.set("Vencord_existingPlugins", existingTimestamps);

        return lodash.isEqual(newPlugins, sortedPluginNames) ? [] : newPlugins;
    }));

    const plugins = [] as JSX.Element[];
    const requiredPlugins = [] as JSX.Element[];

    const showApi = searchValue.status === SearchStatus.API_PLUGINS;
    for (const p of sortedPlugins) {
        if (p.hidden || (!p.settings && p.name.endsWith("API") && !showApi))
            continue;

        if (!pluginFilter(p)) continue;

        const isRequired = p.required || p.isDependency || depMap[p.name]?.some(d => settings.plugins[d].enabled);

        if (isRequired) {
            const tooltipText = p.required || !depMap[p.name]
                ? "This plugin is required for Vencord to function."
                : makeDependencyList(depMap[p.name]?.filter(d => settings.plugins[d].enabled));

            requiredPlugins.push(
                <Tooltip text={tooltipText} key={p.name}>
                    {({ onMouseLeave, onMouseEnter }) => (
                        <PluginCard
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            onRestartNeeded={(name, key) => changes.handleChange(`${name}.${key}`)}
                            disabled={true}
                            plugin={p}
                            key={p.name}
                        />
                    )}
                </Tooltip>
            );
        } else {
            plugins.push(
                <PluginCard
                    onRestartNeeded={(name, key) => changes.handleChange(`${name}.${key}`)}
                    disabled={false}
                    plugin={p}
                    isNew={newPlugins?.includes(p.name)}
                    key={p.name}
                />
            );
        }
    }

    const visible = sortedPlugins.filter(p => !p.hidden && !DEBUG_ONLY_PLUGINS.has(p.name) && !isPluginHidden(p.name) && !(p.name.endsWith("API") && !p.settings));
    const onCount = visible.filter(p => isPluginEnabled(p.name)).length;
    const chips = [
        { label: "All", value: SearchStatus.ALL },
        { label: "On", value: SearchStatus.ENABLED },
        { label: "Off", value: SearchStatus.DISABLED },
        { label: "New", value: SearchStatus.NEW },
        { label: "o2cord", value: SearchStatus.O2_PLUGINS },
        hasUserPlugins && { label: "User plugins", value: SearchStatus.USER_PLUGINS },
        { label: "API", value: SearchStatus.API_PLUGINS }
    ].filter(isTruthy);

    return (
        <SettingsTab>
            <div className="o2s-page o2s-plugins">
                <ReloadRequiredCard required={changes.hasChanges} />

                <div className="o2s-plugins-head">
                    <div className="o2s-grow">
                        <div className="o2s-hero-title">Plugins</div>
                        <div className="o2s-muted">{onCount} of {visible.length} on · the cog on a card opens its settings</div>
                    </div>
                    <Clickable className="o2s-btn" onClick={() => openModal(modalProps => <UIElementsModal {...modalProps} />)}>Hide plugin buttons</Clickable>
                </div>

                <ErrorBoundary noop>
                    <TextInput
                        inputClassName={cl("filter-control")}
                        placeholder="Search plugins"
                        value={searchValue.value}
                        onChange={onSearch}
                        autoFocus
                    />
                </ErrorBoundary>

                <ErrorBoundary noop>
                    <div className="o2s-chips">
                        {chips.map(c => (
                            <Clickable
                                key={c.value}
                                className={classes("o2s-chip", searchValue.status === c.value && "o2s-chip-on")}
                                onClick={() => setSearchValue(prev => ({ ...prev, status: c.value }))}
                            >
                                {c.label}
                            </Clickable>
                        ))}
                        <div className="o2s-tags">
                            <SearchableSelect
                                options={PluginTags.map(tag => ({ label: tag, value: tag }))}
                                value={searchValue.tags}
                                onChange={tags => setSearchValue(prev => ({ ...prev, tags }))}
                                closeOnSelect={false}
                                placeholder="Tags"
                                multi
                            />
                        </div>
                    </div>
                </ErrorBoundary>

                {plugins.length || requiredPlugins.length
                    ? (
                        <div className={cl("grid")}>
                            {plugins.length
                                ? plugins
                                : <Paragraph>No plugins match that.</Paragraph>
                            }
                        </div>
                    )
                    : <ExcludedPluginsList search={search} />
                }

                {requiredPlugins.length > 0 && (
                    <section>
                        <Clickable className="o2s-btn" onClick={() => setShowRequired(v => !v)}>
                            {showRequired ? "Hide" : "Show"} built-in plugins ({requiredPlugins.length})
                        </Clickable>
                        {showRequired && (
                            <>
                                <div className="o2s-muted o2s-gap">These keep o2cord working, so they can't be turned off.</div>
                                <div className={cl("grid")}>{requiredPlugins}</div>
                            </>
                        )}
                    </section>
                )}
            </div>
        </SettingsTab>
    );
}

function makeDependencyList(deps: string[]) {
    return (
        <>
            <Paragraph>This plugin is required by:</Paragraph>
            {deps.map((dep: string) => <Paragraph key={dep} className={cl("dep-text")}>{dep}</Paragraph>)}
        </>
    );
}

export default wrapTab(PluginSettings, "Plugins");
