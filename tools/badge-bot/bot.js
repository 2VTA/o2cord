require("dotenv").config();

const {
    Client, GatewayIntentBits, Partials, SlashCommandBuilder,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");
const zlib = require("zlib");
const { randomUUID } = require("crypto");

const {
    DISCORD_BOT_TOKEN,
    ALLOWED_GUILD_ID,
    ALLOWED_USER_ID,
    GITHUB_TOKEN
} = process.env;

for (const [name, value] of Object.entries({ DISCORD_BOT_TOKEN, ALLOWED_GUILD_ID, ALLOWED_USER_ID, GITHUB_TOKEN })) {
    if (!value) {
        console.error(`Missing ${name} in .env - see .env.example`);
        process.exit(1);
    }
}

const REPO_OWNER = "2VTA";
const REPO_NAME = "o2cord";
const BRANCH = "main";

const PROFILE_THEMES_PATH = "update-package/public/profile-themes.json";
const PROFILE_ASSETS_DIR = "update-package/public/assets/profile-themes";
const PROFILE_RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${PROFILE_ASSETS_DIR}`;
const PUBLISH_CODE_PREFIX = "O2PROFILE_PUBLISH:";

const BADGES_JSON_PATH = "update-package/public/badges.json";
const BADGES_ASSETS_DIR = "update-package/public/assets/badges";
const BADGES_RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${BADGES_ASSETS_DIR}`;

const NAMEPLATES_JSON_PATH = "update-package/public/nameplates.json";
const NAMEPLATES_ASSETS_DIR = "update-package/public/assets/nameplates";
const NAMEPLATES_RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${NAMEPLATES_ASSETS_DIR}`;

const USSRO2_JSON_PATH = "update-package/public/backgrounds.json";
const USSRO2_ASSETS_DIR = "update-package/public/assets/backgrounds";
const USSRO2_RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${USSRO2_ASSETS_DIR}`;
const USSRO2_REVIEW_CHANNEL_ID = "1538902624609501334";

const FRIEND_BADGE_PRESET = require("./presets/friend-badge.json");

const SEND_CODE_EMOJIS = [
    "<:Callie:1538295332885106708>",
    "<:Callie1:1538299069330497636>",
    "<:Callie2:1538299329981452379>"
];

function sendCodeMessage() {
    const emoji = SEND_CODE_EMOJIS[Math.floor(Math.random() * SEND_CODE_EMOJIS.length)];
    return `${emoji} Send the code.`;
}

function replyQuiet(message, content) {
    return message.reply({ content, allowedMentions: { repliedUser: false } });
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel]
});

// userId -> { channelId, mode: "badge" | "profile" | "ussro2" | "nameplate" } the bot is currently waiting on a code/file from.
const pendingUploads = new Map();

// nonce -> { mode, userId, buffer, fileName, contentType } waiting on an Accept/Reject button click.
const pendingConfirmations = new Map();

function buildConfirmRow(nonce, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`o2confirm|accept|${nonce}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`o2confirm|reject|${nonce}`)
            .setLabel("Reject")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
    );
}

const CHANGE_TYPE_LABELS = {
    profile: "Profile Theme",
    ussro2: "USSRO2 Background",
    nameplate: "Nameplate"
};

const changeCommand = new SlashCommandBuilder()
    .setName("change")
    .setDescription("Publish a profile image, USSRO2 background, or nameplate")
    .addStringOption(option =>
        option.setName("type")
            .setDescription("What are you changing?")
            .setRequired(true)
            .addChoices(
                { name: "Profile Theme", value: "profile" },
                { name: "USSRO2 Background", value: "ussro2" },
                { name: "Nameplate", value: "nameplate" }
            )
    )
    .addAttachmentOption(option =>
        option.setName("file")
            .setDescription("Image (png/jpg/webp/gif), or video (webm/mp4) for nameplate")
            .setRequired(false)
    );

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}. Locked to guild ${ALLOWED_GUILD_ID}, user ${ALLOWED_USER_ID}.`);

    try {
        const guild = await client.guilds.fetch(ALLOWED_GUILD_ID);
        await guild.commands.set([changeCommand.toJSON()]);
        console.log("Registered /change slash command.");
    } catch (err) {
        console.error("Failed to register slash commands", err);
    }
});

