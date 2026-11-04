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
#
# o2cord then updates itself from inside Discord - run this again only if Discord
# itself was updated and o2cord disappeared, or to remove it (--uninstall).
#
# Not supported yet: Flatpak and Snap Discord (their files are read-only).
#
# Usage:
#   bash install.sh                 install (asks which Discord if there are several)
#   bash install.sh --all           install into every Discord found
#   bash install.sh --target DIR    install into one folder (the one that has resources/app.asar)
#   bash install.sh --list          only show the Discords found
#   bash install.sh --uninstall     put the original app.asar back
#   bash install.sh --help

set -euo pipefail

FILES_BASE="${O2CORD_FILES_BASE:-https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/files}"
DIST_DIR="${O2CORD_DIST_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/o2cord/dist}"
DIST_FILES=(patcher.js preload.js renderer.js renderer.css)

if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; N=$'\033[0m'; else B=; G=; Y=; R=; D=; N=; fi
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s!%s %s\n' "$Y" "$N" "$*" >&2; }
die()  { printf '%s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

ACTION=install
ALL=0
TARGET=""
while [ $# -gt 0 ]; do
    case "$1" in
        --uninstall|--remove) ACTION=uninstall ;;
        --list) ACTION=list ;;
        --all) ALL=1 ;;
        --target) shift; [ $# -gt 0 ] || die "--target needs a folder"; TARGET="$1" ;;
        --target=*) TARGET="${1#--target=}" ;;
        -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "Unknown option: $1 (try --help)" ;;
    esac
    shift
done

[ "$(uname -s)" = "Linux" ] || die "This installer is for Linux. On Windows use the installer from the website."
[ "$(id -u)" -ne 0 ] || warn "Running as root: o2cord would be set up for root's home, not yours. Run it as your normal user - it asks for sudo only when needed."

# ── finding Discord ───────────────────────────────────────────────────────────
# a folder counts when it has resources/app.asar (or the _app.asar we leave behind)
is_discord_dir() { [ -e "$1/resources/app.asar" ] || [ -e "$1/resources/_app.asar" ]; }

