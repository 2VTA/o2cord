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
#   bash install.sh --target PATH   install into one Discord: its folder, or the discord command
#                                   (e.g. --target /opt/discord  or  --target "$(command -v discord)")
#   bash install.sh --list          only show the Discords found
#   bash install.sh --uninstall     put the original app.asar back
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

# ── "did you mean --target?" for typos ───────────────────────────────────────
KNOWN_OPTIONS=(--all --target --list --uninstall --remove --help)

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

ACTION=install
ALL=0
TARGET=""
while [ $# -gt 0 ]; do
    case "$1" in
        --uninstall|--remove) ACTION=uninstall ;;
        --list) ACTION=list ;;
        --all) ALL=1 ;;
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
REAL_USER=""
if [ "$(id -u)" -eq 0 ]; then
    if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
        REAL_USER="$SUDO_USER"
        REAL_HOME="$(getent passwd "$REAL_USER" | cut -d: -f6)"
        [ -n "$REAL_HOME" ] && [ -d "$REAL_HOME" ] || die "Couldn't find the home folder of $REAL_USER."
        HOME="$REAL_HOME"
        XDG_DATA_HOME=""
    else
        warn "Running as root without sudo: o2cord would be set up for root's home, not yours. Run it as your normal user instead."
    fi
fi

FILES_BASE="${O2CORD_FILES_BASE:-https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/files}"
DIST_DIR="${O2CORD_DIST_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/o2cord/dist}"
DIST_FILES=(patcher.js preload.js renderer.js renderer.css)

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
    for try in "$d" "$d/.." "$d/../.."; do
        [ -d "$try" ] || continue
        if asar_home "$try"; then return 0; fi
    done
    return 1
}

KNOWN_FOLDERS=(
    /usr/share/discord /usr/share/discord-ptb /usr/share/discord-canary
    /usr/lib/discord /usr/lib/discord-ptb /usr/lib/discord-canary
    /usr/lib64/discord /usr/lib64/discord-ptb /usr/lib64/discord-canary
    /opt/discord /opt/Discord /opt/discord-ptb /opt/DiscordPTB /opt/discord-canary /opt/DiscordCanary
    /usr/lib/discord_arch_electron /opt/discord_arch_electron
    "$HOME/.local/share/discord" "$HOME/Discord" "$HOME/DiscordPTB" "$HOME/DiscordCanary"
)
LAUNCHERS=(discord discord-ptb discord-canary Discord DiscordPTB DiscordCanary discord-stable)

not_flatpak_snap() { case "$1" in */flatpak/*|*/snap/*|/var/lib/snapd/*) return 1 ;; *) return 0 ;; esac; }

find_discords() {
    local d l p found=()
    {
        for d in "${KNOWN_FOLDERS[@]}"; do [ -d "$d" ] && resolve_dir "$d" || true; done
        for l in "${LAUNCHERS[@]}"; do
            p="$(command -v "$l" 2>/dev/null || true)"
            [ -n "$p" ] || continue
            while IFS= read -r d; do [ -n "$d" ] && resolve_dir "$d" || true; done < <(launcher_dirs "$p")
        done
        while IFS= read -r d; do [ -n "$d" ] && resolve_dir "$d" || true; done < <(running_dirs)
    } 2>/dev/null | while IFS= read -r p; do
        p="$(readlink -f "$p" 2>/dev/null || printf '%s' "$p")"
        not_flatpak_snap "$p" && printf '%s\n' "$p"
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
    # ran with sudo: the files must belong to you, or Discord can't read or update them
    if [ -n "$REAL_USER" ]; then chown -R "$REAL_USER": "$(dirname "$DIST_DIR")" 2>/dev/null || true; fi
    ok "o2cord files are in $DIST_DIR"
}

# ── install / uninstall one Discord ($1 = the folder that holds its app.asar) ─
install_one() {
    local res="$1" asar backup
    asar="$res/app.asar"; backup="$res/_app.asar"
    say "${B}$(kind_of "$res") Discord${N} ${D}($res)${N}"
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
    ok "o2cord is set up for $(kind_of "$res") - restart Discord to load it."
}

uninstall_one() {
    local res="$1" asar backup
    asar="$res/app.asar"; backup="$res/_app.asar"
    say "${B}$(kind_of "$res") Discord${N} ${D}($res)${N}"
    if [ -d "$asar" ] && is_asar_file "$backup"; then
        need_admin_for "$res"
        run rm -rf "$asar"
        run mv -f "$backup" "$asar"
        ok "original app.asar is back - o2cord removed from $(kind_of "$res")."
    elif is_asar_file "$asar"; then
        say "  o2cord isn't installed here."
    else
        warn "  nothing to restore ($backup is missing) - reinstall Discord to be safe."
    fi
}

# ── main ─────────────────────────────────────────────────────────────────────
TARGETS=()
if [ -n "$TARGET" ]; then
    # a folder, or the discord command / binary / launcher script
    found_target=""
    if [ -d "$TARGET" ]; then
        found_target="$(resolve_dir "$TARGET" || true)"
    fi
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
            not_flatpak_snap "$line" && TARGETS+=("$line")
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
    else die "No choice made. Run again with --all, or --target PATH."
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
