// TweetDeck's look brought to today's standards where it falls short (UX audit, October 2026):
// - the light theme's grey text, icons and links pass WCAG AA: the calm light theme's (theme.js) grey of
//   secondary text for it and the icons of the action row (6.4:1; 2.9:1 and 2.0:1 before), its blue for links
//   (5.6:1; 2.8:1 before), x.com's #536471 and #1570c4 without it; the dark theme already passes;
// - the action row's buttons take a 32px circle around their 18px icons, tinted on hover as on x.com;
// - keyboard focus shows (TweetDeck takes the outline off everywhere), for the pointer it stays as it was;
// - tweet text at line-height 1.4 instead of 1.29, @handles at 13px instead of 12, counts in tabular figures,
//   6px between a tweet's text and its buttons instead of 3; where the browser trims text to its capitals and
//   baseline (text-box), 9px from the name to them and from them to the buttons; a blank line between
//   paragraphs 0.45em, not a whole line; the same for a translation;
// - a quoted tweet's text in the tweet's color, as on x.com: TweetDeck's grey is 3.6:1 in the dark theme;
// - a notification's "Name retweeted" / "Name liked" on one line: a 20px avatar, the name, the action in grey,
//   a long name cut with "…" (TweetDeck's wraps the action under a 24px avatar).
// Whatever the switch, the system's "reduce motion" stops TweetDeck's animations, CSS and jQuery ones.
// Loaded by injection.js after otd-common.js. Switch "modernLook", applies without a reload.
(() => {
    // the system's setting, now and when it changes
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const $ = OTD.jQuery();
    const applyMotion = () => {
        if($?.fx) $.fx.off = !!reduce?.matches;
    };
    applyMotion();
    reduce?.addEventListener?.("change", applyMotion);
    OTD.addStyle(`
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
        }
    `);

    OTD.htmlClassWhileOn("modernLook", "otd-modern");

    const ACTIONS = ".tweet-action, .tweet-detail-action";
    // a tweet's text in a column and opened, a quote's
    const OWN = ["html.otd-modern .stream-item:not(.otd-notif-compact) :is(.js-tweet-text, .otd-grok-tr).tweet-text", "html.otd-modern .tweet-detail :is(.js-tweet-text, .otd-grok-tr).tweet-text"].join(", ");
    const QUOTED = "html.otd-modern .quoted-tweet :is(.js-quoted-tweet-text, .otd-grok-tr)";
    const TEXT = ["html.otd-modern .stream-item :is(.js-tweet-text, .otd-grok-tr).tweet-text", "html.otd-modern .tweet-detail :is(.js-tweet-text, .otd-grok-tr).tweet-text", QUOTED].join(", ");
    const TRIMMED = `${OWN}, ${QUOTED}`;
    const RESTING = ":not(:hover):not(:focus):not(:active):not(.is-selected)";
    // TweetDeck's text is pre-wrap: a blank line is an empty line of the text's height, 1.4em, which can't be set
    // apart from it. Its newlines go in a span of their own, a block 0.45em tall; they stay in the text for its
    // readers (the translation, copying) and show as before with the switch off.
    const BLANK = /(\n(?:[^\S\n]*\n)+)/;
    function paragraphs(text) {
        text.dataset.otdParas = "";
        const walk = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        const found = [];
        for(let node; (node = walk.nextNode());) if(BLANK.test(node.data)) found.push(node);
        for(const node of found) node.replaceWith(...node.data.split(BLANK).map((part, i) => {
            if(i % 2 === 0) return part;
            const gap = document.createElement("span");
            gap.className = "otd-para-gap";
            gap.textContent = part;
            return gap;
        }).filter(part => part !== ""));
        // nothing but space before it or after it: no paragraph to set apart
        const range = document.createRange();
        const empty = () => !range.toString().trim() && !range.cloneContents().querySelector("img");
        for(const gap of text.querySelectorAll(".otd-para-gap")) {
            range.selectNodeContents(text);
            range.setEndBefore(gap);
            let edge = empty();
            range.selectNodeContents(text);
            range.setStartAfter(gap);
            edge ||= empty();
            gap.classList.toggle("otd-para-edge", edge);
        }
    }
    OTD.watch(() => {
        for(const text of document.querySelectorAll(":is(.js-tweet-text, .js-quoted-tweet-text).with-linebreaks:not([data-otd-paras])")) paragraphs(text);
    });

    OTD.addStyle(`
        html.otd-modern:not(.dark) .txt-mute,
        html.otd-modern:not(.dark) .txt-mute a:not(:hover):not(:focus),
        html.otd-modern:not(.dark) .txt-mute-text-only,
        html.otd-modern:not(.dark) .chirp-container .stream-item:not(:hover):not(.is-selected-tweet) .tweet-action${RESTING},
        html.otd-modern:not(.dark) .chirp-container .stream-item:not(:hover):not(.is-selected-tweet) .tweet-detail-action${RESTING},
        html.otd-modern:not(.dark) .tweet-action${RESTING},
        html.otd-modern:not(.dark) .tweet-detail-action${RESTING} { color: var(--otd-text-2, #536471); }
        html.otd-modern:not(.dark) .tweet-text a:not(:hover),
        html.otd-modern:not(.dark) .other-replies a:not(:hover),
        html.otd-modern:not(.dark) .js-show-this-thread .color-twitter-blue { color: var(--otd-accent, #1570c4); }

        /* the circle is the button's middle, so the button is its icon's height and the icon in the middle of its own:
           with the counts on TweetDeck floats the icon and the count, and the button around them would be 0px tall;
           an opened tweet's icon has a line taller than itself, its middle 2.6px under the icon's */
        html.otd-modern .tweet-action, html.otd-modern .tweet-detail-action { position: relative; z-index: 0; display: flow-root; }
        html.otd-modern .tweet-action .icon, html.otd-modern .tweet-detail-action .icon { line-height: 1; }
        /* TweetDeck's burst of a heart on a like (heartsprite, 100px scaled to 47.5) is at -226% of the button's
           width, right for a button as wide as its 18px icon; this one is a block, an opened tweet's as wide as its
           cell, a column's as its count: the burst on the middle of the icon, at the button's top left */
        html.otd-modern :is(.tweet-action, .tweet-detail-action) > .heartsprite { left: -41px; top: -41px; }
        html.otd-modern .tweet-action::after, html.otd-modern .tweet-detail-action::after {
            content: ""; position: absolute; z-index: -1; left: -7px; top: 50%; width: 32px; height: 32px; margin-top: -16px;
            border-radius: 50%; transition: background-color .15s;
        }
        html.otd-modern .tweet-action:hover::after, html.otd-modern .tweet-detail-action:hover::after { background-color: var(--otd-accent-tint, rgba(29, 155, 240, .12)); }
        html.otd-modern .tweet-action[rel="retweet"]:hover::after, html.otd-modern .tweet-detail-action[rel="retweet"]:hover::after { background-color: rgba(23, 191, 99, .12); }
        html.otd-modern .tweet-action[rel="favorite"]:hover::after, html.otd-modern .tweet-detail-action[rel="favorite"]:hover::after { background-color: rgba(224, 36, 94, .12); }

        html.otd-modern :focus-visible:not(input):not(textarea):not(select):not([contenteditable]) { outline: 2px solid var(--otd-accent, #1d9bf0) !important; outline-offset: 2px; }
        html.otd-modern ${ACTIONS.split(", ").map(s => `${s}:focus-visible`).join(", ")} { outline-offset: 6px; border-radius: 50%; }

        /* the text, and its translation (grok-translate.js), a copy of it without TweetDeck's js- class */
        ${TEXT} { line-height: 1.4; }
        /* tweet text from the top of its capitals to its baseline (CSS text-box, Chrome 133, Firefox 154): the space
           round it is the margins', not the font's, so its first line lines up with a square beside it, and the
           name, the text and the buttons are 9px apart. TweetDeck's text is overflow: hidden, which would cut
           what's past those lines, the tails of "у" and "р"; it breaks long words anyway. Not a liked tweet's three
           lines in a notification, cut with "…" */
        @supports (text-box: trim-both cap alphabetic) {
            ${TRIMMED} { text-box: trim-both cap alphabetic; overflow: visible; margin-top: 4px; }
            ${OWN} { margin-bottom: 8px; }
        }
        /* a blank line between paragraphs: 0.45em, as between a translation's (paragraphs), none before the first or
           after the last; in a liked tweet's three lines in a notification, a space */
        html.otd-modern .otd-para-gap { display: block; height: .45em; overflow: hidden; }
        html.otd-modern .otd-para-gap.otd-para-edge { display: none; }
        html.otd-modern .otd-notif-compact .otd-para-gap { display: inline; height: auto; }
        html.otd-modern .tweet-header .account-inline .username { font-size: 13px; }
        html.otd-modern .tweet-footer, html.dark.otd-modern .tweet-footer { margin-top: 6px; }
        html.otd-modern .quoted-tweet, html.dark.otd-modern .quoted-tweet { color: inherit; }
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc {
            display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; line-height: 20px; white-space: nowrap; color: var(--otd-text-2, #536471);
        }
        html.dark.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc { color: var(--otd-text-2, #8899a6); }
        /* the line and its time on one middle, not on the avatar's baseline */
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc,
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .tweet-timestamp { align-self: center; }
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc > .avatar { flex: none; width: 20px; height: 20px; margin: 0; border-radius: 50%; }
        html.otd-modern .js-stream-item:not(.otd-notif-group) .activity-header > .nbfc > .account-link { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        html.otd-modern .tweet-action, html.otd-modern .tweet-detail-action, html.otd-modern .tweet-timestamp, html.otd-modern .like-count, html.otd-modern .retweet-count, html.otd-modern .reply-count { font-variant-numeric: tabular-nums; }
    `);
})();
