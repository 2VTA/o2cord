/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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

import { HeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Popout, useRef, useState } from "@webpack/common";
import type { PropsWithChildren } from "react";

import { renderPopout } from "./menu";

const TOOLBOX_CLOSED_ICON = "data:image/png;base64,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";
const TOOLBOX_OPEN_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAABqCAYAAAB04VkvAAAHnElEQVR4nO2dS2wkRxnH/1XVY+N41h5ba1ZRkg2JEjZLNhDghiIhpFyiiBuPHBBKorwQ4gIXTkCUWzYHxAGUS4CEYyIuuUVwBymbRCIoWliWsJB9eHc843nYnumqj0NP2WY83T2PmnEP3/eTRn6oVf1N12+qq2vqqwIE1qgplbsI4P4plc0ZQlJnfwew2/udjjWiPnTv5zkkgclrOq8v966zyauQPKJJC0jBHXrpnGOF4bFIKt2FKnBaAgAHFS8ChIMQ+HpK5TBHBGCOCMAcEYA543QCI6SPH2gArlQqRUTBOqrCEVQUx3EJyRNB2oeYAMR5JY0jQG6h3W53c4xyheHZBNDtvSZiHAG+A2AVB6NS+2gN5Rzo9OlTtz/66JcQd61S0xprZAgRqYWFEv7wxwsvXL587YrWWjvn+ptaXy9NAL/NK3OU6vHDjlUAa4MO0FrBOcIDD5zGX//yGlqtXWgtBoTCOYfyyjK++PCzeP+DS9Ba42j979MCUM4rc5wW4Hqv4NRRvji26urVarSzsycCBMQ5h1ZrD91uHCP9OwBfL9eHKXPcTmAJGQIopVAqGXS7RgQIiHPJdVVKZdWbr5eh6lYeA5kjAjBHBGCOCMCcwx0Fg+zHQgWAjDGpz/b+MdCYsF5Z60CUP/EliiaeHzEycWxzj1FKBb0mxmhEkek9BqZUBkHF1uZ2BA8fkP9OAFhrc0cCq1sNhBoAIiJUKuXcyiUi1GrNMCcdgZMnV5E32mWtRb3eyj1uGJRS2Npq9sTLrDKLIYeCTe/g5wA8hoNZJ0dOTEQ4//Jzd356Yw17e12l+h7x/EhReflT6HTiid+wc4RyeQk/+elvcPHilYEDHz6ucnkJr5x/HlEUDdVaTIpSSXzPPPvKfuX2n9fHe+89t+PFF59Euz3ZuIhSCjs7HZx/+XlsN9oDJwQmo4URqtXGqR/+6Fe/zy0TyTN9F8BrAJ7KOjkR4b13X8WDD34mc5TPOYft7Z2JWwFrHdbXV/CVR36ADz/8Z+axxihc/Oh1LC6W4NzsBDhz9kns7nYyj73/vjvw5z/9ErVac+JbARHhxInbUsshIiwtLeLSpU/wuXNP55Z3+BbQRNJkdJFIMZBarWlu3qyr7FG+cPc8IsLq6jIiY6CNhrN9Q59KAUSorC0HOd+orK2VsXmjvh/HYXy8q6vLwVolpRTq9RbSBgKJCIuLC9jaagIjfhvoR48IGaNIvgNizOxG+ax1iK2FAcHawbeA/v/PCh/boFuAjzd0bFkfLiLq1Y8GhhgNlMdA5ogAzBEBmCMCMEcEYI4IwBwRgDkiAHNEAOaIAMwRAZgjAjBHBGCOCMAcEYA5IgBzRADmiADMEQGYIwIwRwRgjgjAHBGAOf25gbkrT8WxjeLYqji26XkBCohMuETNg1wEfSTdzM/HP47EUCBJSI0iMzgvoBdv+GRZ25+Dsg8RIY4t4tiOvEzcKpKMoNSsICBJhjx1ag2tVnpmkLUWtVorSILo4WTIrEzczc365Ccbg83Nempc/v9bW40giaFAUsHr6yswxmDAQm291LAFNBo7Pu0vkwgHS4+/DaCOlORQzxu/e+e7lUq50unEpPrelc+OqlTK+OY3voo4thNJoJTC3l4HT3z7a/j442tQWoGO5P0lKZJLty1Ca536yZgW33vh62g2dzBo7wYf7513bKDT6U4sARFhYSHC62+8g1u3tge2OgBRFEWq0Wg3APw6r8xxIvoIwBlkLBK1sVEJtkycTw8vRWaA7wefAUeEarUx0bnGYX3tBLRWmbF1Y4tarRkgW9phZWUZn//CM/j3f26mHoakXi4DuDevzP4FIrJuVgoARZGJBuRBAjhYIOLkydWgyZDVaqOwC0Tc2KzlHqMUek325BAl1/fa9a3UdQJ79RPFsR3qFuDJW3FAAaBe52IgXoBhVs0YhdCdqJAc16okSSecshaKJAyxlGxxr6wwE0QA5ogAzBEBmCMCMEcEYI4IwBwRgDkiAHNEAOaIAMwRAZgjAjBHBGDOOLuGzZz/h90nZ7GE/TjMhQBZkyDnAaWSvQOKSKEFsNahUinjW0+8hAsXLsIYfWyrgo+Dj/ehc/fgrTd/hu3tduEmtxRaAMBPCdvGrVvbxx3K2PgJnEWk8AIAQKkU7c+vn8cWoFQq7mUubmSHIKL/ec0L8xBzsW5IwswRAZgjAjBnLvoAWitorY8l9WsSfLyz2lxrHAovgFIK7fYenHNZSRCFxMfbbu8F20k1NIUWQKkkC+bs2bthrdvPPJoXfLxnPnsXrHWFlKDQAmit0Wy28Yuff79wI2ijYK3rpdMX7z0UWgDg4BaQtlPmfKAK2w8ovACA70QV8wLOO8Vrk4SZIgIwRwRgjgjAHBGAOSIAc0QA5ogAzBEBmCMCMEcEYI4IwBwRgDkiAHOm8nUw0eH1bOVr3FA45xDHNmiewVQEiCKNjY0K2q1daCMChMJZhxMry0EXqA4qgDfzypUbeOzxHyfz4GQiRzAIhMgY/OPy1eTvAC3BKLXjt8T4G4D7kLFhhHCs+Hr5F4C78w6eyi0gyYf3e9oIYVFwLtx6CVPrBFobdtMIYTpIE84cEYA5IgBz/guX/Tup3JdpmwAAAABJRU5ErkJggg==";

