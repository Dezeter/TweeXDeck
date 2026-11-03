// For you, X's algorithmic timeline, as a column: "For you" in "Add column", by Home, for one of the user's own
// accounts. It's TweetDeck's own home column with a mark in its feed's metadata (otdTimeline), so TweetDeck keeps,
// polls, shows and saves it as it does Home: its requests carry otd_timeline=foryou, which interception.js asks
// X's HomeTimeline for instead of HomeLatestTimeline. Its title is "For you", its icon sparkles.
// X's picks aren't in order of time, and TweetDeck keeps a column in that order: the ones a refresh brings that are
// older than the column's newest go where their time puts them, instead of being dropped, as TweetDeck drops what
// isn't newer from a timeline it asks for what's newer.
// Loaded by injection.js after otd-common.js.
(() => {
    const TD = window.TD;
    const manager = TD?.controller?.columnManager;
    if(!manager?.DISPLAY_ORDER || !TD.services?.TwitterClient?.prototype.getTimeline) return;

    const TYPE = "otdforyou";
    const TITLE = "For you";
    // the font's glyph where the SVG icons are off, icons.js's sparkles where they're on
    const ICON = "icon-magic-search icon-otd-foryou";
    const isForYou = feed => feed?.getMetadata?.()?.otdTimeline === "foryou";
    const columnIsForYou = column => !!column?.getFeeds?.()?.some(isForYou);

    // "Add column": the type, for the user's own accounts; TweetDeck's own steps choose the account and show the
    // column before it's added, then make it with makeColumnFor
    Object.assign(manager, { FORYOU: TYPE });
    manager.MENU_TITLE[TYPE] = TITLE;
    manager.MODAL_TITLE[TYPE] = "Add a For you column";
    manager.HELP_TEXT[TYPE] = "Add a For you column for your account: what X picks for you, from people you follow and people you don't";
    manager.TWITTER_GENERIC[TYPE] = true;
    manager.SELF_ACCOUNTS_ONLY[TYPE] = true;
    manager.columnTypeToIconClass[TYPE] = ICON;
    if(!manager.DISPLAY_ORDER.some(option => option.type === TYPE)) {
        const lists = manager.DISPLAY_ORDER.findIndex(option => option.type === manager.LISTS);
        manager.DISPLAY_ORDER.splice(lists < 0 ? manager.DISPLAY_ORDER.length : lists, 0, { type: TYPE, service: "twitter", title: TITLE, columnIconClass: ICON });
    }
    const make = manager.makeColumnFor;
    manager.makeColumnFor = function(options) {
        if(options?.type !== TYPE) return make.apply(this, arguments);
        return make.call(this, { ...options, type: "home", service: "twitter", metadata: { ...options.metadata, otdTimeline: "foryou" } });
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
            if(args && columnIsForYou(column)) args.title = TITLE;
            return args;
        };
        const iconClass = columns.getColumnIconClassByColumn;
        columns.getColumnIconClassByColumn = function(column) {
            return columnIsForYou(column) ? ICON : iconClass.apply(this, arguments);
        };
    }

    // its requests: a client asks for a feed's tweets with refreshFeed, which for a home feed asks for
    // statuses/home_timeline.json with getTimeline there and then; TweetDeck makes refreshFeed each client's own
    let forYou = false;
    const getTimeline = TD.services.TwitterClient.prototype.getTimeline;
    TD.services.TwitterClient.prototype.getTimeline = function(url, since, max, count, ok, fail, params, type) {
        if(forYou && url === "statuses/home_timeline.json") params = { ...params, otd_timeline: "foryou" };
        return getTimeline.call(this, url, since, max, count, ok, fail, params, type);
    };
    function markRequests(client) {
        if(!client || client.otdForYou || typeof client.refreshFeed !== "function") return client;
        const refresh = client.refreshFeed;
        client.refreshFeed = function(cursor, ok, fail, options) {
            if(options?.metadata?.otdTimeline !== "foryou") return refresh.apply(this, arguments);
            forYou = true;
            try {
                return refresh.apply(this, arguments);
            } finally {
                forYou = false;
            }
        };
        client.otdForYou = true;
        return client;
    }
    const clients = TD.controller.clients;
    if(clients?.getClient) {
        const getClient = clients.getClient;
        clients.getClient = function() {
            return markRequests(getClient.apply(this, arguments));
        };
    }

    // what its refreshes bring, older or not
    function keepAll(poller) {
        if(poller && !poller.otdForYou && isForYou(poller.feed)) {
            poller.otdForYou = true;
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