client.on("interactionCreate", async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName !== "change") return;

        try {
            // /change is open to everyone in the guild - it can only ever
            // publish content tied to the invoking user's own account
            // (userId below), and USSRO2 still needs Ryder's Accept before
            // anything goes out. Everything else in this bot stays locked
            // to ALLOWED_USER_ID.
            if (interaction.guildId !== ALLOWED_GUILD_ID) {
                await interaction.reply({ content: "Not allowed here.", ephemeral: true });
                return;
            }

            const type = interaction.options.getString("type", true);
            if (!CHANGE_TYPE_LABELS[type]) {
                await interaction.reply({ content: `Unknown type: ${type}`, ephemeral: true });
                return;
            }

            const userId = interaction.user.id;
            const file = interaction.options.getAttachment("file");

            if (!file) {
                await interaction.reply({
                    content: "Incomplete — missing: file. Run `/change` again with a file attached.",
                    ephemeral: true
                });
                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const fileRes = await fetch(file.url);
            if (!fileRes.ok) {
                await interaction.editReply(`Could not download the attachment (${fileRes.status}).`);
                return;
            }
            const buffer = Buffer.from(await fileRes.arrayBuffer());

            if (type === "profile") {
                const ext = detectImageExt(file.contentType, file.name);
                if (!ext) {
                    await interaction.editReply("Incomplete — attachment isn't a recognized png/jpg/webp/gif image.");
                    return;
                }
                validateImage(buffer, ext);
                const result = await publishProfileImage(userId, buffer, ext);
                await interaction.editReply(`Sent — profile image published for \`${result.userId}\`.`);
                return;
            }

            if (type === "ussro2") {
                const ext = detectImageExt(file.contentType, file.name);
                if (!ext) {
                    await interaction.editReply("Incomplete — attachment isn't a recognized png/jpg/webp/gif image.");
                    return;
                }
                validateImage(buffer, ext);

                const nonce = randomUUID();
                pendingConfirmations.set(nonce, {
                    mode: "ussro2",
                    userId,
                    buffer,
                    fileName: file.name,
                    contentType: file.contentType
                });

                const embed = new EmbedBuilder()
                    .setColor(0xff1275)
                    .setTitle("USSRO2 Background")
                    .setDescription(`Target user: \`${userId}\``)
                    .setImage(file.url);

                const reviewChannel = await client.channels.fetch(USSRO2_REVIEW_CHANNEL_ID);
                await reviewChannel.send({ embeds: [embed], components: [buildConfirmRow(nonce)] });
                await interaction.editReply(`Sent — review it in <#${USSRO2_REVIEW_CHANNEL_ID}>.`);
                return;
            }

            // nameplate
            const result = await publishNameplateVideo(userId, buffer, file.name, file.contentType);
            await interaction.editReply(`Sent — nameplate published for \`${result.userId}\`.`);
        } catch (err) {
            console.error(err);
            const content = `Failed: ${err.message}`;
            if (interaction.deferred || interaction.replied) await interaction.editReply(content).catch(() => {});
            else await interaction.reply({ content, ephemeral: true }).catch(() => {});
        }
        return;
    }

    if (interaction.isButton()) {
        if (!interaction.customId.startsWith("o2confirm|")) return;

        try {
            if (interaction.user.id !== ALLOWED_USER_ID) {
                await interaction.reply({ content: "Not allowed.", ephemeral: true });
                return;
            }

            const [, action, nonce] = interaction.customId.split("|");
            const pending = pendingConfirmations.get(nonce);
            if (!pending) {
                await interaction.reply({ content: "This confirmation has expired.", ephemeral: true });
                return;
            }
            pendingConfirmations.delete(nonce);

            const disabledRow = buildConfirmRow(nonce, true);
            const sourceEmbed = interaction.message.embeds[0];

            if (action === "reject") {
                const embed = EmbedBuilder.from(sourceEmbed)
                    .setImage(null)
                    .setColor(0x808080)
                    .setFooter({ text: "Rejected - not published." });
                await interaction.update({ embeds: [embed], components: [disabledRow] });
                return;
            }

            await interaction.deferUpdate();

            const result = await publishUssro2Background(pending.userId, pending.buffer, pending.fileName, pending.contentType);

            const embed = EmbedBuilder.from(sourceEmbed)
                .setColor(0x2ecc71)
                .setFooter({ text: `Published for ${result.userId} (${result.ext}, ${result.bytes} bytes).` });
            await interaction.editReply({ embeds: [embed], components: [disabledRow] });
        } catch (err) {
            console.error(err);
            await interaction.followUp({ content: `Failed: ${err.message}`, ephemeral: true }).catch(() => {});
        }
    }
});

