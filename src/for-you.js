// X's own timelines as columns of their own, in "Add column" by Home, for one of the user's own accounts:
// - For you, X's algorithmic timeline: interception.js asks X's HomeTimeline for its tweets instead of
//   HomeLatestTimeline. X's picks aren't in order of time, and TweetDeck keeps a column in that order: the ones a
//   refresh brings that are older than the column's newest go where their time puts them, instead of being dropped,
//   as TweetDeck drops what isn't newer from a timeline it asks for what's newer. Its icon sparkles;
// - Spaces, the Spaces of the people the user follows, live and to come: spaces.js draws them in the column, and
//   interception.js answers its requests for tweets empty without asking X. Its icon audio lines.
// Each is TweetDeck's own home column with a mark in its feed's metadata (otdTimeline), so TweetDeck keeps, polls,
// shows and saves it as it does Home: its requests carry otd_timeline=<the mark>.
// Loaded by injection.js after otd-common.js.
(() => {
    const TD = window.TD;
    const manager = TD?.controller?.columnManager;
    if(!manager?.DISPLAY_ORDER || !TD.services?.TwitterClient?.prototype.getTimeline) return;

    // by mark: the type in "Add column", the title, the icon (the font's glyph where the SVG icons are off, icons.js's
    // where they're on), the help in "Add column", and whether a refresh's older tweets are kept
    const KINDS = {
        foryou: { type: "otdforyou", title: "For you", icon: "icon-magic-search icon-otd-foryou", keepAll: true,
            help: "Add a For you column for your account: what X picks for you, from people you follow and people you don't" },
        spaces: { type: "otdspaces", title: "Spaces", icon: "icon-sound icon-otd-spaces",
            help: "Add a Spaces column for your account: the Spaces of people you follow, live and to come" },
    };
    const markOf = feed => feed?.getMetadata?.()?.otdTimeline;
    const kindOf = column => KINDS[column?.getFeeds?.()?.map(markOf).find(mark => KINDS[mark])];

    // "Add column": the types, for the user's own accounts; TweetDeck's own steps choose the account and show the
    // column before it's added, then make it with makeColumnFor
    Object.assign(manager, { FORYOU: KINDS.foryou.type, OTDSPACES: KINDS.spaces.type });
    for(const kind of Object.values(KINDS)) {
        manager.MENU_TITLE[kind.type] = kind.title;
        manager.MODAL_TITLE[kind.type] = `Add a ${kind.title} column`;
        manager.HELP_TEXT[kind.type] = kind.help;
        manager.TWITTER_GENERIC[kind.type] = true;
        manager.SELF_ACCOUNTS_ONLY[kind.type] = true;
        manager.columnTypeToIconClass[kind.type] = kind.icon;
    }
    // first in the row under Home's: For you, Spaces, then TweetDeck's own
    const lists = manager.DISPLAY_ORDER.findIndex(option => option.type === manager.LISTS);
    const added = Object.values(KINDS).filter(kind => !manager.DISPLAY_ORDER.some(option => option.type === kind.type))
        .map(kind => ({ type: kind.type, service: "twitter", title: kind.title, columnIconClass: kind.icon }));
    manager.DISPLAY_ORDER.splice(lists < 0 ? manager.DISPLAY_ORDER.length : lists, 0, ...added);
    const make = manager.makeColumnFor;
    manager.makeColumnFor = function(options) {
        const mark = Object.keys(KINDS).find(mark => KINDS[mark].type === options?.type);
        if(!mark) return make.apply(this, arguments);
        return make.call(this, { ...options, type: "home", service: "twitter", metadata: { ...options.metadata, otdTimeline: mark } });
    };

    // the column's title and icon, in its header and the left bar
    let modules = {};
    try {
        window.webpackJsonp.push([["otd-for-you"], { "otd-for-you": (module, exports, require) => { modules = require.c; } }, [["otd-for-you"]]]);
    } catch(e) {
        console.warn("[otd] no webpack runtime", e);
    }
    const columns = Object.values(modules).map(m => m.exports?.default?.getColumnTitleArgs ? m.exports.default : m.exports).find(e => e?.getColumnTitleArgs && e.getColumnIconClassByColumn);
    if(columns) {
        const titleArgs = columns.getColumnTitleArgs;
        columns.getColumnTitleArgs = function(column) {
            const args = titleArgs.apply(this, arguments);
            const kind = kindOf(column);
            if(args && kind) args.title = kind.title;
            return args;
        };
        const iconClass = columns.getColumnIconClassByColumn;
        columns.getColumnIconClassByColumn = function(column) {
            return kindOf(column)?.icon ?? iconClass.apply(this, arguments);
        };
    }

    // their requests: a client asks for a feed's tweets with refreshFeed, which for a home feed asks for
    // statuses/home_timeline.json with getTimeline there and then; TweetDeck makes refreshFeed each client's own
    let asking = null;
    const getTimeline = TD.services.TwitterClient.prototype.getTimeline;
    TD.services.TwitterClient.prototype.getTimeline = function(url, since, max, count, ok, fail, params, type) {
        if(asking && url === "statuses/home_timeline.json") params = { ...params, otd_timeline: asking };
        return getTimeline.call(this, url, since, max, count, ok, fail, params, type);
    };
    function markRequests(client) {
        if(!client || client.otdTimelines || typeof client.refreshFeed !== "function") return client;
        const refresh = client.refreshFeed;
        client.refreshFeed = function(cursor, ok, fail, options) {
            const mark = options?.metadata?.otdTimeline;
            if(!KINDS[mark]) return refresh.apply(this, arguments);
            asking = mark;
            try {
                return refresh.apply(this, arguments);
            } finally {
                asking = null;
            }
        };
        client.otdTimelines = true;
        return client;
    }
    const clients = TD.controller.clients;
    if(clients?.getClient) {
        const getClient = clients.getClient;
        clients.getClient = function() {
            return markRequests(getClient.apply(this, arguments));
        };
    }

    // what For you's refreshes bring, older or not
    function keepAll(poller) {
        if(poller && !poller.otdKeepAll && KINDS[markOf(poller.feed)]?.keepAll) {
            poller.otdKeepAll = true;
            poller.processRestResult = (known, request, chirps) => ({ chirps, isGappy: false });
        }
        return poller;
    }
    const feeds = TD.controller.feedManager;
    if(feeds?.getPoller) {
        const getPoller = feeds.getPoller, addFeed = feeds.addFeed;
        feeds.getPoller = function() {
            return keepAll(getPoller.apply(this, arguments));
        };
        if(addFeed) feeds.addFeed = function() {
            return keepAll(addFeed.apply(this, arguments));
        };
    }
})();