find_discords() {
    local d
    for d in \
        /usr/share/discord /usr/share/discord-ptb /usr/share/discord-canary \
        /usr/lib/discord /usr/lib/discord-ptb /usr/lib/discord-canary \
        /usr/lib64/discord /usr/lib64/discord-ptb /usr/lib64/discord-canary \
        /opt/discord /opt/Discord /opt/discord-ptb /opt/DiscordPTB /opt/discord-canary /opt/DiscordCanary \
        "$HOME/.local/share/discord" "$HOME/Discord" "$HOME/DiscordPTB" "$HOME/DiscordCanary"; do
        is_discord_dir "$d" && printf '%s\n' "$d"
    done
    return 0
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

# ── doing things in a folder that may need admin rights ──────────────────────
SUDO=""
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

is_asar_file() { [ -f "$1" ] && [ "$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')" = "04000000" ]; }

loader_js() { printf 'require(%s);\n' "\"$DIST_DIR/patcher.js\""; }

# ── the o2cord files ─────────────────────────────────────────────────────────
fetch() {
    if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 2 "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1"
    else die "I need curl or wget to download o2cord."
    fi
}

TMP=""
trap 'rm -rf "${TMP:-}"' EXIT

download_dist() {
    local tmp f
    tmp="$(mktemp -d)"; TMP="$tmp"
    say "Downloading o2cord..."
    for f in "${DIST_FILES[@]}"; do
        fetch "$FILES_BASE/$f" "$tmp/$f" || die "Couldn't download $f from $FILES_BASE"
        [ -s "$tmp/$f" ] || die "$f came back empty"
    done
    grep -q 'o2cord' "$tmp/patcher.js" || die "patcher.js doesn't look like o2cord - not installing it."
    mkdir -p "$DIST_DIR"
    for f in "${DIST_FILES[@]}"; do mv -f "$tmp/$f" "$DIST_DIR/$f"; done
    printf '{}\n' > "$DIST_DIR/package.json"
    ok "o2cord files are in $DIST_DIR"
}

# ── install / uninstall one Discord ──────────────────────────────────────────
install_one() {
    local dir="$1" res asar backup
    res="$dir/resources"; asar="$res/app.asar"; backup="$res/_app.asar"
    say "${B}$(kind_of "$dir") Discord${N} ${D}($dir)${N}"
    need_admin_for "$res"

    if [ -d "$asar" ]; then
        # already patched: just point the loader at the current files
        if [ -f "$asar/index.js" ] && ! grep -q 'o2cord' "$asar/index.js"; then
            warn "  another mod's loader was here - replacing it with o2cord's."
        fi
    elif is_asar_file "$asar"; then
        # Discord's own file (also after a Discord update replaced our loader): keep it as the backup
        run mv -f "$asar" "$backup"
    else
        die "$asar isn't a Discord app.asar - not touching it."
    fi
    is_asar_file "$backup" || die "$backup is missing or isn't a valid asar - can't keep your original safe, stopping."

    run mkdir -p "$asar"
    loader_js | run tee "$asar/index.js" >/dev/null
    printf '{"name":"discord","main":"index.js"}\n' | run tee "$asar/package.json" >/dev/null
    ok "o2cord is set up for $(kind_of "$dir") - restart Discord to load it."
}

uninstall_one() {
    local dir="$1" res asar backup
    res="$dir/resources"; asar="$res/app.asar"; backup="$res/_app.asar"
    say "${B}$(kind_of "$dir") Discord${N} ${D}($dir)${N}"
    if [ -d "$asar" ] && is_asar_file "$backup"; then
        need_admin_for "$res"
        run rm -rf "$asar"
        run mv -f "$backup" "$asar"
        ok "original app.asar is back - o2cord removed from $(kind_of "$dir")."
    elif is_asar_file "$asar"; then
        say "  o2cord isn't installed here."
    else
        warn "  nothing to restore ($backup is missing) - reinstall Discord to be safe."
    fi
}

# ── main ─────────────────────────────────────────────────────────────────────
TARGETS=()
if [ -n "$TARGET" ]; then
    is_discord_dir "$TARGET" || die "$TARGET has no resources/app.asar - is that a Discord folder?"
    TARGETS=("$TARGET")
else
    while IFS= read -r line; do [ -n "$line" ] && TARGETS+=("$line"); done < <(find_discords)
fi

if [ "${#TARGETS[@]}" -eq 0 ]; then
    unsupported_hint
    die "Couldn't find Discord. If it lives somewhere unusual: bash install.sh --target /path/to/discord"
fi

if [ "$ACTION" = list ]; then
    for d in "${TARGETS[@]}"; do say "$(kind_of "$d")  $d"; done
    unsupported_hint
    exit 0
fi

# which ones
CHOSEN=("${TARGETS[@]}")
if [ "${#TARGETS[@]}" -gt 1 ] && [ "$ALL" = 0 ] && [ -z "$TARGET" ]; then
    say "Found ${#TARGETS[@]} Discords:"
    i=1; for d in "${TARGETS[@]}"; do say "  $i) $(kind_of "$d")  ${D}$d${N}"; i=$((i + 1)); done
    if [ -r /dev/tty ]; then
        printf 'Which one? [1-%s, a = all] ' "${#TARGETS[@]}" > /dev/tty
        read -r pick < /dev/tty || pick=""
    else
        pick=""
    fi
    if [ "$pick" = "a" ] || [ "$pick" = "A" ]; then CHOSEN=("${TARGETS[@]}")
    elif [[ "$pick" =~ ^[0-9]+$ ]] && [ "$pick" -ge 1 ] && [ "$pick" -le "${#TARGETS[@]}" ]; then CHOSEN=("${TARGETS[$((pick - 1))]}")
    else die "No choice made. Run again with --all, or --target DIR."
    fi
fi

if pgrep -x -i 'discord|discordptb|discordcanary' >/dev/null 2>&1; then
    warn "Discord is running. Installing works, but you need to restart it afterwards."
fi

if [ "$ACTION" = uninstall ]; then
    for d in "${CHOSEN[@]}"; do uninstall_one "$d"; done
    say "${D}Your o2cord settings stay in ~/.config/o2cord and the files in $DIST_DIR - delete them if you want everything gone.${N}"
    exit 0
fi

download_dist
for d in "${CHOSEN[@]}"; do install_one "$d"; done
say ""
say "Open Discord, go to Settings and look for the ${B}o2cord${N} section."
say "${D}Discord updated and o2cord vanished? Run this again. To remove it: bash install.sh --uninstall${N}"