function armPending(userId, channelId, mode) {
    const pending = pendingUploads.get(userId);
    if (pending && pending.channelId === channelId && pending.mode === mode) return false;
    pendingUploads.set(userId, { channelId, mode });
    return true;
}

client.on("messageCreate", async message => {
    try {
        if (message.author.bot) return;
        if (message.author.id !== ALLOWED_USER_ID) return;
        if (message.guildId !== ALLOWED_GUILD_ID) return;

        const content = message.content.trim();

        if (content === "-badge") {
            if (!armPending(message.author.id, message.channel.id, "badge")) return;
            await replyQuiet(message, sendCodeMessage());
            return;
        }

        if (content === "-profileimage") {
            if (!armPending(message.author.id, message.channel.id, "profile")) return;
            await replyQuiet(message, sendCodeMessage());
            return;
        }

        if (content.startsWith("-nameplate")) {
            const userId = content.slice("-nameplate".length).trim();
            if (!/^\d{5,25}$/.test(userId)) {
                await replyQuiet(message, "Usage: `-nameplate <userId>` with a video or image attached to the same message.");
                return;
            }

            const attachment = message.attachments.first();
            if (!attachment) {
                await replyQuiet(message, "Attach a video (webm/mp4) or image (png/jpg/webp/gif) to the same message.");
                return;
            }

            await message.channel.sendTyping();
            const res = await fetch(attachment.url);
            if (!res.ok) throw new Error(`Could not download the attachment (${res.status}).`);
            const buffer = Buffer.from(await res.arrayBuffer());

            const result = await publishNameplateVideo(userId, buffer, attachment.name, attachment.contentType);
            await replyQuiet(message, `Published nameplate for \`${result.userId}\` (${result.ext}, ${result.bytes} bytes).`);
            return;
        }

        if (content.startsWith("-friendbadge")) {
            const userId = content.slice("-friendbadge".length).trim();
            if (!/^\d{5,25}$/.test(userId)) {
                await replyQuiet(message, "Usage: `-friendbadge <userId>`");
                return;
            }

            await message.channel.sendTyping();
            const result = await publishSingleBadge({
                id: `badge-friend-${userId}`,
                userId,
                name: FRIEND_BADGE_PRESET.name,
                image: FRIEND_BADGE_PRESET.image,
                size: FRIEND_BADGE_PRESET.size
            });
            await replyQuiet(message, `Published \`${result.name}\` badge for \`${result.userId}\` (${result.ext}, ${result.bytes} bytes).`);
            return;
        }

        // No command needed from here on: any attachment Ryder drops gets
        // sniffed and published automatically if it looks like a code file.
        // The explicit -badge/-profileimage two-step flow above still works
        // too (it just arms `pending` first, checked below).
        const attachment = message.attachments.first();
        if (!attachment) return;

        const pending = pendingUploads.get(message.author.id);
        const isPending = Boolean(pending && pending.channelId === message.channel.id);
        if (isPending) pendingUploads.delete(message.author.id);

        await message.channel.sendTyping();

        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`Could not download the attachment (${res.status}).`);
        const raw = stripBom(await res.text());
        const trimmed = raw.trim();

        if (isPending && pending.mode === "profile") {
            if (!trimmed.startsWith(PUBLISH_CODE_PREFIX)) {
                const preview = trimmed.slice(0, 60).replace(/[\r\n]+/g, " ");
                throw new Error(`That's not a ProfileTheme code (O2PROFILE_PUBLISH:). It starts with: "${preview}"`);
            }
            const result = await publishProfileCode(trimmed);
            await replyQuiet(message, `Published profile image for \`${result.userId}\` (${result.ext}, ${result.bytes} bytes).`);
            return;
        }

        if (trimmed.startsWith(PUBLISH_CODE_PREFIX)) {
            const result = await publishProfileCode(trimmed);
            await replyQuiet(message, `Published profile image for \`${result.userId}\` (${result.ext}, ${result.bytes} bytes).`);
            return;
        }

        if (trimmed.startsWith("{")) {
            const results = await publishBadgeCode(trimmed);
            const summary = results
                .map(r => `\`${r.name}\` (${r.id}) for \`${r.userId}\` — ${r.ext}, ${r.bytes} bytes`)
                .join("\n");
            await replyQuiet(message, `Published ${results.length} badge(s):\n${summary}`);
            return;
        }

        // Doesn't look like a code file at all. If this was an explicit
        // -badge/-profileimage upload, say so; otherwise it's probably just
        // an unrelated attachment, so stay quiet instead of nagging.
        if (!isPending) return;

        const preview = trimmed.slice(0, 60).replace(/[\r\n]+/g, " ");
        throw new Error(`Unrecognized code format. It starts with: "${preview}"`);
    } catch (err) {
        console.error(err);
        await replyQuiet(message, `Failed: ${err.message}`).catch(() => {});
    }
});

