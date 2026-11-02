// TweetDeck's icons drawn as SVG instead of its icon font: sharp at any zoom, one stroke width, and no wait for
// the font from X's servers. The shapes are Lucide's (lucide-static 1.63.0, ISC, some MIT from Feather; both in
// files/icons/LICENSE), each a mask over the icon's own color, so TweetDeck's colors and states stay: a liked
// heart is red and filled, a retweet green and bolder. The verified badge is X's, grey; icons without a shape here
// (the bird, switches, other badges, devices) keep the font. Loaded by injection.js after otd-common.js. Switch "svgIcons", applies without a reload.
(() => {
    // Lucide's elements of each shape, in a 24px box, for stroke
    const SHAPES = {
        "activity": "<path d='M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2'/>",
        "arrow-down": "<path d='M12 5v14'/><path d='m19 12-7 7-7-7'/>",
        "arrow-left": "<path d='m12 19-7-7 7-7'/><path d='M19 12H5'/>",
        "arrow-right": "<path d='M5 12h14'/><path d='m12 5 7 7-7 7'/>",
        "arrow-up": "<path d='m5 12 7-7 7 7'/><path d='M12 19V5'/>",
        "at-sign": "<circle cx='12' cy='12' r='4'/><path d='M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8'/>",
        "ban": "<circle cx='12' cy='12' r='10'/><path d='M4.929 4.929 19.07 19.071'/>",
        "bell": "<path d='M10.268 21a2 2 0 0 0 3.464 0'/><path d='M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'/>",
        "bookmark": "<path d='M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z'/>",
        "calendar": "<path d='M8 2v3'/><path d='M16 2v3'/><rect x='3' y='3' width='18' height='18' rx='2'/><path d='M3 9h18'/>",
        "camera": "<path d='M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z'/><circle cx='12' cy='13' r='3'/>",
        "chart-bar": "<path d='M3 3v16a2 2 0 0 0 2 2h16'/><path d='M7 16h8'/><path d='M7 11h12'/><path d='M7 6h3'/>",
        "chart-column": "<path d='M3 3v16a2 2 0 0 0 2 2h16'/><path d='M18 17V9'/><path d='M13 17V5'/><path d='M8 17v-3'/>",
        "check": "<path d='M20 6 9 17l-5-5'/>",
        "check-check": "<path d='M18 6 7 17l-5-5'/><path d='m22 10-7.5 7.5L13 16'/>",
        "chevron-down": "<path d='m6 9 6 6 6-6'/>",
        "chevrons-left": "<path d='m11 17-5-5 5-5'/><path d='m18 17-5-5 5-5'/>",
        "chevrons-right": "<path d='m6 17 5-5-5-5'/><path d='m13 17 5-5-5-5'/>",
        "clock": "<circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/>",
        "ellipsis": "<circle cx='12' cy='12' r='1'/><circle cx='19' cy='12' r='1'/><circle cx='5' cy='12' r='1'/>",
        "external-link": "<path d='M15 3h6v6'/><path d='M10 14 21 3'/><path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/>",
        "feather": "<path d='M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z'/><path d='M16 8 2 22'/><path d='M17.488 15H9'/>",
        "file-text": "<path d='M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z'/><path d='M14 2v5a1 1 0 0 0 1 1h5'/><path d='M10 9H8'/><path d='M16 13H8'/><path d='M16 17H8'/>",
        "grip-vertical": "<circle cx='9' cy='12' r='1'/><circle cx='9' cy='5' r='1'/><circle cx='9' cy='19' r='1'/><circle cx='15' cy='12' r='1'/><circle cx='15' cy='5' r='1'/><circle cx='15' cy='19' r='1'/>",
        "hash": "<line x1='4' x2='20' y1='9' y2='9'/><line x1='4' x2='20' y1='15' y2='15'/><line x1='10' x2='8' y1='3' y2='21'/><line x1='16' x2='14' y1='3' y2='21'/>",
        "heart": "<path d='M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'/>",
        "house": "<path d='M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'/><path d='M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/>",
        "image": "<rect width='18' height='18' x='3' y='3' rx='2' ry='2'/><circle cx='9' cy='9' r='2'/><path d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/>",
        "info": "<circle cx='12' cy='12' r='10'/><path d='M12 16v-4'/><path d='M12 8h.01'/>",
        "layers": "<path d='M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z'/><path d='M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12'/><path d='M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17'/>",
        "link": "<path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/><path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/>",
        "list": "<path d='M3 5h.01'/><path d='M3 12h.01'/><path d='M3 19h.01'/><path d='M8 5h13'/><path d='M8 12h13'/><path d='M8 19h13'/>",
        "lock": "<rect width='18' height='11' x='3' y='11' rx='2' ry='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/>",
        "mail": "<path d='m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7'/><rect x='2' y='4' width='20' height='16' rx='2'/>",
        "mail-plus": "<path d='M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8'/><path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'/><path d='M19 16v6'/><path d='M16 19h6'/>",
        "map-pin": "<path d='M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'/><circle cx='12' cy='10' r='3'/>",
        "message-circle": "<path d='M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719'/>",
        "pause": "<rect x='14' y='3' width='5' height='18' rx='1'/><rect x='5' y='3' width='5' height='18' rx='1'/>",
        "pencil": "<path d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'/><path d='m15 5 4 4'/>",
        "play": "<path d='M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z'/>",
        "plus": "<path d='M5 12h14'/><path d='M12 5v14'/>",
        "repeat-2": "<path d='m2 9 3-3 3 3'/><path d='M13 18H7a2 2 0 0 1-2-2V6'/><path d='m22 15-3 3-3-3'/><path d='M11 6h6a2 2 0 0 1 2 2v10'/>",
        "search": "<path d='m21 21-4.34-4.34'/><circle cx='11' cy='11' r='8'/>",
        "settings": "<path d='M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'/><circle cx='12' cy='12' r='3'/>",
        "sparkles": "<path d='M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z'/><path d='M20 2v4'/><path d='M22 4h-4'/><circle cx='4' cy='20' r='2'/>",
        "share": "<path d='M12 2v13'/><path d='m16 6-4-4-4 4'/><path d='M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'/>",
        "sliders-horizontal": "<path d='M10 5H3'/><path d='M12 19H3'/><path d='M14 3v4'/><path d='M16 17v4'/><path d='M21 12h-9'/><path d='M21 19h-5'/><path d='M21 5h-7'/><path d='M8 10v4'/><path d='M8 12H3'/>",
        "trash-2": "<path d='M10 11v6'/><path d='M14 11v6'/><path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'/><path d='M3 6h18'/><path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/>",
        "trending-up": "<path d='M16 7h6v6'/><path d='m22 7-8.5 8.5-5-5L2 17'/>",
        "user": "<path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/>",
        "user-plus": "<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><line x1='19' x2='19' y1='8' y2='14'/><line x1='22' x2='16' y1='11' y2='11'/>",
        "users": "<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/><path d='M16 3.128a4 4 0 0 1 0 7.744'/><path d='M22 21v-2a4 4 0 0 0-3-3.87'/><circle cx='9' cy='7' r='4'/>",
        "volume-2": "<path d='M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z'/><path d='M16 9a5 5 0 0 1 0 6'/><path d='M19.364 18.364a9 9 0 0 0 0-12.728'/>",
        "volume-x": "<path d='M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z'/><path d='m16.5 14.5 5-5'/><path d='m16.5 9.5 5 5'/>",
        "x": "<path d='M18 6 6 18'/><path d='m6 6 12 12'/>",
        "zap": "<path d='M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z'/>",
    };
    // TweetDeck's icon-<class>: the shape, filled or bolder for the states TweetDeck draws heavier
    const ICONS = {
        "reply": "message-circle", "retweet": "repeat-2", "retweet-filled": "repeat-2 bold", "favorite": "heart",
        "heart": "heart", "heart-filled": "heart fill", "more": "ellipsis", "share": "share", "home": "house",
        "notifications": "bell", "search": "search", "list": "list", "list-filled": "list", "message": "mail",
        "mention": "at-sign", "activity": "activity", "user": "user", "user-filled": "user fill", "follow": "user-plus",
        "trending": "trending-up", "bookmarks": "bookmark", "hashtag": "hash", "custom-timeline": "layers",
        "compose": "feather", "compose-dm": "mail-plus", "plus": "plus", "settings": "settings",
        "sliders": "sliders-horizontal", "close": "x", "arrow-l": "arrow-left", "arrow-r": "arrow-right", "arrow-u": "arrow-up",
        "arrow-d": "arrow-down", "arrow-l-double": "chevrons-left", "arrow-r-double": "chevrons-right",
        "check": "check", "trash": "trash-2", "edit": "pencil", "link": "link", "image": "image", "camera": "camera",
        "calendar": "calendar", "schedule": "clock", "geo": "map-pin", "popout": "external-link", "mark-read": "check-check",
        "pointer-u": "arrow-up", "play": "play", "pause": "pause", "sound": "volume-2", "sound-off": "volume-x",
        "protected": "lock", "info": "info", "poll": "chart-bar", "analytics": "chart-column", "user-switch": "users",
        "user-team-mgr": "users", "lightning": "zap", "content": "file-text", "user-dd": "chevron-down", "blocked": "ban",
        "move": "grip-vertical", "otd-foryou": "sparkles",
    };

    const url = (shape, style) => {
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${style === "fill" ? "#000" : "none"}' stroke='#000' stroke-width='${style === "bold" ? 2.75 : 2}' stroke-linecap='round' stroke-linejoin='round'>${SHAPES[shape]}</svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    };
    // X's verified badge, filled, the check cut out
    const BADGE = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z'/></svg>")}")`;
    const classes = Object.keys(ICONS);
    OTD.addStyle(`
        ${classes.map(name => `html.otd-svg-icons .icon-${name} { --otd-icon: ${url(...ICONS[name].split(" "))}; }`).join("\n")}
        ${classes.map(name => `html.otd-svg-icons .icon-${name}::before`).join(", ")} {
            /* 1em, as the glyph was, also where TweetDeck lets an icon's box size itself; and where the glyph was: in the
               middle of a line of the icon's line height, which TweetDeck sets taller than the icon in places (a column's
               header puts its icon on the title's line that way) */
            content: ""; display: block; width: 1em; height: 1em; margin-top: calc((1lh - 1em) / 2); background-color: currentColor;
            -webkit-mask: var(--otd-icon) center / contain no-repeat; mask: var(--otd-icon) center / contain no-repeat;
        }
        /* the verified badge in X's shape, grey as the other icons, in place of TweetDeck's blue picture */
        html.otd-svg-icons :is(.sprite-verified, .sprite-verified-mini) {
            background: currentColor !important; color: #536471; -webkit-mask: ${BADGE} center / contain no-repeat; mask: ${BADGE} center / contain no-repeat;
        }
        html.dark.otd-svg-icons :is(.sprite-verified, .sprite-verified-mini) { color: var(--otd-text-2, #8899a6); }
        /* the search button's margins are for the glyph on its text line, which put the icon 5px under the middle of
           the round button of the condensed bar: the icon in the middle of the button, on a line its own height */
        html.otd-svg-icons .app-header.is-condensed .app-search-fake { display: flex; align-items: center; justify-content: center; padding: 0 !important; }
        html.otd-svg-icons .app-search-fake .icon { margin: 0; line-height: 1; }
        /* a column type's icon in "Add column" over its name, as the glyph was: its box is the cell's width */
        html.otd-svg-icons .lst-launcher .column-type-icon::before { margin-left: auto; margin-right: auto; }
    `);
    OTD.htmlClassWhileOn("svgIcons", "otd-svg-icons");
})();