export const settings = definePluginSettings({
    showPluginMenu: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show the plugins menu in the toolbox",
    }
});

function Icon({ isShown, width = 20, height = 20 }: { isShown: boolean; width?: number; height?: number; }) {
    return (
        <img
            alt=""
            aria-hidden="true"
            src={isShown ? TOOLBOX_CLOSED_ICON : TOOLBOX_OPEN_ICON}
            width={width}
            height={height}
            draggable={false}
            className="vc-toolbox-icon"
        />
    );
}

function O2cordPopoutButton() {
    const buttonRef = useRef(null);
    const [show, setShow] = useState(false);

    return (
        <Popout
            position="bottom"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={show}
            onRequestClose={() => setShow(false)}
            targetElementRef={buttonRef}
            renderPopout={() => renderPopout(() => setShow(false))}
        >
            {(_, { isShown }) => {
                const active = show || isShown;

                return (
                    <HeaderBarButton
                        ref={buttonRef}
                        className="vc-toolbox-btn"
                        onClick={() => setShow(v => !v)}
                        tooltip={active ? null : "o2cord Toolbox"}
                        icon={(props: any) => <Icon {...props} isShown={active} />}
                        iconSize={22}
                        selected={active}
                    />
                );
            }}
        </Popout>
    );
}

export default definePlugin({
    name: "o2cordToolbox",
    description: "Adds a button to the titlebar that houses o2cord quick actions",
    tags: ["Utility", "Developers"],
    authors: [Devs.Ven, Devs.AutumnVN],

    settings,

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(trailing:.{0,50}?)\i\.Fragment,(?=\{children:\[)/,
                replace: "$1$self.TrailingWrapper,"
            }
        }
    ],

    TrailingWrapper({ children }: PropsWithChildren) {
        return (
            <>
                {children}
                <ErrorBoundary key="vc-toolbox" noop>
                    <O2cordPopoutButton />
                </ErrorBoundary>
            </>
        );
    },
});