function stripBom(text) {
    return text.replace(/^﻿/, "");
}

// ---------------------------------------------------------------------------
// ProfileTheme (O2PROFILE_PUBLISH:{...})
// ---------------------------------------------------------------------------

async function publishProfileCode(trimmed) {
    let payload;
    try {
        payload = JSON.parse(trimmed.slice(PUBLISH_CODE_PREFIX.length));
    } catch {
        throw new Error("Could not parse the code as JSON.");
    }

    const { userId, imageUrl } = payload;
    if (typeof userId !== "string" || !/^\d{5,25}$/.test(userId))
        throw new Error("Invalid userId in the code.");
    if (typeof imageUrl !== "string")
        throw new Error("Missing imageUrl in the code.");

    const { ext, buffer } = await decodeImageDataUrl(imageUrl, "imageUrl");
    return publishProfileImage(userId, buffer, ext);
}

async function publishProfileImage(userId, buffer, ext) {
    validateImage(buffer, ext);

    const imagePath = `${PROFILE_ASSETS_DIR}/${userId}.${ext}`;
    const existingImageSha = await githubGetSha(imagePath);
    await githubPutFile(imagePath, buffer, `Publish ProfileTheme image for ${userId}`, existingImageSha);

    const { data: manifest, sha: manifestSha } = await githubGetJson(PROFILE_THEMES_PATH);
    manifest[userId] = `${PROFILE_RAW_BASE}/${userId}.${ext}`;
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 4) + "\n", "utf8");
    await githubPutFile(PROFILE_THEMES_PATH, manifestBuffer, `Update profile-themes.json for ${userId}`, manifestSha);

    return { userId, ext, bytes: buffer.length };
}

