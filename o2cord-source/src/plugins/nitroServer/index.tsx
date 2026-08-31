/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Makes every server appear to be at max Boost tier (Level 3) on your own
 * client - same idea as the existing FakeNitro plugin, just at the server
 * level instead of the personal-Nitro level. Wraps GuildStore.getGuild so
 * every guild object it hands out reports premiumTier 3 and the full set
 * of tier-gated feature flags, which unlocks the client-side UI for
 * things like animated icons/banners, vanity URLs, more emoji/sticker
 * slots, etc.
 *
 * Like FakeNitro, this is purely how things LOOK on your own client - it
 * doesn't touch the server's real boost count, and anything actually
 * enforced by Discord's backend (real upload size limits, whether other
 * members' clients show the same thing, etc.) is unaffected. Confirmed
 * live: unlocking the "features" flag gets you INTO the role-icon upload
 * UI, but hitting Save still round-trips to Discord's real API, which
 * independently checks the guild's real boost count and rejects it
 * ("This server needs more boosts to perform this action") - that part
 * can't be faked without Discord's backend actually accepting an
 * unauthorized paid feature, which this plugin intentionally does not do.
 *
 * Role icons: what CAN work entirely client-side is a role's icon field
 * being a data: URL. Discord's own role-icon rendering code
 * (customIconSrc in the role-icons webpack module) special-cases that:
 * `if (o.startsWith("data:")) return o;` - it returns the data URL as-is
 * instead of building a CDN link, so no upload/save ever happens. This
 * plugin wraps GuildRoleStore.getRole/getManyRoles to inject a locally
 * configured data-URL icon onto specific roles by id - real Discord
 * rendering code just displays it, same as if it were a real uploaded
 * icon, but purely on your own client and never touches the server.
 *
 * Server banners work differently - confirmed live that
 * IconUtils.getGuildBannerURL has NO data: URL special case, it always
 * string-concatenates guild.banner into a CDN path (so a data: URL there
 * would just produce a broken link). Instead this wraps
 * IconUtils.getGuildBannerURL itself (a plain exported function, not a
 * store method) so every caller - server settings, guild info popups,
 * etc. - gets the locally configured banner URL for guilds that have one
 * set, without ever touching the real guild.banner field.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Menu, Modal, openModal, React, showToast, Toasts } from "@webpack/common";

import { chooseFile } from "@utils/web";

const GuildStore = findStoreLazy("GuildStore");
const GuildRoleStore = findStoreLazy("GuildRoleStore");
const IconUtils = findByPropsLazy("getGuildBannerURL", "getGuildIconURL");

// The full set of feature flags gated behind a Boost tier at some point in
// Discord's history - harmless to include ones a given client version no
// longer checks, since unknown feature strings are just ignored.
const UNLOCK_FEATURES = [
    "ANIMATED_ICON",
    "ANIMATED_BANNER",
    "BANNER",
    "INVITE_SPLASH",
    "VANITY_URL",
    "VIP_REGIONS",
    "MORE_EMOJI",
    "MORE_STICKERS",
    "ROLE_ICONS",
    "ROLE_SUBSCRIPTIONS_ENABLED",
    "CHANNEL_BANNER",
    "GUILD_TAGS",
    "RAID_ALERTS_DISABLED"
];

const MAX_ICON_BYTES = 256 * 1024;
const MAX_BANNER_BYTES = 1024 * 1024;

function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(file);
    });
}

