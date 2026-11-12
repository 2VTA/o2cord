#!/usr/bin/env bash
#
# o2cord installer for Linux (beta)
# https://github.com/2VTA/o2cord
#
# What it does:
#   1. downloads the o2cord files into  ~/.local/share/o2cord/dist
#   2. finds your Discord (Stable / PTB / Canary from the .deb, .tar.gz or your
#      distro's package) and puts a tiny loader in front of its app.asar
#      (your original is kept as _app.asar, nothing is deleted)
#   3. offers a small background service that puts o2cord back by itself after
#      Discord is updated (a Discord update replaces the file o2cord sits in)
#
# o2cord then updates itself from inside Discord. If o2cord's files are ever
# missing, Discord still starts normally - it just starts without o2cord.
#
# Not supported yet: Flatpak and Snap Discord (their files are read-only).
#
# Usage:
#   bash install.sh                 install (asks which Discord if there are several)
#   bash install.sh --all           install into every Discord found
#   bash install.sh --target PATH   install into one Discord: its folder, or the discord command
#                                   (e.g. --target /opt/discord  or  --target "$(command -v discord)")
#   bash install.sh --auto-repair   also set up the update-proof service, without asking
#   bash install.sh --no-auto-repair   don't set it up (and don't ask)
#   bash install.sh --status        show what is installed and whether the service is running
#   bash install.sh --list          only show the Discords found
#   bash install.sh --uninstall     put the original app.asar back and remove the service
#   bash install.sh --skip-update   stop Discord's "update available" screen from blocking you
#                                   (sets SKIP_HOST_UPDATE in Discord's settings.json - close Discord first)
#   bash install.sh --allow-update  turn that off again
#   bash install.sh --help
#
# Run it as your normal user. It asks for your password (sudo) only when
# Discord's folder belongs to the system. (Running the whole thing with sudo works
# too: it still sets o2cord up for the user who called sudo.)

set -euo pipefail

