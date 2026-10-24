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
import "@components/settings/tabs/plugins/o2Plugins.css";

import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Link } from "@components/Link";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { getStylusWebStoreUrl } from "@utils/web";
import { Clickable, Forms, React, TabBar, useState } from "@webpack/common";

import { CspErrorCard } from "./CspErrorCard";
import { LocalThemesTab } from "./LocalThemesTab";
import { OnlineThemesTab } from "./OnlineThemesTab";

const enum ThemeTab {
    LOCAL,
    ONLINE
}

// o2cord: the three info cards (performance, where to find themes, blocked
// resources) folded into one small "Tips" box.
function ThemeTips() {
    const [open, setOpen] = useState(false);
    return (
        <div className="o2s-card">
            <Clickable className="o2s-row o2s-tips-head" onClick={() => setOpen(v => !v)}>
                <div className="o2s-row-title">Tips</div>
                <div className="o2s-muted">{open ? "Hide" : "Show"}</div>
            </Clickable>
            {open && (
                <div className="o2s-tips">
                    <div>• Themes and custom CSS can make Discord slow. If it lags, turn them off to check.</div>
                    <div>• Find themes on <Link href="https://betterdiscord.app/themes">BetterDiscord</Link> or <Link href="https://github.com/search?q=discord+theme">GitHub</Link>, then put the .theme.css file in your themes folder.</div>
                    <div>• Pictures and fonts in a theme only load from GitHub, GitLab, Codeberg, Imgur, Discord or Google Fonts.</div>
                </div>
            )}
        </div>
    );
}

function ThemesTab() {
    const [currentTab, setCurrentTab] = useState(ThemeTab.LOCAL);

    return (
        <SettingsTab>
            <TabBar
                type="top"
                look="brand"
                className="vc-settings-tab-bar"
                selectedItem={currentTab}
                onItemSelect={setCurrentTab}
            >
                <TabBar.Item
                    className="vc-settings-tab-bar-item"
                    id={ThemeTab.LOCAL}
                >
                    Local Themes
                </TabBar.Item>
                <TabBar.Item
                    className="vc-settings-tab-bar-item"
                    id={ThemeTab.ONLINE}
                >
                    Online Themes
                </TabBar.Item>
            </TabBar>

            <Flex flexDirection="column" gap="1em" className="o2s-page o2s-plugins">
                <CspErrorCard />

                <ThemeTips />

                {currentTab === ThemeTab.LOCAL && <LocalThemesTab />}
                {currentTab === ThemeTab.ONLINE && <OnlineThemesTab />}
            </Flex>
        </SettingsTab>
    );
}

function UserscriptThemesTab() {
    return (
        <SettingsTab>
            <Card variant="danger">
                <Forms.FormTitle tag="h5">Themes are not supported on the Userscript!</Forms.FormTitle>

                <Forms.FormText>
                    You can instead install themes with the <Link href={getStylusWebStoreUrl()}>Stylus extension</Link>!
                </Forms.FormText>
            </Card>
        </SettingsTab>
    );
}

export default IS_USERSCRIPT
    ? wrapTab(UserscriptThemesTab, "Themes")
    : wrapTab(ThemesTab, "Themes");
