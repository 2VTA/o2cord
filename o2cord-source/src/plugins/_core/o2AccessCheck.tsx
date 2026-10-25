/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The o2cord blacklist (managed from Callie's menu > Blacklist). Each time an
 * account logs in, this reads update-package/public/blacklist.json from the
 * o2cord repo. If the account is on it, o2cord says so in a window, turns
 * its plugins off for that session and drops its "o2cord Settings" section
 * from Discord's settings, as if it were uninstalled. It's out in the open: listed in the
 * plugin list, shows a message, and only ever looks at the account's public
 * Discord id - no token, nothing is written to the PC, nothing is sent.
 * Ryder's own account is never affected.
 */

import { plugins, stopPlugin } from "@api/PluginManager";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Forms, Modal, openModal, UserStore } from "@webpack/common";

const BLACKLIST_URL = "https://raw.githubusercontent.com/2VTA/o2cord/main/update-package/public/blacklist.json";
const RECHECK_MS = 30 * 60 * 1000;
const SELF = "O2AccessCheck";

let revoked = false;
let timer: ReturnType<typeof setInterval> | undefined;

/** True once this account was found on the blacklist - the settings page then drops the whole o2cord section. */
export const isRevoked = () => revoked;

/** True when `id` is on the list. Ryder is never on it, whatever the file says. */
export function isListed(id: string | undefined, users: unknown): boolean {
    if (!id || !Array.isArray(users)) return false;
    if (id === String(Devs.Ryder.id)) return false;
    return users.includes(id);
}

async function fetchList(): Promise<unknown | null> {
    try {
        const res = await fetch(`${BLACKLIST_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return null; // no list yet, or offline - leave everything on
        return (await res.json())?.users ?? null;
    } catch {
        return null;
    }
}

function RevokedModal({ transitionState, onClose }: RenderModalProps) {
    return (
        <Modal transitionState={transitionState} onClose={onClose} size="sm" title="o2cord access removed">
            <Forms.FormText style={{ margin: "8px 0 16px" }}>
                Your o2cord access was removed, so o2cord is switched off on this account. If you think this is a mistake, talk to the o2cord team.
            </Forms.FormText>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button variant="primary" size="medium" onClick={onClose}>OK</Button>
            </div>
        </Modal>
    );
}

function revoke() {
    if (revoked) return;
    revoked = true;
    clearInterval(timer);
    openModal(props => <RevokedModal {...props} />);
    // Everything optional goes off; the base plugins Discord's own client leans on stay.
    for (const p of Object.values(plugins)) {
        if (p.name !== SELF && p.started && !p.required && !p.name.endsWith("API")) {
            try { stopPlugin(p); } catch { /* keep going */ }
        }
    }
}

// `asId` is only for testing the whole path with another account's id.
async function check(asId?: string) {
    if (revoked) return;
    const id = asId ?? UserStore.getCurrentUser?.()?.id;
    if (!id) return;
    if (isListed(id, await fetchList())) revoke();
}

export default definePlugin({
    name: SELF,
    description: "Checks o2cord's access list when you log in. If your account was removed from o2cord, it tells you and turns o2cord off.",
    authors: [Devs.Ryder],
    required: true,

    isListed,
    revoke,
    check,

    flux: {
        CONNECTION_OPEN: () => { void check(); }
    },

    start() {
        void check();
        timer = setInterval(() => void check(), RECHECK_MS);
    },

    stop() {
        clearInterval(timer);
    }
});