if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; N=$'\033[0m'; else B=; G=; Y=; R=; D=; N=; fi
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s!%s %s\n' "$Y" "$N" "$*" >&2; }
die()  { printf '%s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

SCRIPT_URL="${O2CORD_SCRIPT_URL:-https://raw.githubusercontent.com/2VTA/o2cord/main/docs/install.sh}"
FILES_BASE="${O2CORD_FILES_BASE:-https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/files}"
DIST_FILES=(patcher.js preload.js renderer.js renderer.css)
DIST_DIR=""
REAL_USER=""
SUDO=""
TMP=""
trap 'rm -rf "${TMP:-}"' EXIT
ensure_tmp() { if [ -z "$TMP" ]; then TMP="$(mktemp -d)"; fi; }
# is there a terminal to ask questions on (also when the script itself was piped in)?
have_tty() { ( : < /dev/tty ) 2>/dev/null; }

# ── "did you mean --target?" for typos ───────────────────────────────────────
KNOWN_OPTIONS=(--all --target --list --status --uninstall --remove --repair --config --auto-repair --no-auto-repair --skip-update --allow-update --help)

distance() { # edit distance between two short words
    local a="$1" b="$2" i j cost x y z m
    local -a prev curr
    for ((j = 0; j <= ${#b}; j++)); do prev[j]=$j; done
    for ((i = 1; i <= ${#a}; i++)); do
        curr[0]=$i
        for ((j = 1; j <= ${#b}; j++)); do
            if [ "${a:i-1:1}" = "${b:j-1:1}" ]; then cost=0; else cost=1; fi
            x=$((prev[j] + 1)); y=$((curr[j-1] + 1)); z=$((prev[j-1] + cost))
            m=$x
            if [ "$y" -lt "$m" ]; then m=$y; fi
            if [ "$z" -lt "$m" ]; then m=$z; fi
            curr[j]=$m
        done
        prev=("${curr[@]}")
    done
    echo "${prev[${#b}]}"
}

unknown_option() {
    local opt="$1" o d best="" bestd=99
    for o in "${KNOWN_OPTIONS[@]}"; do
        d="$(distance "$opt" "$o")"
        if [ "$d" -lt "$bestd" ]; then bestd="$d"; best="$o"; fi
    done
    if [ "$bestd" -le 3 ]; then die "Unknown option: $opt - did you mean $best ?  (bash install.sh --help)"; fi
    die "Unknown option: $opt  (bash install.sh --help)"
}

# ── finding Discord ───────────────────────────────────────────────────────────
# Discord keeps app.asar in <folder>/resources (the official .deb/.tar.gz) or, for packages
# that run on the system's Electron, right in <folder>. This prints the one that has it.
asar_home() {
    local d="${1%/}" sub
    for sub in "$d/resources" "$d"; do
        if [ -e "$sub/app.asar" ] || [ -e "$sub/_app.asar" ]; then printf '%s\n' "$sub"; return 0; fi
    done
    return 1
}

# the folders a launcher / binary / script points at
launcher_dirs() {
    local f="$1" real p
    [ -e "$f" ] || return 0
    real="$(readlink -f "$f" 2>/dev/null || printf '%s' "$f")"
    if [ -d "$real" ]; then printf '%s\n' "$real"; return 0; fi
    printf '%s\n' "$(dirname "$real")"
    # a launcher script ("exec /opt/discord/Discord ...") - take the paths it mentions
    if [ -f "$real" ] && [ -r "$real" ] && [ "$(head -c 2 "$real" 2>/dev/null)" = "#!" ]; then
        while IFS= read -r p; do
            p="${p%/}"
            if [ -d "$p" ]; then printf '%s\n' "$p"; else printf '%s\n' "$(dirname "$p")"; fi
        done < <(grep -oE '/[^ "'"'"'$]+' "$real" 2>/dev/null | grep -i discord || true)
    fi
}

# folders of Discords that are running right now (the surest way to find the right one)
running_dirs() {
    local f pid exe tok
    while IFS= read -r f; do
        pid="${f#/proc/}"; pid="${pid%%/*}"
        exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
        case "${exe##*/}" in [Dd]iscord*) printf '%s\n' "$(dirname "$exe")" ;; esac
        while IFS= read -r tok; do
            case "$tok" in *app.asar) printf '%s\n' "$(dirname "$tok")" ;; esac
        done < <(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null | grep -i discord || true)
    done < <(grep -aliE 'discord' /proc/[0-9]*/cmdline 2>/dev/null || true)
}

# Folder -> app.asar folder, also looking one level up (binary in .../bin, etc.)
resolve_dir() {
    local d="$1" try
    for try in "$d" "$d/.."; do
        [ -d "$try" ] || continue
        if asar_home "$try"; then return 0; fi
    done
    return 1
}

LAUNCHERS=(discord discord-ptb discord-canary Discord DiscordPTB DiscordCanary discord-stable)

not_flatpak_snap() { case "$1" in */flatpak/*|*/snap/*|/var/lib/snapd/*) return 1 ;; *) return 0 ;; esac; }

find_discords() {
    local d l p
    local known=(
        /usr/share/discord /usr/share/discord-ptb /usr/share/discord-canary
        /usr/lib/discord /usr/lib/discord-ptb /usr/lib/discord-canary
        /usr/lib64/discord /usr/lib64/discord-ptb /usr/lib64/discord-canary
        /opt/discord /opt/Discord /opt/discord-ptb /opt/DiscordPTB /opt/discord-canary /opt/DiscordCanary
        /usr/lib/discord_arch_electron /opt/discord_arch_electron
        "$HOME/.local/share/discord" "$HOME/Discord" "$HOME/DiscordPTB" "$HOME/DiscordCanary"
    )
    {
        for d in "${known[@]}"; do if [ -d "$d" ]; then resolve_dir "$d" || true; fi; done
        for l in "${LAUNCHERS[@]}"; do
            p="$(command -v "$l" 2>/dev/null || true)"
            [ -n "$p" ] || continue
            while IFS= read -r d; do if [ -n "$d" ]; then resolve_dir "$d" || true; fi; done < <(launcher_dirs "$p")
        done
        while IFS= read -r d; do if [ -n "$d" ]; then resolve_dir "$d" || true; fi; done < <(running_dirs)
    } 2>/dev/null | while IFS= read -r p; do
        p="$(readlink -f "$p" 2>/dev/null || printf '%s' "$p")"
        if not_flatpak_snap "$p"; then printf '%s\n' "$p"; fi
    done | awk '!seen[$0]++'
    return 0
}

# last resort: look for any app.asar that has "discord" in its path
search_disk() {
    command -v find >/dev/null 2>&1 || return 0
    local cmd=(find /usr /opt "$HOME" -maxdepth 6 \( -name node_modules -o -name .cache -o -path '*/flatpak' -o -path '*/snap' \) -prune -o -name app.asar -ipath '*discord*' -print)
    if command -v timeout >/dev/null 2>&1; then timeout 20 "${cmd[@]}" 2>/dev/null || true; else "${cmd[@]}" 2>/dev/null || true; fi
}

kind_of() {
    case "$1" in
        *[Cc]anary*) echo "Canary" ;;
        *[Pp][Tt][Bb]*) echo "PTB" ;;
        *) echo "Stable" ;;
    esac
}

# Flatpak / Snap Discord can't be patched from here - say so instead of silently finding nothing
unsupported_hint() {
    local found=0
    if command -v flatpak >/dev/null 2>&1 && flatpak list --app 2>/dev/null | grep -qi 'com.discordapp'; then found=1; fi
    if [ -d /snap/discord ] || { command -v snap >/dev/null 2>&1 && snap list 2>/dev/null | grep -qi '^discord'; }; then found=1; fi
    if [ "$found" = 1 ]; then
        warn "Looks like Discord is installed as a Flatpak or Snap. Those can't be patched yet."
        warn "Install Discord from the .deb / .tar.gz on discord.com (or your distro's package) and run this again."
    fi
}

# what we saw, so you can tell us (or fix the path yourself) when nothing was found
diagnose() {
    local l p real any=0
    say ""
    say "${B}What I looked at:${N}"
    for l in "${LAUNCHERS[@]}"; do
        p="$(command -v "$l" 2>/dev/null || true)"
        [ -n "$p" ] || continue
        any=1
        real="$(readlink -f "$p" 2>/dev/null || printf '%s' "$p")"
        say "  command '$l' -> $p"
        [ "$real" = "$p" ] || say "    which is really $real"
        say "    folder: $(dirname "$real")  ->  $(ls "$(dirname "$real")" 2>/dev/null | head -n 12 | tr '\n' ' ')"
    done
    [ "$any" = 1 ] || say "  no 'discord' command in your PATH"
    local run; run="$(running_dirs | sort -u | head -n 3 | tr '\n' ' ')"
    say "  running Discord: ${run:-not running (open it, then try again - that helps me find it)}"
    say ""
    say "Find it yourself with:  ${B}find / -name app.asar -ipath '*discord*' 2>/dev/null${N}"
    say "then:  bash install.sh --target THE_FOLDER_THAT_HOLDS_THAT_FILE"
}

# ── doing things in a folder that may need admin rights ──────────────────────
need_admin_for() {
    SUDO=""
    if [ ! -w "$1" ]; then
        if command -v sudo >/dev/null 2>&1; then SUDO="sudo"
        elif command -v pkexec >/dev/null 2>&1; then SUDO="pkexec"
        else die "$1 isn't writable and neither sudo nor pkexec is available. Run this as a user that can write there."
        fi
        say "${D}$1 belongs to the system - asking for admin rights ($SUDO)...${N}"
    fi
}
run() { if [ -n "$SUDO" ]; then "$SUDO" "$@"; else "$@"; fi; }

# ── the loader: a tiny asar FILE ─────────────────────────────────────────────
# app.asar stays a regular file (so a package upgrade replaces it cleanly) holding
# index.js + package.json. The asar format is simple enough to write by hand:
#   [4][size of header buffer]  [size of header payload][json length][json + padding]  [file data]
le32() { local n=$1; printf "$(printf '\\x%02x\\x%02x\\x%02x\\x%02x' $((n & 255)) $(((n >> 8) & 255)) $(((n >> 16) & 255)) $(((n >> 24) & 255)))"; }

build_asar() { # $1 = output, $2 = index.js, $3 = package.json
    local out="$1" js="$2" pj="$3" s1 s2 header len pad payload hb
    s1="$(wc -c < "$js" | tr -d ' ')"; s2="$(wc -c < "$pj" | tr -d ' ')"
    header="{\"files\":{\"index.js\":{\"size\":$s1,\"offset\":\"0\"},\"package.json\":{\"size\":$s2,\"offset\":\"$s1\"}}}"
    len=${#header}
    pad=$(((4 - len % 4) % 4))
    payload=$((4 + len + pad))
    hb=$((4 + payload))
    {
        le32 4; le32 "$hb"
        le32 "$payload"; le32 "$len"; printf '%s' "$header"
        if [ "$pad" -gt 0 ]; then head -c "$pad" /dev/zero; fi
        cat "$js" "$pj"
    } > "$out"
}

json_str() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '"%s"' "$s"; }

loader_js() {
    cat <<EOF
/* o2cord-loader - puts o2cord in front of Discord. Remove it with: bash install.sh --uninstall */
const fs = require("fs");
const path = require("path");
const patcher = $(json_str "$DIST_DIR/patcher.js");
if (fs.existsSync(patcher)) {
    require(patcher);
} else {
    // o2cord's files are gone (deleted or moved): start plain Discord instead of not starting at all
    console.error("[o2cord] " + patcher + " is missing - starting Discord without o2cord");
    const original = path.join(__dirname, "..", "_app.asar");
    const pkg = require(path.join(original, "package.json"));
    require.main.filename = path.join(original, pkg.main);
    require("electron").app.setAppPath(original);
    require(require.main.filename);
}
EOF
}

# a Discord asar starts with the 4-byte header "04 00 00 00"
is_asar_file() { [ -f "$1" ] && [ "$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')" = "04000000" ]; }
# our loader: a small asar file carrying the marker (Discord's own is megabytes)
is_ours() { [ -f "$1" ] && [ "$(stat -c %s "$1" 2>/dev/null || echo 999999999)" -lt 65536 ] && grep -aq 'o2cord-loader' "$1"; }
# the loader from the older versions of this script: a folder
is_ours_dir() { [ -d "$1" ] && grep -q 'o2cord' "$1/index.js" 2>/dev/null; }

write_loader() { # $1 = folder that holds app.asar
    local res="$1" js pj out stage
    ensure_tmp
    js="$TMP/loader.js"; pj="$TMP/package.json"; out="$TMP/app.asar"
    loader_js > "$js"
    printf '{"name":"discord","main":"index.js"}\n' > "$pj"
    build_asar "$out" "$js" "$pj"
    is_asar_file "$out" || { warn "couldn't build the loader file"; return 1; }
    # written next to the real one, then renamed over it: Discord never sees half a file
    stage="$res/.app.asar.o2cord-new"
    run install -m 0644 "$out" "$stage"
    if [ "$(id -u)" -eq 0 ]; then chown --reference="$res" "$stage" 2>/dev/null || true; fi
    run mv -f "$stage" "$res/app.asar"
}

# Puts the loader in front of Discord's app.asar. $1 = the folder that holds it.
# Returns 1 (message already printed) when it can't do that safely.
patch_folder() {
    local res="$1" asar backup
    asar="$res/app.asar"; backup="$res/_app.asar"
    need_admin_for "$res"

    if is_ours "$asar"; then
        :   # already in front - only the path to o2cord's files is refreshed below
    elif [ -d "$asar" ]; then
        if ! is_ours_dir "$asar"; then warn "$asar is a folder that isn't o2cord's - not touching it."; return 1; fi
        if ! is_asar_file "$backup" || is_ours "$backup"; then warn "$backup is missing or isn't Discord's file - can't keep your original safe, stopping."; return 1; fi
        run rm -rf "$asar"     # the old folder-style loader: replaced by the file-style one
    elif is_asar_file "$asar"; then
        # Discord's own file (also what is left after a Discord update): it becomes the backup
        run mv -f "$asar" "$backup"
    else
        warn "$asar isn't a Discord app.asar - not touching it."
        return 1
    fi
    if ! is_asar_file "$backup" || is_ours "$backup"; then warn "$backup is missing or isn't Discord's file - can't keep your original safe, stopping."; return 1; fi
    write_loader "$res"
}

unpatch_folder() { # $1 = folder that holds app.asar
    local res="$1" asar backup
    asar="$res/app.asar"; backup="$res/_app.asar"
    if { is_ours "$asar" || is_ours_dir "$asar"; } && is_asar_file "$backup" && ! is_ours "$backup"; then
        need_admin_for "$res"
        run rm -rf "$asar"
        run mv -f "$backup" "$asar"
        ok "original app.asar is back - o2cord removed from $(kind_of "$res")."
    elif is_asar_file "$asar" && ! is_ours "$asar"; then
        say "  o2cord isn't installed here."
    else
        warn "  nothing to restore ($backup is missing) - reinstall Discord to be safe."
    fi
}

# ── the o2cord files ─────────────────────────────────────────────────────────
fetch() {
    if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 2 "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1"
    else die "I need curl or wget to download o2cord."
    fi
}

# mkdir -p that also gives every folder it had to create to the real user (run with sudo, a plain
# mkdir would leave ~/.local and ~/.local/share owned by root and break the user's other programs)
mkdir_for_user() {
    local dir="$1" p="$1" missing=()
    while [ ! -d "$p" ] && [ "$p" != "/" ]; do missing=("$p" "${missing[@]}"); p="$(dirname "$p")"; done
    mkdir -p "$dir"
    if [ -n "$REAL_USER" ]; then
        for p in "${missing[@]}"; do chown "$REAL_USER": "$p" 2>/dev/null || true; done
    fi
}

download_dist() {
    local f
    ensure_tmp
    mkdir -p "$TMP/dist"
    say "Downloading o2cord..."
    for f in "${DIST_FILES[@]}"; do
        fetch "$FILES_BASE/$f" "$TMP/dist/$f" || die "Couldn't download $f from $FILES_BASE"
        [ -s "$TMP/dist/$f" ] || die "$f came back empty"
    done
    grep -q 'o2cord' "$TMP/dist/patcher.js" || die "patcher.js doesn't look like o2cord - not installing it."
    mkdir_for_user "$DIST_DIR"
    for f in "${DIST_FILES[@]}"; do mv -f "$TMP/dist/$f" "$DIST_DIR/$f"; done
    printf '{}\n' > "$DIST_DIR/package.json"
    # ran with sudo: the files must belong to you, or Discord can't read or update them
    if [ -n "$REAL_USER" ]; then chown -R "$REAL_USER": "$(dirname "$DIST_DIR")" 2>/dev/null || true; fi
    ok "o2cord files are in $DIST_DIR"
}

# ── staying alive across Discord updates ─────────────────────────────────────
# A Discord update replaces app.asar and o2cord disappears. A systemd "path" unit watches
# the file; when it changes, the same script runs in --repair mode and puts o2cord back.
# Two flavours: for a Discord in your own folders everything lives in your home (no admin
# rights, runs while you're logged in); for a system-wide Discord it is a system service.
AR_SCOPE=""      # "user" | "system"

ar_paths() { # sets the paths of the chosen scope
    if [ "$AR_SCOPE" = system ]; then
        AR_SCRIPT=/usr/local/lib/o2cord/install.sh; AR_CONF=/etc/o2cord/repair.conf
        AR_UNITS=/etc/systemd/system; AR_CTL=(systemctl); AR_WANT=multi-user.target
    else
        AR_SCRIPT="$(dirname "$DIST_DIR")/install.sh"; AR_CONF="$(dirname "$DIST_DIR")/repair.conf"
        AR_UNITS="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"; AR_CTL=(systemctl --user); AR_WANT=default.target
    fi
}

ar_have_user_systemd() { command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; }

ar_read_targets() { # existing targets from a config file
    local conf="$1" line
    [ -r "$conf" ] || return 0
    while IFS= read -r line; do case "$line" in TARGET=*) printf '%s\n' "${line#TARGET=}" ;; esac; done < "$conf"
}

setup_autorepair() { # $@ = the folders that now have o2cord in front
    command -v systemctl >/dev/null 2>&1 || { warn "No systemd here, so I can't watch for Discord updates. After a Discord update, run this script again."; return 0; }
    local d writable=1 self
    for d in "$@"; do [ -w "$d" ] || writable=0; done
    if [ "$(id -u)" -ne 0 ] && [ "$writable" = 1 ] && ar_have_user_systemd; then AR_SCOPE=user; else AR_SCOPE=system; fi
    ar_paths

    # where the copy of this script comes from (a piped run has no file to copy)
    ensure_tmp
    self="$TMP/self.sh"
    if [ -f "$0" ] && [ -r "$0" ] && head -n 1 "$0" | grep -q '^#!'; then cat "$0" > "$self"; else fetch "$SCRIPT_URL" "$self" || { warn "Couldn't get the script for the update service - skipped."; return 0; }; fi

    # old + new targets, no duplicates
    local all=() t
    while IFS= read -r t; do [ -n "$t" ] && all+=("$t"); done < <({ ar_read_targets "$AR_CONF"; printf '%s\n' "$@"; } | awk '!seen[$0]++')
    {
        printf 'DIST_DIR=%s\n' "$DIST_DIR"
        for t in "${all[@]}"; do printf 'TARGET=%s\n' "$t"; done
    } > "$TMP/repair.conf"

    {
        printf '[Unit]\nDescription=Put o2cord back in front of Discord after Discord was updated\n\n'
        printf '[Service]\nType=oneshot\nExecStart=/bin/bash %s --repair --config %s\n\n' "$AR_SCRIPT" "$AR_CONF"
        printf '[Install]\nWantedBy=%s\n' "$AR_WANT"
    } > "$TMP/o2cord-repair.service"
    {
        printf '[Unit]\nDescription=Watch Discord for updates (o2cord)\n\n[Path]\n'
        for t in "${all[@]}"; do printf 'PathChanged=%s/app.asar\n' "$t"; done
        printf 'Unit=o2cord-repair.service\n\n[Install]\nWantedBy=%s\n' "$AR_WANT"
    } > "$TMP/o2cord-repair.path"

    if [ "$AR_SCOPE" = system ]; then need_admin_for /etc; else SUDO=""; fi
    run install -D -m 0755 "$self" "$AR_SCRIPT"
    run install -D -m 0644 "$TMP/repair.conf" "$AR_CONF"
    run install -D -m 0644 "$TMP/o2cord-repair.service" "$AR_UNITS/o2cord-repair.service"
    run install -D -m 0644 "$TMP/o2cord-repair.path" "$AR_UNITS/o2cord-repair.path"
    run "${AR_CTL[@]}" daemon-reload
    run "${AR_CTL[@]}" enable --now o2cord-repair.path o2cord-repair.service >/dev/null 2>&1 \
        || { warn "Couldn't start the update service ($AR_SCOPE) - o2cord still works, but after a Discord update run this script again."; return 0; }
    ok "update service is on ($AR_SCOPE): o2cord comes back by itself after Discord updates."
}

# while o2cord is being taken out, the watcher must be off - it would put o2cord straight back
pause_autorepair() {
    local scope
    for scope in user system; do
        AR_SCOPE="$scope"; ar_paths
        [ -e "$AR_UNITS/o2cord-repair.path" ] || continue
        if [ "$scope" = system ]; then need_admin_for /etc; else SUDO=""; fi
        run "${AR_CTL[@]}" stop o2cord-repair.path o2cord-repair.service >/dev/null 2>&1 || true
    done
}

remove_autorepair() {
    local scope
    for scope in user system; do
        AR_SCOPE="$scope"; ar_paths
        [ -e "$AR_UNITS/o2cord-repair.path" ] || [ -e "$AR_CONF" ] || continue
        if [ "$scope" = system ]; then need_admin_for /etc; else SUDO=""; fi
        run "${AR_CTL[@]}" disable --now o2cord-repair.path o2cord-repair.service >/dev/null 2>&1 || true
        run rm -f "$AR_UNITS/o2cord-repair.path" "$AR_UNITS/o2cord-repair.service" "$AR_CONF" "$AR_SCRIPT"
        run "${AR_CTL[@]}" daemon-reload >/dev/null 2>&1 || true
        ok "update service removed ($scope)."
    done
}

# --repair: what the service runs. No questions, no sudo, never downloads.
repair_all() { # $1 = config file
    local conf="$1" line res n=0
    local -a list=()
    [ -r "$conf" ] || die "no config at $conf"
    while IFS= read -r line; do
        case "$line" in
            DIST_DIR=*) DIST_DIR="${line#DIST_DIR=}" ;;
            TARGET=*) list+=("${line#TARGET=}") ;;
        esac
    done < "$conf"
    [ -n "$DIST_DIR" ] || die "config has no DIST_DIR"
    if command -v flock >/dev/null 2>&1; then
        exec 9> "${XDG_RUNTIME_DIR:-/tmp}/o2cord-repair.lock" || true
        flock -w 60 9 || true
    fi
    for res in "${list[@]}"; do
        if [ ! -d "$res" ]; then say "skip $res (not there)"; continue; fi
        if is_ours "$res/app.asar"; then say "ok   $res (already in front)"; continue; fi
        if patch_folder "$res"; then say "back $res (o2cord put back)"; n=$((n + 1)); else say "FAIL $res"; fi
    done
    say "repaired $n"
}

# ── what is installed where ──────────────────────────────────────────────────
status_one() { # $1 = folder that holds app.asar
    local res="$1" asar state
    asar="$res/app.asar"
    if is_ours "$asar"; then state="${G}o2cord is in front${N}"
    elif is_ours_dir "$asar"; then state="${Y}o2cord is in front (older folder-style loader - run install.sh once to upgrade it)${N}"
    elif is_asar_file "$asar" && [ -e "$res/_app.asar" ]; then state="${Y}not in front: Discord was updated and replaced it - run install.sh (or let the update service do it)${N}"
    elif is_asar_file "$asar"; then state="not installed"
    else state="${R}unexpected: $asar isn't a Discord asar${N}"; fi
    say "  $(kind_of "$res")  $res"
    say "    $state"
}

service_status() {
    local scope
    for scope in user system; do
        AR_SCOPE="$scope"; ar_paths
        [ -e "$AR_UNITS/o2cord-repair.path" ] || continue
        say "  update service ($scope): $("${AR_CTL[@]}" is-active o2cord-repair.path 2>/dev/null || echo "not running")  ${D}($AR_UNITS/o2cord-repair.path)${N}"
        found_service=1
    done
}

# ── main ─────────────────────────────────────────────────────────────────────
# ── skipping Discord's "update available" screen ─────────────────────────────
# On Linux Discord won't open while a newer version exists: it shows an update screen
# and waits for you to install the new package. Discord has a setting for this,
# SKIP_HOST_UPDATE in its settings.json - this switches it on (or off again).
# It only touches that one key; the rest of the file stays as it is, and the
# first time a copy is kept next to it as settings.json.o2cord-backup.
discord_config_dirs() { # the config folders of the Discords that have been started at least once
    local base="${XDG_CONFIG_HOME:-$HOME/.config}" d
    for d in discord discordptb discordcanary discorddevelopment; do
        [ -d "$base/$d" ] && printf '%s\n' "$base/$d"
    done
    return 0
}

json_valid() { # $1 = file. Only checked when python3 or node is there; otherwise trusted.
    if command -v python3 >/dev/null 2>&1; then python3 -c 'import json,sys; json.load(open(sys.argv[1], encoding="utf-8"))' "$1" 2>/dev/null; return $?; fi
    if command -v node >/dev/null 2>&1; then node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" 2>/dev/null; return $?; fi
    return 0
}

set_skip_host_update() { # $1 = settings.json, $2 = true|false
    local f="$1" want="$2" tmp
    tmp="$(mktemp)"
    if [ ! -s "$f" ] || grep -Eq '^[[:space:]]*\{[[:space:]]*\}[[:space:]]*$' "$f"; then
        printf '{\n  "SKIP_HOST_UPDATE": %s\n}\n' "$want" > "$tmp"
    elif grep -q '"SKIP_HOST_UPDATE"' "$f"; then
        sed -E 's/"SKIP_HOST_UPDATE"[[:space:]]*:[[:space:]]*(true|false)/"SKIP_HOST_UPDATE": '"$want"'/' "$f" > "$tmp"
    else
        # first "{" gets the new key right after it
        sed -E '0,/\{/s//{\n  "SKIP_HOST_UPDATE": '"$want"',/' "$f" > "$tmp"
    fi
    if ! json_valid "$tmp"; then rm -f "$tmp"; return 1; fi
    [ ! -f "$f" ] || [ -e "$f.o2cord-backup" ] || cp -p "$f" "$f.o2cord-backup"
    cat "$tmp" > "$f"      # same file, same owner and permissions
    rm -f "$tmp"
}

host_update_all() { # $1 = skip-update | allow-update
    local want=true dir f n=0
    [ "$1" = allow-update ] && want=false
    if pgrep -x -i 'discord|discordptb|discordcanary' >/dev/null 2>&1; then
        warn "Discord is running right now - it writes settings.json again when it closes and would undo this. Close Discord completely, then run this again."
        exit 1
    fi
    while IFS= read -r dir; do
        [ -n "$dir" ] || continue
        f="$dir/settings.json"
        if set_skip_host_update "$f" "$want"; then
            ok "$(basename "$dir"): SKIP_HOST_UPDATE = $want"
            n=$((n+1))
        else
            warn "$f: couldn't change it safely (left as it was)."
        fi
    done < <(discord_config_dirs)
    if [ "$n" -eq 0 ]; then
        say "I didn't find a Discord settings folder in ${XDG_CONFIG_HOME:-$HOME/.config} (Discord creates it the first time it starts)."
        say "Start Discord once, close it, and run this again."
        exit 1
    fi
    if [ "$want" = true ]; then
        say "Start Discord again: it will no longer stop at the update screen."
        say "${D}(Undo with: bash install.sh --allow-update)${N}"
    else
        say "Discord will ask you to update again when a new version comes out."
    fi
}

main() {
    local ACTION=install ALL=0 TARGET="" AUTO=ask CONFIG="" d line i pick
    found_service=0
    # a system service starts with an empty environment: no HOME
    if [ -z "${HOME:-}" ]; then HOME="$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)"; HOME="${HOME:-/root}"; fi
    export HOME
    while [ $# -gt 0 ]; do
        case "$1" in
            --uninstall|--remove) ACTION=uninstall ;;
            --list) ACTION=list ;;
            --status) ACTION=status ;;
            --repair) ACTION=repair ;;
            --skip-update) ACTION=skip-update ;;
            --allow-update) ACTION=allow-update ;;
            --config) shift; [ $# -gt 0 ] || die "--config needs a file"; CONFIG="$1" ;;
            --config=*) CONFIG="${1#--config=}" ;;
            --all) ALL=1 ;;
            --auto-repair) AUTO=yes ;;
            --no-auto-repair) AUTO=no ;;
            --target) shift; [ $# -gt 0 ] || die "--target needs a path"; TARGET="$1" ;;
            --target=*) TARGET="${1#--target=}" ;;
            -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
            *) unknown_option "$1" ;;
        esac
        shift
    done

    [ "$(uname -s)" = "Linux" ] || die "This installer is for Linux. On Windows use the installer from the website."

    # Run with sudo: set o2cord up for the person who called sudo, not for root
    # (Discord runs as that person and must be able to read - and update - the files)
    if [ "$(id -u)" -eq 0 ] && [ "$ACTION" != repair ]; then
        if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
            REAL_USER="$SUDO_USER"
            local real_home; real_home="$(getent passwd "$REAL_USER" | cut -d: -f6)"
            [ -n "$real_home" ] && [ -d "$real_home" ] || die "Couldn't find the home folder of $REAL_USER."
            HOME="$real_home"
            XDG_DATA_HOME=""
            XDG_CONFIG_HOME=""
        else
            warn "Running as root without sudo: o2cord would be set up for root's home, not yours. Run it as your normal user instead."
        fi
    fi
    DIST_DIR="${O2CORD_DIST_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/o2cord/dist}"

    if [ "$ACTION" = skip-update ] || [ "$ACTION" = allow-update ]; then
        host_update_all "$ACTION"
        return 0
    fi

    if [ "$ACTION" = repair ]; then
        if [ -z "$CONFIG" ]; then
            if [ "$(id -u)" -eq 0 ]; then CONFIG=/etc/o2cord/repair.conf; else CONFIG="$(dirname "$DIST_DIR")/repair.conf"; fi
        fi
        repair_all "$CONFIG"
        return 0
    fi

    local TARGETS=()
    if [ -n "$TARGET" ]; then
        # a folder, or the discord command / binary / launcher script
        local found_target=""
        if [ -d "$TARGET" ]; then found_target="$(resolve_dir "$TARGET" || true)"; fi
        if [ -z "$found_target" ] && [ -e "$TARGET" ]; then
            while IFS= read -r d; do
                [ -n "$d" ] || continue
                found_target="$(resolve_dir "$d" || true)"
                [ -z "$found_target" ] || break
            done < <(launcher_dirs "$TARGET")
        fi
        if [ -z "$found_target" ]; then
            [ -e "$TARGET" ] || die "$TARGET doesn't exist."
            say "I couldn't find app.asar from $TARGET."
            say "Give me the folder that holds app.asar (often .../discord/resources), or the discord command."
            diagnose
            exit 1
        fi
        TARGETS=("$found_target")
    else
        while IFS= read -r line; do [ -n "$line" ] && TARGETS+=("$line"); done < <(find_discords)
        if [ "${#TARGETS[@]}" -eq 0 ]; then
            say "${D}Not in the usual places - searching your disk (up to 20 seconds)...${N}"
            while IFS= read -r line; do
                [ -n "$line" ] || continue
                line="$(dirname "$line")"
                if not_flatpak_snap "$line"; then TARGETS+=("$line"); fi
            done < <(search_disk | awk '!seen[$0]++')
        fi
    fi

    if [ "${#TARGETS[@]}" -eq 0 ]; then
        unsupported_hint
        printf '%s✗ Couldn'"'"'t find Discord.%s\n' "$R" "$N" >&2
        diagnose >&2
        exit 1
    fi

    if [ "$ACTION" = list ]; then
        for d in "${TARGETS[@]}"; do say "$(kind_of "$d")  $d"; done
        unsupported_hint
        exit 0
    fi

    if [ "$ACTION" = status ]; then
        say "${B}Discord installs:${N}"
        for d in "${TARGETS[@]}"; do status_one "$d"; done
        say "${B}o2cord files:${N}"
        if [ -s "$DIST_DIR/patcher.js" ]; then say "  $DIST_DIR  ${G}(present)${N}"; else say "  $DIST_DIR  ${R}(missing - run install.sh)${N}"; fi
        say "${B}Update service:${N}"
        service_status
        [ "$found_service" = 1 ] || say "  none (run: bash install.sh --auto-repair)"
        exit 0
    fi

    # which ones
    local CHOSEN=("${TARGETS[@]}")
    if [ "${#TARGETS[@]}" -gt 1 ] && [ "$ALL" = 0 ] && [ -z "$TARGET" ]; then
        say "Found ${#TARGETS[@]} Discords:"
        i=1; for d in "${TARGETS[@]}"; do say "  $i) $(kind_of "$d")  ${D}$d${N}"; i=$((i + 1)); done
        if have_tty; then
            printf 'Which one? [1-%s, a = all] ' "${#TARGETS[@]}" > /dev/tty
            read -r pick < /dev/tty || pick=""
        else
            pick=""
        fi
        if [ "$pick" = "a" ] || [ "$pick" = "A" ]; then CHOSEN=("${TARGETS[@]}")
        elif [[ "$pick" =~ ^[0-9]+$ ]] && [ "$pick" -ge 1 ] && [ "$pick" -le "${#TARGETS[@]}" ]; then CHOSEN=("${TARGETS[$((pick - 1))]}")
        else die "No choice made. Run again with --all, or --target PATH."
        fi
    fi

    if pgrep -x -i 'discord|discordptb|discordcanary' >/dev/null 2>&1; then
        warn "Discord is running. Installing works, but you need to restart it afterwards."
    fi

    if [ "$ACTION" = uninstall ]; then
        pause_autorepair
        for d in "${CHOSEN[@]}"; do
            say "${B}$(kind_of "$d") Discord${N} ${D}($d)${N}"
            unpatch_folder "$d"
        done
        # Discords the service watches that still have o2cord in front: the service stays for those only
        local remaining=() t conf
        for conf in /etc/o2cord/repair.conf "$(dirname "$DIST_DIR")/repair.conf"; do
            while IFS= read -r t; do
                [ -n "$t" ] || continue
                if is_ours "$t/app.asar" || is_ours_dir "$t/app.asar"; then remaining+=("$t"); fi
            done < <(ar_read_targets "$conf")
        done
        remove_autorepair
        if [ "${#remaining[@]}" -gt 0 ]; then setup_autorepair "${remaining[@]}"; fi
        say "${D}Your o2cord settings stay in ~/.config/o2cord (older versions: ~/.config/Vencord) and the program files in $DIST_DIR - delete them if you want everything gone.${N}"
        exit 0
    fi

    download_dist
    local done_list=()
    for d in "${CHOSEN[@]}"; do
        say "${B}$(kind_of "$d") Discord${N} ${D}($d)${N}"
        if patch_folder "$d"; then
            ok "o2cord is set up for $(kind_of "$d") - restart Discord to load it."
            done_list+=("$d")
        else
            warn "  $(kind_of "$d") was left as it was."
        fi
    done
    [ "${#done_list[@]}" -gt 0 ] || die "Nothing was installed."

    # surviving Discord updates
    case "$AUTO" in
        yes) setup_autorepair "${done_list[@]}" ;;
        no) ;;
        ask)
            if have_tty; then
                local ans=""
                say ""
                say "A Discord update replaces the file o2cord sits in, so o2cord would disappear."
                say "I can add a small background service that puts it back by itself (remove it any time with --uninstall)."
                printf 'Add it? [Y/n] ' > /dev/tty
                read -r ans < /dev/tty || ans=""
                case "$ans" in n|N|no|NO) say "${D}OK - after a Discord update, run this script again.${N}" ;; *) setup_autorepair "${done_list[@]}" ;; esac
            else
                say "${D}To keep o2cord after Discord updates, run: bash install.sh --auto-repair${N}"
            fi ;;
    esac

    say ""
    say "Open Discord, go to Settings and look for the ${B}o2cord${N} section."
    say "${D}Check on it any time: bash install.sh --status   Remove it: bash install.sh --uninstall${N}"
}

if [ "${O2CORD_SOURCE_ONLY:-0}" != 1 ]; then main "$@"; fi