// ---------------------------------------------------------------------------
// Badges ({"badges": [{id, userId, name, image, size, link?, enabled?}]})
// ---------------------------------------------------------------------------

async function publishBadgeCode(trimmed) {
    let payload;
    try {
        payload = JSON.parse(trimmed);
    } catch {
        throw new Error("Could not parse the code as JSON.");
    }

    if (!payload || !Array.isArray(payload.badges) || payload.badges.length === 0)
        throw new Error("JSON doesn't contain a non-empty \"badges\" array.");

    const results = [];
    for (const badge of payload.badges) {
        results.push(await publishSingleBadge(badge));
    }
    return results;
}

async function publishSingleBadge(badge) {
    const { id, userId, name, image, size, link, enabled } = badge ?? {};

    if (typeof id !== "string" || !id) throw new Error("A badge is missing its id.");
    if (typeof userId !== "string" || !/^\d{5,25}$/.test(userId)) throw new Error(`Invalid userId for badge ${id}.`);
    if (typeof name !== "string" || !name) throw new Error(`Badge ${id} is missing a name.`);
    if (typeof image !== "string") throw new Error(`Badge ${id} is missing its image.`);

    const { ext, buffer } = await decodeImageDataUrl(image, `badge ${id} image`);
    validateImage(buffer, ext);

    const imagePath = `${BADGES_ASSETS_DIR}/${id}.${ext}`;
    const existingImageSha = await githubGetSha(imagePath);
    await githubPutFile(imagePath, buffer, `Publish badge image ${id}`, existingImageSha);

    const { data: manifest, sha: manifestSha } = await githubGetJson(BADGES_JSON_PATH);
    if (!Array.isArray(manifest.badges)) manifest.badges = [];

    const publicBadge = {
        id,
        userId,
        name,
        image: `${BADGES_RAW_BASE}/${id}.${ext}`,
        size: normalizeBadgeSize(size)
    };
    if (link) publicBadge.link = link;
    if (enabled === false) publicBadge.enabled = false;

    const existingIndex = manifest.badges.findIndex(b => b.id === id);
    if (existingIndex >= 0) manifest.badges[existingIndex] = publicBadge;
    else manifest.badges.push(publicBadge);

    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 4) + "\n", "utf8");
    await githubPutFile(BADGES_JSON_PATH, manifestBuffer, `Update badges.json for ${id}`, manifestSha);

    return { id, userId, name, ext, bytes: buffer.length };
}

function normalizeBadgeSize(size) {
    const parsed = typeof size === "number" ? size : Number(size);
    if (!Number.isFinite(parsed)) return 22;
    return Math.min(40, Math.max(14, Math.round(parsed)));
}

// ---------------------------------------------------------------------------
// Nameplates (raw video/image attachment, no JSON wrapping - no in-app flow yet)
// ---------------------------------------------------------------------------

const NAMEPLATE_VIDEO_EXTS = new Set(["webm", "mp4"]);

async function publishNameplateVideo(userId, buffer, fileName, contentType) {
    const ext = detectNameplateExt(fileName, contentType);
    if (!ext) throw new Error("Attachment isn't a recognized webm/mp4 video or png/jpg/webp/gif image.");

    if (NAMEPLATE_VIDEO_EXTS.has(ext)) validateVideo(buffer, ext);
    else validateImage(buffer, ext);

    const assetPath = `${NAMEPLATES_ASSETS_DIR}/${userId}.${ext}`;
    const existingAssetSha = await githubGetSha(assetPath);
    await githubPutFile(assetPath, buffer, `Publish Nameplate ${ext} for ${userId}`, existingAssetSha);

    const { data: manifest, sha: manifestSha } = await githubGetJson(NAMEPLATES_JSON_PATH);
    manifest[userId] = `${NAMEPLATES_RAW_BASE}/${userId}.${ext}`;
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 4) + "\n", "utf8");
    await githubPutFile(NAMEPLATES_JSON_PATH, manifestBuffer, `Update nameplates.json for ${userId}`, manifestSha);

    return { userId, ext, bytes: buffer.length };
}

