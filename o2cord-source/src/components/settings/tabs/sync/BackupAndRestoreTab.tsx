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

import "@components/settings/tabs/vencord/o2Settings.css";

import { downloadSettingsBackup, uploadSettingsBackup } from "@api/SettingsSync/offline";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Clickable } from "@webpack/common";

// o2cord: one simple card - what's saved, and the two buttons.
function BackupAndRestoreTab() {
    return (
        <SettingsTab>
            <div className="o2s-page">
                <div className="o2s-hero">
                    <div className="o2s-grow">
                        <div className="o2s-hero-title">Backup</div>
                        <div className="o2s-muted">Save your o2cord settings to a file - your plugins and their settings, theme links and custom CSS. Load it on a new PC or after reinstalling.</div>
                    </div>
                </div>
                <div className="o2s-card">
                    <div className="o2s-row">
                        <div>
                            <div className="o2s-row-title">Save a backup</div>
                            <div className="o2s-muted">Downloads a .json file</div>
                        </div>
                        <Clickable className="o2s-btn" onClick={downloadSettingsBackup}>Save</Clickable>
                    </div>
                    <div className="o2s-row">
                        <div>
                            <div className="o2s-row-title">Load a backup</div>
                            <div className="o2s-muted">Replaces your current o2cord settings</div>
                        </div>
                        <Clickable className="o2s-btn" onClick={() => uploadSettingsBackup()}>Load</Clickable>
                    </div>
                </div>
            </div>
        </SettingsTab>
    );
}

export default wrapTab(BackupAndRestoreTab, "Backup & Restore");
