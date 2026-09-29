/*
 * o2cord, a Discord client mod
 * Copyright (c) 2026 Ryder
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * "What's new in o2cord!?" - opens once after each update, laid out like
 * PluginModal (the plugin settings window) at Ryder's request: which plugins
 * changed, a cropped picture for each new feature, and fixes as plain text.
 * The content lives in releases.ts.
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Forms, Modal, openModal, Text, useEffect, useRef } from "@webpack/common";

import { Release, RELEASES } from "./releases";

const LAST_SEEN_KEY = "o2cord.whatsNew.lastSeen";

function updatedPlugins(release: Release) {
    const names = [...release.features.map(f => f.plugin), ...release.fixes.map(f => f.plugin)];
    return [...new Set(names.filter((name): name is string => !!name))];
}

function WhatsNewModal({ release, transitionState, onClose }: RenderModalProps & { release: Release; }) {
    const plugins = updatedPlugins(release);
    const contentRef = useRef<HTMLDivElement>(null);

    // The modal auto-focuses the "Got it" button at the bottom, which
    // scrolled it straight past the first feature on open - start at the top.
    useEffect(() => {
        const timer = setTimeout(() => {
            let el = contentRef.current?.parentElement;
            while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
            el?.scrollTo({ top: 0 });
        }, 50);
        return () => clearTimeout(timer);
    }, []);

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="md"
            title={
                <div className="o2-whats-new-title">
                    <BaseText tag="h1" weight="semibold" size="lg">What's new in o2cord!?</BaseText>
                    <span className="o2-whats-new-version">v{release.version}</span>
                </div>
            }
            subtitle={
                <div>
                    <Forms.FormText>{release.date} · Updated plugins:</Forms.FormText>
                    <div className="vc-plugin-modal-tags">
                        {plugins.map(name => <div key={name} className="vc-plugin-modal-tag">{name}</div>)}
                    </div>
                </div>
            }
        >
            <div className="o2-whats-new-content" ref={contentRef}>
                {release.features.map((feature, i) => (
                    <section key={i}>
                        <div className={classes("o2-whats-new-feature-head", i === 0 ? Margins.top8 : Margins.top16, Margins.bottom8)}>
                            <Text variant="heading-lg/semibold">{feature.title}</Text>
                            <span className="o2-whats-new-badge">NEW</span>
                            <span className="o2-whats-new-plugin">{feature.plugin}</span>
                        </div>
                        <Forms.FormText className={Margins.bottom8}>{feature.text}</Forms.FormText>
                        {feature.image && <img className="o2-whats-new-image" src={feature.image} alt="" />}
                    </section>
                ))}

                {release.fixes.length > 0 && (
                    <section>
                        <Text variant="heading-lg/semibold" className={classes(Margins.top16, Margins.bottom8)}>Fixes</Text>
                        <ul className="o2-whats-new-fixes">
                            {release.fixes.map((fix, i) => (
                                <li key={i}>
                                    {fix.plugin && <strong>{fix.plugin}: </strong>}
                                    {fix.text}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <div className="o2-whats-new-footer">
                    <Button variant="primary" size="medium" onClick={onClose}>Got it</Button>
                </div>
            </div>
        </Modal>
    );
}

export function openWhatsNew(release: Release = RELEASES[0]) {
    if (!release) return;
    openModal(props => <WhatsNewModal {...props} release={release} />);
}

let showTimer: ReturnType<typeof setTimeout> | undefined;

export default definePlugin({
    name: "O2WhatsNew",
    description: "Shows what's new in o2cord once after each update.",
    tags: ["Utility"],
    authors: [Devs.Ryder],
    enabledByDefault: true,

    settingsAboutComponent: () => (
        <Button variant="secondary" size="small" onClick={() => openWhatsNew()}>Show What's New</Button>
    ),

    openWhatsNew,

    start() {
        const latest = RELEASES[0];
        if (!latest) return;

        // A few seconds in, so it doesn't pop over Discord's own loading.
        showTimer = setTimeout(async () => {
            const lastSeen = await DataStore.get<string>(LAST_SEEN_KEY).catch(() => undefined);
            if (lastSeen === latest.version) return;
            await DataStore.set(LAST_SEEN_KEY, latest.version);
            openWhatsNew(latest);
        }, 4000);
    },

    stop() {
        clearTimeout(showTimer);
    }
});