// ---------------------------------------------------------------------------
// USSRO2 backgrounds (raw image attachment, same registry shape as ProfileTheme)
// ---------------------------------------------------------------------------

async function publishUssro2Background(userId, buffer, fileName, contentType) {
    const ext = detectImageExt(contentType, fileName);
    if (!ext) throw new Error("Attachment isn't a recognized png/jpg/webp/gif image.");
    validateImage(buffer, ext);

    const assetPath = `${USSRO2_ASSETS_DIR}/${userId}.${ext}`;
    const existingAssetSha = await githubGetSha(assetPath);
    await githubPutFile(assetPath, buffer, `Publish USSRO2 background for ${userId}`, existingAssetSha);

    const { data: manifest, sha: manifestSha } = await githubGetJson(USSRO2_JSON_PATH);
    manifest[userId] = `${USSRO2_RAW_BASE}/${userId}.${ext}`;
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 4) + "\n", "utf8");
    await githubPutFile(USSRO2_JSON_PATH, manifestBuffer, `Update backgrounds.json for ${userId}`, manifestSha);

    return { userId, ext, bytes: buffer.length };
}

function detectNameplateExt(fileName, contentType) {
    if (contentType === "video/webm") return "webm";
    if (contentType === "video/mp4") return "mp4";
    if (contentType === "image/png") return "png";
    if (contentType === "image/jpeg") return "jpg";
    if (contentType === "image/webp") return "webp";
    if (contentType === "image/gif") return "gif";

    const lower = (fileName ?? "").toLowerCase();
    if (lower.endsWith(".webm")) return "webm";
    if (lower.endsWith(".mp4")) return "mp4";
    if (lower.endsWith(".png")) return "png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
    if (lower.endsWith(".webp")) return "webp";
    if (lower.endsWith(".gif")) return "gif";
    return null;
}

function validateVideo(buffer, ext) {
    if (buffer.length < 1024)
        throw new Error("Video is too small to be real (truncated upload?).");

    if (ext === "webm") {
        // EBML/Matroska magic bytes
        const magic = Buffer.from([0x1A, 0x45, 0xDF, 0xA3]);
        if (!buffer.subarray(0, 4).equals(magic))
            throw new Error("Corrupted WEBM: bad EBML header.");
    } else if (ext === "mp4") {
        // "ftyp" box should appear a few bytes in
        if (buffer.subarray(4, 8).toString("ascii") !== "ftyp")
            throw new Error("Corrupted MP4: missing ftyp box.");
    }
    // Container formats don't have a cheap whole-file checksum like PNG's
    // per-chunk CRC, so this is a best-effort header check, not a full
    // integrity guarantee. Discord's own upload path is reliable enough
    // in practice that truncation here is unlikely.
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Accepts either an embedded data: URL or a plain https:// link (e.g. a
// Discord CDN attachment URL) - some codes reference an already-uploaded
// image by link instead of re-encoding it as base64.
async function decodeImageDataUrl(source, label) {
    if (typeof source !== "string") throw new Error(`${label} is missing.`);

    const dataMatch = source.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/s);
    if (dataMatch) {
        const ext = dataMatch[1] === "jpeg" ? "jpg" : dataMatch[1];
        return { ext, buffer: Buffer.from(dataMatch[2], "base64") };
    }

    if (/^https:\/\//.test(source)) {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`${label}: could not download ${source} (${res.status}).`);

        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = detectImageExt(res.headers.get("content-type"), source);
        if (!ext) throw new Error(`${label}: unrecognized image type at ${source}.`);

        return { ext, buffer };
    }

    throw new Error(`${label} isn't a recognized base64 image data URL or https:// link.`);
}

