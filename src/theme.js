// TweetDeck's theme:
// - "System" next to Dark and Light in TweetDeck's settings, and in the TweeXDeck tab: the theme follows the
//   system's prefers-color-scheme, as it changes too. TweetDeck still sees "dark" or "light", so all its own
//   checks of the theme keep working; OTD.THEME_SYSTEM_STORAGE remembers the pick;
// - the dark theme is a calm one, in place of TweetDeck's dark blue (UX audit, October 2026): neutral greys, a
//   step lighter for each layer (the app and its left bar, a column, what's inside a tweet), parts set apart by
//   their shade rather than frames, a hairline between tweets, grey icons, three greys of text, names in 600,
//   one accent, a soft blue, for links and focus; red and green only for a like and a retweet. TweetDeck's own
//   dark rules get twins with these greys in place of its blues, so its menus, dialogs and drawers are calm too,
//   then a few rules of its layout follow. The colors are --otd-* properties of html.dark for this extension's
//   own parts;
// - the light theme is the same calm one in light (November 2026): the app and its left bar a light grey,
//   TweetDeck's dark blue bar too, white columns on it, its bluish greys neutral, its blue a deeper one of the same
//   soft blue. TweetDeck's light theme is its rules without html.dark: they get twins only light pages match
//   (:where(html:not(.dark)), which counts for nothing in which rule wins), and the dark theme's rules of layout
//   are the light theme's too, with the light colors of the --otd-* properties of html:not(.dark);
// - "lightsOut": the same in black, as x.com's, for OLED screens: the twins of TweetDeck's rules have x.com's
//   colors (html.dark.otd-lights-out), the properties black ones.
// All apply without a reload. Loaded by injection.js after otd-common.js.
(() => {
    const settings = window.TD?.settings;
    if(!settings?.setTheme) return;

    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)");
    const follows = () => localStorage[OTD.THEME_SYSTEM_STORAGE] === "1";
    const setTheme = settings.setTheme;
    // asked afresh: Firefox brings a MediaQueryList it gave before up to date only with its change event
    const systemTheme = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    // TweetDeck's radio, the TweeXDeck tab and the command palette all pick "system" through here
    settings.setTheme = function(theme) {
        OTD.setValue(OTD.THEME_SYSTEM_STORAGE, theme === "system" ? "1" : "");
        return setTheme.call(this, theme === "system" ? systemTheme() : theme);
    };
    // TweetDeck's settings read its storage, which is there once TweetDeck is ready
    const follow = () => {
        if(window.TD?.ready && follows() && settings.getTheme() !== systemTheme()) setTheme.call(settings, systemTheme());
    };
    follow();
    // jQuery's namespace keeps TweetDeck's own handlers out of a test's trigger
    OTD.jQuery()?.(document).one("TD.ready.otd-theme", follow);
    systemDark?.addEventListener?.("change", follow);
    OTD.onChange(OTD.THEME_SYSTEM_STORAGE, follow);

    // TweetDeck's dark blues, its bluish greys, its blue, its focus ring and pressed blue as the calm theme has
    // them: backgrounds, the darker app background, headers and drawers, borders, threads and scrollbars, grey and
    // light text. Its blue is the
    // soft one for text, lines and icons, a deeper one under white text (#7c9cff would be 2.4:1 there, this 4.8:1)
    const CALM = {
        "21, 32, 43": "19, 20, 22",
        "16, 23, 30": "8, 9, 10",
        "28, 41, 56": "28, 29, 31",
        "56, 68, 77": "40, 42, 46",
        "61, 84, 102": "48, 50, 55",
        "20, 23, 26": "33, 34, 36",
        "136, 153, 166": "154, 158, 166",
        "101, 119, 134": "128, 132, 140",
        "25, 36, 47": "26, 27, 29",
        "225, 232, 237": "230, 231, 233",
        "204, 214, 221": "212, 214, 218",
        "170, 184, 194": "176, 180, 186",
        "245, 248, 250": "244, 245, 246",
        "29, 161, 242": "124, 156, 255",
        "27, 149, 224": "124, 156, 255",
        "113, 201, 248": "124, 156, 255",
        // unread, a hint of the accent
        "22, 48, 67": "28, 33, 52",
    };
    // a selected unread tweet's grey stays dark under white text
    const CALM_FILL = { ...CALM, "29, 161, 242": "68, 102, 238", "27, 149, 224": "68, 102, 238", "0, 95, 209": "52, 82, 204", "101, 119, 134": "58, 61, 68" };
    // and x.com's Lights out, with the calm theme's greys of text
    const LIGHTS_OUT = {
        "21, 32, 43": "0, 0, 0",
        "16, 23, 30": "22, 24, 28",
        "28, 41, 56": "22, 24, 28",
        "56, 68, 77": "47, 51, 54",
        "61, 84, 102": "62, 65, 68",
        "136, 153, 166": "154, 158, 166",
        "101, 119, 134": "128, 132, 140",
    };
    // TweetDeck's light theme as the calm one has it: its bluish greys of text, lines and backgrounds neutral, the
    // dark blues of its left bar, tooltips and dialogs the dark theme's greys, its blue a deeper one of the soft
    // blue for text on white (5.6:1), under white text the dark theme's (4.8:1), its light blues tints of it
    const LIGHT = {
        "20, 23, 26": "27, 28, 31",
        "101, 119, 134": "91, 95, 103",
        "136, 153, 166": "108, 112, 120",
        "170, 184, 194": "160, 164, 171",
        "204, 214, 221": "212, 214, 218",
        "225, 232, 237": "230, 231, 234",
        "245, 248, 250": "244, 245, 246",
        "56, 68, 77": "60, 63, 68",
        "61, 84, 102": "48, 50, 55",
        "28, 41, 56": "28, 29, 31",
        "21, 32, 43": "19, 20, 22",
        "16, 23, 30": "18, 19, 21",
        "29, 161, 242": "58, 92, 224",
        "43, 123, 185": "58, 92, 224",
        "27, 149, 224": "47, 78, 200",
        "0, 95, 209": "44, 70, 184",
        "113, 201, 248": "150, 170, 245",
        "151, 227, 255": "190, 203, 252",
        "234, 245, 253": "238, 241, 253",
    };
    const LIGHT_FILL = { ...LIGHT, "29, 161, 242": "68, 102, 238", "43, 123, 185": "68, 102, 238", "27, 149, 224": "52, 82, 204" };
    const COLOR = /rgba?\((\d+), (\d+), (\d+)(, [\d.]+)?\)/g;
    const swap = (value, colors) => value.replace(COLOR, (all, r, g, b, alpha) => {
        const to = colors[`${r}, ${g}, ${b}`];
        return to ? (alpha ? `rgba(${to}${alpha})` : `rgb(${to})`) : all;
    });
    // a twin of every rule `twin` gives a selector for, with one of these colors, the color swapped; a background's
    // from fills
    function twins(rules, colors, fills, twin) {
        let css = "";
        for(const rule of rules) {
            if(rule.cssRules && rule.media) {
                const inner = twins(rule.cssRules, colors, fills, twin);
                if(inner) css += `@media ${rule.media.mediaText} { ${inner} }\n`;
                continue;
            }
            const selector = rule.selectorText && twin(rule.selectorText);
            if(!selector) continue;
            let body = "";
            for(const property of rule.style) {
                const value = rule.style.getPropertyValue(property);
                const swapped = swap(value, property.startsWith("background") ? fills : colors);
                if(swapped !== value) body += `${property}: ${swapped}${rule.style.getPropertyPriority(property) ? " !important" : ""}; `;
            }
            if(body) css += `${selector} { ${body}}\n`;
        }
        return css;
    }
    // In Firefox injection.js is a content script, and the <style> it puts TweetDeck's CSS in is the extension's:
    // its rules are closed to the page (a SecurityError), its text isn't. That text, once, in a sheet of the page's
    const copies = new WeakMap();
    let fromText = false;
    function rulesOf(sheet) {
        // closed once, closed for good: the copy, without asking again on every look for rules that came later
        if(copies.has(sheet.ownerNode)) return copies.get(sheet.ownerNode).cssRules;
        try {
            return sheet.cssRules;
        } catch(e) {
            const style = sheet.ownerNode;
            if(style?.tagName !== "STYLE" || !window.CSSStyleSheet?.prototype.replaceSync) throw e;
            fromText = true;
            if(!copies.has(style)) {
                const copy = new CSSStyleSheet();
                copy.replaceSync(style.textContent);
                copies.set(style, copy);
            }
            return copies.get(style).cssRules;
        }
    }
    // the dark theme's rules, as they are or for Lights out
    const darkTwin = scope => selector => selector.includes("html.dark") && selector.replaceAll("html.dark", scope);
    // the rest, TweetDeck's light theme, for light pages only, as specific as they were
    const lightTwin = selector => !selector.includes("html.dark") && splitList(selector).map(one => {
        if(/^html\b/.test(one)) return `html:where(:not(.dark))${one.slice(4)}`;
        if(/^:root\b/.test(one)) return `:root:where(:not(.dark))${one.slice(5)}`;
        return `:where(html:not(.dark)) ${one}`;
    }).join(", ");
    // a selector list's selectors, not split inside :is() or :not()
    function splitList(list) {
        const parts = [];
        let depth = 0, start = 0;
        for(let i = 0; i < list.length; i++) {
            if(list[i] === "(") depth++;
            else if(list[i] === ")") depth--;
            else if(list[i] === "," && !depth) {
                parts.push(list.slice(start, i).trim());
                start = i + 1;
            }
        }
        parts.push(list.slice(start).trim());
        return parts;
    }
    const OURS = ["otd-calm", "otd-light", "otd-light-late", "otd-calm-look", "otd-lights-out"];
    function twinsOfAll(colors, fills, twin) {
        let css = "";
        for(const sheet of document.styleSheets) {
            if(OURS.includes(sheet.ownerNode?.id)) continue;
            try {
                css += twins(rulesOf(sheet), colors, fills, twin);
            } catch(e) {
                // a sheet from elsewhere
            }
        }
        return css;
    }

    const calm = OTD.addStyle("");
    calm.id = "otd-calm";
    const lightCalm = OTD.addStyle("");
    lightCalm.id = "otd-light";
    // the calm themes' own rules, the dark one's (html.dark) and the light one's (html:not(.dark)) alike
    const look = s => `
        /* layers: the app and its left bar, the columns on it with round corners, set apart by their shade */
        ${s} body, ${s} .application, ${s} .app-content, ${s} .app-columns-container, ${s} .app-columns,
        ${s} .app-header, ${s} .app-navigator { background-color: var(--otd-app) !important; }
        ${s} .app-header-inner, ${s} .js-account-summary, ${s} .app-title, ${s} .column-nav, ${s} .column-nav-item { background-color: transparent !important; }
        ${s} .column-nav-item:hover { background-color: var(--otd-nav-hover) !important; }
        ${s} .with-nav-border-t::before { border-top-color: var(--otd-line) !important; }
        ${s} .column { background-color: var(--otd-panel) !important; border-radius: 10px; }
        ${s} .column-panel { background-color: var(--otd-panel) !important; border-radius: 10px; }
        /* the hairline round a column over what's in it: on the panel itself it was under the column's scroller, which
           is drawn over it, so only its header had it */
        ${s} .column-panel::after { content: ""; position: absolute; inset: 0; z-index: 2; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--otd-panel-edge); pointer-events: none; }
        ${s} .column-header { background-color: transparent !important; border-bottom: 1px solid var(--otd-line) !important; }
        ${s} .column-heading { color: var(--otd-text); font-weight: 600; }
        ${s} .column-header .attribution { color: var(--otd-text-3); }
        /* TweetDeck's numbers of the columns, for its keys; the grip to move a column, where the pointer is */
        ${s} .column-number { display: none; }
        ${s} .column-drag-handle { opacity: 0; transition: opacity .15s; }
        ${s} .column-header:hover .column-drag-handle { opacity: .5; }

        /* icons grey, the text's color under the pointer; the compose and search buttons without the blue */
        ${s} .app-header .icon, ${s} .app-navigator .icon, ${s} .column-header .icon, ${s} .column-header-link { color: var(--otd-text-2) !important; }
        ${s} .app-header a:hover .icon, ${s} .app-header button:hover .icon, ${s} .column-header-link:hover .icon { color: var(--otd-text) !important; }
        ${s} .app-header .js-show-drawer.Button, ${s} .app-search-fake { background-color: var(--otd-ghost) !important; border-color: transparent !important; }
        ${s} .app-header .js-show-drawer.Button, ${s} .app-header .js-show-drawer.Button .icon, ${s} .app-search-fake .icon { color: var(--otd-text) !important; }

        /* tweets: a hairline between them, a shade under the pointer; the one picked with the keys and unread ones
           keep TweetDeck's marks, in these colors */
        ${s} .stream-item { border-bottom-color: var(--otd-line) !important; }
        ${s} .stream-item:not(.is-selected-tweet):not(.is-unread):hover { background-color: var(--otd-hover); }
        ${s} :is(.tweet-text, .js-quoted-tweet-text, .fullname) { color: var(--otd-text) !important; }
        ${s} .tweet.txt-mute .tweet-text { color: var(--otd-text-2) !important; }
        ${s} :is(.fullname, .account-inline b, .activity-header .account-link) { font-weight: 600 !important; }
        ${s} .activity-header .account-link { color: var(--otd-text) !important; }
        ${s} :is(.username, .tweet-timestamp, .tweet-timestamp a, .tweet-footer > a.txt-mute) { color: var(--otd-text-3) !important; }

        /* a quote, a link card: a shade of its own instead of a frame */
        ${s} .quoted-tweet { border-color: transparent !important; background-color: var(--otd-raised) !important; }
        ${s} .quoted-tweet:hover { background-color: var(--otd-raised-hover) !important; }

        /* what's only context grey: "↩ @name", "Show this thread"; a follow's button and the reply box without frames */
        ${s} :is(.other-replies, .other-replies-link) { color: var(--otd-text-2) !important; }
        ${s} .js-show-this-thread .color-twitter-blue { color: var(--otd-text-2) !important; }
        ${s} .js-show-this-thread:hover .color-twitter-blue { color: var(--otd-text) !important; }
        ${s} .btn-on-dark { border-color: transparent !important; background-color: var(--otd-ghost) !important; }
        ${s} .btn-on-dark:hover { background-color: var(--otd-ghost-hover) !important; }
        ${s} .btn-on-dark .icon { color: var(--otd-text-2) !important; }
        ${s} :is(.detail-view-inline, .detail-view-inline-text) { border-color: var(--otd-line) !important; }

        ${s}, ${s} * { scrollbar-width: thin; scrollbar-color: var(--otd-scroll) transparent; }
    `;
    const layout = OTD.addStyle(`
        html.dark {
            --otd-app: #08090a; --otd-panel: #131416; --otd-panel-edge: transparent;
            --otd-raised: rgba(255, 255, 255, .04); --otd-raised-hover: rgba(255, 255, 255, .06); --otd-raised-solid: #1c1d1f;
            --otd-hover: rgba(255, 255, 255, .025); --otd-line: rgba(255, 255, 255, .06); --otd-media-edge: rgba(255, 255, 255, .07);
            --otd-text: #e6e7e9; --otd-text-2: #9a9ea6; --otd-text-3: #80848c;
            --otd-accent: #7c9cff; --otd-accent-fill: #4466ee; --otd-accent-tint: rgba(124, 156, 255, .12);
            --otd-nav-hover: rgba(255, 255, 255, .04); --otd-ghost: rgba(255, 255, 255, .06); --otd-ghost-hover: rgba(255, 255, 255, .1);
            --otd-scroll: rgba(255, 255, 255, .14);
        }
        /* on black a column is set apart by a hairline round it */
        html.dark.otd-lights-out {
            --otd-app: #000; --otd-panel: #000; --otd-panel-edge: rgba(255, 255, 255, .1);
            --otd-raised: rgba(255, 255, 255, .06); --otd-raised-hover: rgba(255, 255, 255, .08); --otd-raised-solid: #0f0f0f;
            --otd-hover: rgba(255, 255, 255, .03); --otd-line: rgba(255, 255, 255, .1); --otd-media-edge: rgba(255, 255, 255, .1);
            --otd-text: #e7e9ea;
        }
        /* white columns on a light grey, a hairline round them; text 17:1, 6.4:1 and 5:1 on white */
        html:not(.dark) {
            --otd-app: #f1f2f4; --otd-panel: #fff; --otd-panel-edge: rgba(0, 0, 0, .06);
            --otd-raised: rgba(0, 0, 0, .035); --otd-raised-hover: rgba(0, 0, 0, .055); --otd-raised-solid: #f3f4f5;
            --otd-hover: rgba(0, 0, 0, .02); --otd-line: rgba(0, 0, 0, .07); --otd-media-edge: rgba(0, 0, 0, .08);
            --otd-text: #1b1c1f; --otd-text-2: #5b5f67; --otd-text-3: #6c7078;
            --otd-accent: #3a5ce0; --otd-accent-fill: #4466ee; --otd-accent-tint: rgba(68, 102, 238, .1);
            --otd-nav-hover: rgba(0, 0, 0, .04); --otd-ghost: rgba(0, 0, 0, .05); --otd-ghost-hover: rgba(0, 0, 0, .08);
            --otd-scroll: rgba(0, 0, 0, .18);
        }
        ${look("html.dark")}
        ${look("html:not(.dark)")}
        /* TweetDeck's left bar is dark blue in its light theme, with white text and a dark search box on it: here
           it's the app's grey, its text dark */
        html:not(.dark) :is(.app-nav-link-text, .app-nav-tab-text, .nav-user-info .fullname, .column-nav-link.is-selected, .column-nav-link:hover) { color: var(--otd-text) !important; }
        html:not(.dark) .app-search-input { background-color: var(--otd-ghost) !important; color: var(--otd-text) !important; }
        html:not(.dark) .app-search-button { color: var(--otd-text-2) !important; }
        /* the reply box under an opened tweet on the column's white, as the dark theme has it on its grey, the box a
           shade darker; replying in a column, a light grey instead of TweetDeck's blue, under its white text dark */
        html:not(.dark) .detail-view-inline { background-color: var(--otd-panel) !important; }
        html:not(.dark) .detail-view-inline-text { background-color: var(--otd-raised-solid) !important; }
        html:not(.dark) .inline-reply { background-color: var(--otd-raised-solid) !important; color: var(--otd-text) !important; }
        html:not(.dark) .inline-reply .color-twitter-white { color: var(--otd-text-2) !important; }
        html:not(.dark) .inline-reply .compose-text { box-shadow: inset 0 0 0 1px var(--otd-line); }
        /* the composer's drawer, TweetDeck's blue with white text and buttons on it: the left bar's grey, its text dark,
           its buttons ghosts, its boxes white with a hairline */
        html:not(.dark) :is(.compose, .compose .old-composer-footer, .compose .new-composer-opt-in) { background-color: var(--otd-app) !important; color: var(--otd-text) !important; }
        html:not(.dark) .compose :is(.compose-title-text, .js-account-safeguard-text, .compose-remember-state, .on-blue .account-link) { color: var(--otd-text) !important; }
        html:not(.dark) .compose .compose-text-title { color: var(--otd-text-2) !important; }
        html:not(.dark) .compose :is(.compose-header, .new-composer-opt-in) { border-color: var(--otd-line) !important; }
        html:not(.dark) .compose .btn-on-blue { color: var(--otd-text) !important; background-color: var(--otd-ghost) !important; border-color: transparent !important; box-shadow: none; }
        html:not(.dark) .compose :is(.btn-on-blue:hover, .btn-on-blue:focus, .btn-on-blue.is-selected, .new-composer-opt-in:hover) { background-color: var(--otd-ghost-hover) !important; }
        html:not(.dark) .compose .btn-on-blue :is(.Icon, .icon) { color: var(--otd-text-2) !important; }
        html:not(.dark) .compose :is(.compose-text-container, .compose-message-recipient-input-container) { box-shadow: inset 0 0 0 1px var(--otd-line); }
        html:not(.dark) .compose .antiscroll-scrollbar { background: var(--otd-scroll) !important; }
    `);
    layout.id = "otd-calm-look";

    // The twins keep the selectors, later than TweetDeck's, so they win as Lights out's win over them. Without
    // TweetDeck's CSS yet, again once TweetDeck is ready, and then after it.
    let lightsOut;
    const count = style => style?.sheet?.cssRules.length || 0;
    function drawCalm() {
        if(count(calm) && count(lightCalm)) return;
        calm.textContent = twinsOfAll(CALM, CALM_FILL, darkTwin("html.dark"));
        lightCalm.textContent = twinsOfAll(LIGHT, LIGHT_FILL, lightTwin);
        calm.parentNode?.append(calm, lightCalm, layout, ...(lightsOut ? [lightsOut] : []));
        for(const sheet of document.styleSheets) {
            try {
                drawn.set(sheet, rulesOf(sheet).length);
            } catch(e) {}
        }
    }
    // Rules that come after the twins are drawn: react-native-web's, which TweetDeck's cards are drawn with, as it
    // draws one (a link card's frame, its title and its grey). The light twins of a sheet that has more rules than
    // it had, after it: react-native-web puts its own anywhere in its sheet, and the sheet in late
    const drawn = new WeakMap();
    const late = new Map();
    let lateLight;
    function catchUp() {
        let grew = false;
        for(const sheet of document.styleSheets) {
            if(OURS.includes(sheet.ownerNode?.id)) continue;
            let rules;
            try {
                rules = rulesOf(sheet);
            } catch(e) {
                continue;
            }
            if(drawn.get(sheet) === rules.length) continue;
            drawn.set(sheet, rules.length);
            late.set(sheet, twins(rules, LIGHT, LIGHT_FILL, lightTwin));
            grew = true;
        }
        if(!grew || !count(lightCalm)) return;
        for(const sheet of late.keys()) if(!sheet.ownerNode?.isConnected) late.delete(sheet);
        if(!lateLight) {
            lateLight = OTD.addStyle("");
            lateLight.id = "otd-light-late";
        }
        lateLight.textContent = [...late.values()].join("");
        lateLight.parentNode?.append(lateLight);
    }
    function drawLightsOut() {
        const on = OTD.isOn("lightsOut");
        document.documentElement.classList.toggle("otd-lights-out", on);
        if(!on || count(lightsOut)) return;
        if(!lightsOut) {
            lightsOut = OTD.addStyle("");
            lightsOut.id = "otd-lights-out";
        }
        lightsOut.textContent = twinsOfAll(LIGHTS_OUT, LIGHTS_OUT, darkTwin("html.dark.otd-lights-out"));
    }
    // for the load watchdog's report
    const report = () => document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "theme",
        text: `${count(calm)} twins of TweetDeck's dark rules, ${count(lightCalm)} of its light ones${lightsOut ? `, ${count(lightsOut)} for Lights out` : ""}${fromText ? ", its CSS read from its text" : ""}` }) }));
    const draw = () => {
        drawCalm();
        drawLightsOut();
        report();
    };
    draw();
    OTD.jQuery()?.(document).one("TD.ready.otd-twins", draw);
    OTD.watch(catchUp);
    OTD.onChange("OTDlightsOut", draw);
})();