function getJsonMap(key: "roleIcons" | "guildBanners"): Record<string, string> {
    try {
        const raw = settings.store[key];
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function setJsonMap(key: "roleIcons" | "guildBanners", next: Record<string, string>) {
    settings.store[key] = JSON.stringify(next);
}

function getRoleIcons() {
    return getJsonMap("roleIcons");
}

function getGuildBanners() {
    return getJsonMap("guildBanners");
}

const cardStyle: React.CSSProperties = {
    background: "#2b2d31",
    borderRadius: 8,
    padding: 20,
    color: "#f2f3f5"
};
const dividerStyle: React.CSSProperties = {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid #3f4147"
};
const previewBoxStyle: React.CSSProperties = {
    background: "#1e1f22",
    border: "2px dashed #4e5058",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#80848e"
};
const nativeButtonStyle: React.CSSProperties = {
    background: "#4e5058",
    color: "#f2f3f5",
    border: "none",
    borderRadius: 4,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer"
};
const inputStyle: React.CSSProperties = {
    flex: 1,
    background: "#1e1f22",
    border: "1px solid #3f4147",
    borderRadius: 4,
    color: "#f2f3f5",
    padding: "8px 10px",
    fontSize: 13
};
const primaryButtonStyle: React.CSSProperties = {
    background: "#5865f2",
    color: "white",
    border: "none",
    borderRadius: 4,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer"
};

function RoleIconSection({ guildId }: { guildId: string; }) {
    const [roleIcons, setLocal] = React.useState(getRoleIcons());
    const [roleId, setRoleId] = React.useState("");
    const preview = roleIcons[roleId.trim()];

    async function addIcon() {
        const id = roleId.trim();
        if (!/^\d{17,20}$/.test(id)) {
            showToast("Enter a valid role ID (right-click a role > Copy Role ID, Developer Mode must be on).", Toasts.Type.FAILURE);
            return;
        }

        const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
        if (!file) return;

        if (file.size > MAX_ICON_BYTES) {
            showToast("Use an image under 256 KB - role icons render small.", Toasts.Type.FAILURE);
            return;
        }

        const dataUrl = await readFileAsDataUrl(file);
        const next = { ...roleIcons, [id]: dataUrl };
        setJsonMap("roleIcons", next);
        setLocal(next);
        // Wrapping GuildRoleStore.getRole doesn't itself notify anything
        // already rendered (role list, chat mentions, member profiles) -
        // they only re-run their selector on a real store change event.
        GuildRoleStore.emitChange();
        showToast("Role icon set.", Toasts.Type.SUCCESS);
    }

    return (
        <div style={cardStyle}>
            <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px" }}>Role icon</p>
            <p style={{ fontSize: 13, color: "#b5bac1", margin: "0 0 16px" }}>Display an icon or emoji next to this role's name.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ ...previewBoxStyle, width: 56, height: 56, borderRadius: "50%", overflow: "hidden" }}>
                    {preview ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>+</span>}
                </div>
                <p style={{ fontSize: 11, color: "#80848e", margin: 0 }}>Real upload here needs a Boost level Discord's servers actually recognize.</p>
            </div>
            <div style={dividerStyle}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px", color: "#23a55a" }}>NitroServer custom icon (local only)</p>
                <div style={{ display: "flex", gap: 8 }}>
                    <input style={inputStyle} value={roleId} onChange={e => setRoleId(e.target.value)} placeholder="Role ID" />
                    <button style={primaryButtonStyle} onClick={addIcon}>Choose image</button>
                </div>
            </div>
        </div>
    );
}

function ServerBannerSection({ guildId }: { guildId: string; }) {
    const [guildBanners, setLocal] = React.useState(getGuildBanners());
    const current = guildBanners[guildId];

    async function chooseBanner() {
        const file = await chooseFile("image/png,image/jpeg,image/webp,image/gif");
        if (!file) return;

        if (file.size > MAX_BANNER_BYTES) {
            showToast("Use an image under 1 MB for the banner.", Toasts.Type.FAILURE);
            return;
        }

        const dataUrl = await readFileAsDataUrl(file);
        const next = { ...guildBanners, [guildId]: dataUrl };
        setJsonMap("guildBanners", next);
        setLocal(next);
        // Same reasoning as the role icon emitChange above - the guild
        // header/banner already rendered elsewhere won't re-fetch the
        // banner URL on its own.
        GuildStore.emitChange();
        showToast("Server banner set.", Toasts.Type.SUCCESS);
    }

    function removeBanner() {
        const next = { ...guildBanners };
        delete next[guildId];
        setJsonMap("guildBanners", next);
        setLocal(next);
        GuildStore.emitChange();
    }

    return (
        <div style={cardStyle}>
            <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px" }}>Server banner</p>
            <p style={{ fontSize: 13, color: "#b5bac1", margin: "0 0 16px" }}>Shown at the top of the channel list.</p>
            <div style={{ ...previewBoxStyle, width: "100%", height: 90, borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
                {current ? <img src={current} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>+</span>}
            </div>
            <div style={dividerStyle}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px", color: "#23a55a" }}>NitroServer custom banner (local only)</p>
                <div style={{ display: "flex", gap: 8 }}>
                    <button style={nativeButtonStyle} onClick={chooseBanner}>Choose image</button>
                    {current && <button style={nativeButtonStyle} onClick={removeBanner}>Remove</button>}
                </div>
            </div>
        </div>
    );
}

function NitroServerModal({ modalProps, guildId }: { modalProps: RenderModalProps; guildId: string; }) {
    return (
        <Modal {...modalProps} size="sm" title="NitroServer">
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                <RoleIconSection guildId={guildId} />
                <ServerBannerSection guildId={guildId} />
            </div>
        </Modal>
    );
}

function openNitroServerModal(guildId: string) {
    openModal(props => <NitroServerModal modalProps={props} guildId={guildId} />);
}

// "guild-context" is the right-click menu on a server's icon in the server
// list; "guild-header-popout" is the same right-click menu reached via the
// server name dropdown at the top of the channel list - both point at the
// same guild, registering on both covers however Ryder opens it.
const guildContextPatch = (children: any, { guild }: { guild?: { id: string; }; }) => {
    if (!children || !Array.isArray(children) || !guild) return;

    children.splice(-1, 0, (
        <Menu.MenuGroup key="o2cord-nitro-server-group">
            <Menu.MenuItem
                id="o2cord-nitro-server"
                label="NitroServer"
                action={() => openNitroServerModal(guild.id)}
            />
        </Menu.MenuGroup>
    ));
};

const settings = definePluginSettings({
    roleIcons: {
        type: OptionType.STRING,
        description: "JSON map of roleId -> data URL icon",
        default: "{}",
        hidden: true
    },
    guildBanners: {
        type: OptionType.STRING,
        description: "JSON map of guildId -> data URL banner",
        default: "{}",
        hidden: true
    }
});

let originalGetGuild: typeof GuildStore.getGuild | null = null;
let originalGetRole: typeof GuildRoleStore.getRole | null = null;
let originalGetManyRoles: typeof GuildRoleStore.getManyRoles | null = null;
let originalGetGuildBannerURL: typeof IconUtils.getGuildBannerURL | null = null;

function wrapGuild(guild: any) {
    if (!guild) return guild;

    const features = new Set(guild.features ?? []);
    for (const feature of UNLOCK_FEATURES) features.add(feature);

    // Faking premiumTier itself (not just features) crashed the Soundboard
    // button - Discord's real soundboard slot count is calculated directly
    // from premiumTier as a number (24/36/48 slots per tier), and that math
    // apparently doesn't tolerate a tier that doesn't match the guild's
    // real (much smaller) sound list. features alone is enough for the
    // role-icon gate this plugin actually needs, so drop the tier/count
    // override entirely rather than risk another mismatch like this one.
    return Object.assign(Object.create(Object.getPrototypeOf(guild)), guild, {
        features
    });
}

function wrapRole(role: any) {
    if (!role) return role;

    const icon = getRoleIcons()[role.id];
    if (!icon) return role;

    return Object.assign(Object.create(Object.getPrototypeOf(role)), role, { icon });
}

export default definePlugin({
    name: "NitroServer",
    description: "Shows every server as max Boost tier (Level 3), and lets you set custom role icons and a server banner - cosmetic only, client-side, like FakeNitro but for servers.",
    tags: ["Appearance", "Customisation"],
    authors: [Devs.Ryder],
    enabledByDefault: false,
    settings,

    start() {
        originalGetGuild = GuildStore.getGuild.bind(GuildStore);
        GuildStore.getGuild = (id: string) => wrapGuild(originalGetGuild!(id));

        originalGetRole = GuildRoleStore.getRole.bind(GuildRoleStore);
        GuildRoleStore.getRole = (guildId: string, roleId: string) => wrapRole(originalGetRole!(guildId, roleId));

        originalGetManyRoles = GuildRoleStore.getManyRoles.bind(GuildRoleStore);
        GuildRoleStore.getManyRoles = (guildId: string, roleIds: string[]) => {
            const result = originalGetManyRoles!(guildId, roleIds);
            if (Array.isArray(result)) return result.map(wrapRole);
            if (result && typeof result === "object") {
                const wrapped: Record<string, any> = {};
                for (const key in result) wrapped[key] = wrapRole(result[key]);
                return wrapped;
            }
            return result;
        };

        originalGetGuildBannerURL = IconUtils.getGuildBannerURL.bind(IconUtils);
        IconUtils.getGuildBannerURL = (guild: any, ...rest: any[]) => {
            const banner = guild?.id && getGuildBanners()[guild.id];
            return banner || originalGetGuildBannerURL!(guild, ...rest);
        };

        addContextMenuPatch("guild-context", guildContextPatch);
        addContextMenuPatch("guild-header-popout", guildContextPatch);
    },

    stop() {
        if (originalGetGuild) GuildStore.getGuild = originalGetGuild;
        if (originalGetRole) GuildRoleStore.getRole = originalGetRole;
        if (originalGetManyRoles) GuildRoleStore.getManyRoles = originalGetManyRoles;
        if (originalGetGuildBannerURL) IconUtils.getGuildBannerURL = originalGetGuildBannerURL;
        originalGetGuild = null;
        originalGetRole = null;
        originalGetManyRoles = null;
        originalGetGuildBannerURL = null;

        removeContextMenuPatch("guild-context", guildContextPatch);
        removeContextMenuPatch("guild-header-popout", guildContextPatch);
    }
});