function detectImageExt(contentType, url) {
    if (contentType === "image/png") return "png";
    if (contentType === "image/jpeg") return "jpg";
    if (contentType === "image/webp") return "webp";
    if (contentType === "image/gif") return "gif";

    const path = (url ?? "").split("?")[0].toLowerCase();
    if (path.endsWith(".png")) return "png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "jpg";
    if (path.endsWith(".webp")) return "webp";
    if (path.endsWith(".gif")) return "gif";
    return null;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function validateImage(buffer, ext) {
    if (buffer.length > MAX_IMAGE_BYTES)
        throw new Error(`Image is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Please use something under 5 MB - it needs to load fast in small UI spots like voice tiles.`);

    if (ext === "png") {
        const magic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        if (!buffer.subarray(0, 8).equals(magic))
            throw new Error("Corrupted PNG: bad magic bytes.");

        let offset = 8;
        let sawIEND = false;
        while (offset < buffer.length) {
            const len = buffer.readUInt32BE(offset);
            const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
            const dataEnd = offset + 8 + len;
            if (dataEnd + 4 > buffer.length)
                throw new Error(`Corrupted PNG: chunk ${type} runs past end of file (truncated upload).`);

            const crcStored = buffer.readUInt32BE(dataEnd);
            const crcCalc = zlib.crc32(buffer.subarray(offset + 4, dataEnd)) >>> 0;
            if (crcCalc !== crcStored)
                throw new Error(`Corrupted PNG: CRC mismatch in chunk ${type}.`);

            offset = dataEnd + 4;
            if (type === "IEND") {
                sawIEND = true;
                break;
            }
        }
        if (!sawIEND) throw new Error("Corrupted PNG: missing IEND chunk (truncated upload).");
    } else if (ext === "jpg") {
        if (!(buffer[0] === 0xFF && buffer[1] === 0xD8))
            throw new Error("Corrupted JPEG: bad start marker.");
        if (!(buffer[buffer.length - 2] === 0xFF && buffer[buffer.length - 1] === 0xD9))
            throw new Error("Corrupted JPEG: bad end marker (truncated upload).");
    } else if (ext === "gif") {
        const header = buffer.subarray(0, 6).toString("ascii");
        if (header !== "GIF87a" && header !== "GIF89a")
            throw new Error("Corrupted GIF: bad header.");
        if (buffer.length < 32)
            throw new Error("Corrupted GIF: file too small to be real (truncated upload?).");
        // No trailer-byte check: real-world GIFs from various encoders don't
        // reliably end in exactly 0x3B (or even near the tail), and decoders
        // render them fine regardless. The header + size floor above catch
        // the failure modes that actually matter (wrong format, empty file).
    } else if (ext === "webp") {
        if (buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WEBP")
            throw new Error("Corrupted WEBP: bad header.");
    }
}

async function githubGetSha(path) {
    const res = await fetch(githubUrl(path), { headers: githubHeaders() });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
    const body = await res.json();
    return body.sha;
}

async function githubGetJson(path) {
    const res = await fetch(githubUrl(path), { headers: githubHeaders() });
    if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
    const body = await res.json();
    const data = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
    return { data, sha: body.sha };
}

async function githubPutFile(path, buffer, message, sha) {
    const res = await fetch(githubUrl(path), {
        method: "PUT",
        headers: { ...githubHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
            message,
            content: buffer.toString("base64"),
            branch: BRANCH,
            ...(sha ? { sha } : {})
        })
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`GitHub PUT ${path} failed: ${res.status} ${errBody}`);
    }
}

function githubUrl(path) {
    return `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
}

function githubHeaders() {
    return {
        Authorization: `token ${GITHUB_TOKEN}`,
        "User-Agent": "o2cord-badge-bot",
        Accept: "application/vnd.github+json"
    };
}

client.login(DISCORD_BOT_TOKEN);
