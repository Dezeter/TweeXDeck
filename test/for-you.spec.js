// For you, X's algorithmic timeline, as a column (for-you.js, interception.js): "For you" in "Add column" makes a
// home column marked For you, its title "For you"; its requests ask X's HomeTimeline, by the id and features of
// x.com's main.js, and the older tweets its refreshes bring are kept. And "Add column"'s icons over their names.
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addAccount, addScripts } = require("./helpers");

test.use({ viewport: { width: 1000, height: 800 } });

async function openDeck(page) {
    await openPage(page);
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(() => {
        // what a client's refreshFeed does for a home feed, as TweetDeck's own: getHomeTimeline, the request
        // getTimeline makes with makeTwitterCall
        const client = TD.controller.clients.getClient();
        window.__calls = [];
        client.API_BASE_URL = "https://api.x.com/1.1/";
        client.FEED_TYPES = { home: "home" };
        client.makeTwitterCall = (url, params) => window.__calls.push({ url, params });
        client.refreshFeed = function(cursor, ok, fail) {
            this.getHomeTimeline(cursor.since, cursor.max, null, ok, fail);
        };
        TD.storage.accountController.get = () => ({ getType: () => "twitter", getKey: () => "twitter:1", getUsername: () => "Dezeter", getProfileImageURL: () => "", getIsVerified: () => false });
        TD.storage.accountController.getDefault = () => ({ getUsername: () => "Dezeter" });
    });
}

test("\"For you\" in \"Add column\", by Home's row, with its icon; every icon over its name", async ({ page }) => {
    await openDeck(page);
    await addScripts(page, "src/otd-common.js", "src/icons.js", "src/for-you.js");
    const picker = await page.evaluate(() => {
        TD.storage.columnController.getColumnsByType = () => [];
        const home = new TD.components.OpenColumnHome();
        document.body.insertAdjacentHTML("beforeend", '<div style="width:523px">');
        document.body.lastElementChild.append(home.$node[0]);
        const shown = [...document.querySelectorAll(".js-item-launch:not(.is-hidden)")];
        const forYou = document.querySelector('.js-item-launch[data-type="otdforyou"]');
        return {
            order: shown.map(li => li.dataset.type).slice(0, 7),
            title: forYou.querySelector("span").textContent.trim(),
            icon: getComputedStyle(forYou.querySelector(".column-type-icon"), "::before").maskImage.startsWith('url("data:image/svg+xml'),
            // how far each icon's middle is from its name's
            off: shown.map(li => {
                const icon = li.querySelector(".column-type-icon"), name = li.querySelector("span").getBoundingClientRect();
                const box = icon.getBoundingClientRect(), before = getComputedStyle(icon, "::before");
                return Math.round(box.left + parseFloat(before.marginLeft) + parseFloat(before.width) / 2 - (name.left + name.width / 2));
            }),
        };
    });
    expect(picker.order).toEqual(["timeline", "tweets", "interactions", "search", "otdforyou", "otdspaces", "lists"]);
    expect(picker.title).toBe("For you");
    expect(picker.icon).toBe(true);
    for(const off of picker.off) expect(Math.abs(off)).toBeLessThanOrEqual(1);
});

test("the column it makes: TweetDeck's home column marked For you, its own feed, \"For you\" and its icon", async ({ page }) => {
    await openDeck(page);
    await addScripts(page, "src/otd-common.js", "src/for-you.js");
    expect(await page.evaluate(() => {
        const manager = TD.controller.columnManager;
        const forYou = manager.makeColumnFor({ type: "otdforyou", service: "twitter", accountKey: "twitter:1" });
        const home = manager.makeColumnFor({ type: "home", service: "twitter", accountKey: "twitter:1" });
        const req = window.__require;
        const columns = Object.values(req.c).map(m => m.exports?.default?.getColumnTitleArgs ? m.exports.default : m.exports).find(e => e?.getColumnTitleArgs);
        const feed = forYou.getFeeds()[0];
        return {
            feed: [feed.getType(), feed.getMetadata()],
            own: feed.getKey() !== home.getFeeds()[0].getKey(),
            titles: [columns.getColumnTitleArgs(forYou).title, columns.getColumnTitleArgs(home).title],
            // as the left bar and the column's header have it
            html: [columns.getColumnTitleHTML(forYou).includes("For you"), columns.getColumnHeaderTitleHTML(forYou).includes("For you")],
            icons: [columns.getColumnIconClassByColumn(forYou), columns.getColumnIconClassByColumn(home)],
        };
    })).toEqual({
        feed: ["home", { otdTimeline: "foryou" }],
        own: true,
        titles: ["For you", "Home"],
        html: [true, true],
        icons: ["icon-magic-search icon-otd-foryou", "icon-home"],
    });
});

test("its requests are marked for interception.js, Home's aren't", async ({ page }) => {
    await openDeck(page);
    await addScripts(page, "src/otd-common.js", "src/for-you.js");
    expect(await page.evaluate(() => {
        const client = TD.controller.clients.getClient("twitter:1");
        client.refreshFeed({ since: "100" }, () => {}, () => {}, { metadata: { otdTimeline: "foryou" } });
        client.refreshFeed({ since: "100" }, () => {}, () => {}, { metadata: {} });
        return window.__calls.map(call => [call.url, call.params.since_id, call.params.otd_timeline ?? null]);
    })).toEqual([
        ["https://api.x.com/1.1/statuses/home_timeline.json", "100", "foryou"],
        ["https://api.x.com/1.1/statuses/home_timeline.json", "100", null],
    ]);
});

test("a refresh's tweets older than the column's newest: kept for For you, dropped by TweetDeck for Home", async ({ page }) => {
    await openDeck(page);
    await addScripts(page, "src/otd-common.js", "src/for-you.js");
    expect(await page.evaluate(() => {
        const user = { id_str: "10", screen_name: "alice", name: "alice", profile_image_url_https: "", entities: {} };
        const chirp = id => window.__client.processTweet({ id_str: String(id), full_text: `tweet ${id}`, text: "", created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, id)).toUTCString(), source: "web", user, entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } });
        const kept = metadata => {
            const feed = TD.storage.feedController.getOrCreateFeed("home", "twitter", "twitter:1", metadata);
            const poller = TD.controller.feedManager.addFeed(feed);
            poller.chirpArray = [chirp(1000)];
            // TweetDeck's request for what's newer than its newest
            const cursor = TD.util.poller.getRefreshCursor(feed, poller.chirpArray);
            const brought = TD.util.poller.annotateChirpsWithApiBounds(feed, [chirp(2000), chirp(500)]);
            return poller.processRestResult(poller.chirpArray, cursor, brought).chirps.map(c => c.id);
        };
        return { forYou: kept({ otdTimeline: "foryou" }), home: kept({}) };
    })).toEqual({ forYou: ["2000", "500"], home: ["2000"] });
});

// interception.js, X's pages and GraphQL stubbed: x.com's homepage with its features, main.js with HomeTimeline's id
const CORS = { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" };
const HOME = '<html><head><script src="https://abs.twimg.com/responsive-web/client-web/main.abc123.js"></script></head><body><script>window.__INITIAL_STATE__={"featureSwitch":{"defaultConfig":{"f_a":{"value":true},"f_b":{"value":false}},"user":{"config":{"f_b":{"value":true}}}}};</script></body></html>';
const MAIN = 'e.exports={queryId:"Latest_1",operationName:"HomeLatestTimeline",operationType:"query",metadata:{featureSwitches:["f_a"],fieldToggles:[]}};e.exports={queryId:"ForYou_1",operationName:"HomeTimeline",operationType:"query",metadata:{featureSwitches:["f_a","f_b","f_c"],fieldToggles:[]}}';
const result = id => ({
    __typename: "Tweet", rest_id: String(id),
    core: { user_results: { result: { __typename: "User", rest_id: "10", core: { name: "Alice", screen_name: "alice", created_at: "Wed May 03 18:30:51 +0000 2023" }, legacy: {} } } },
    legacy: { id_str: String(id), full_text: `tweet ${id}`, created_at: new Date(Date.UTC(2026, 9, 30, 10, 0, id)).toUTCString(), user_id_str: "10", conversation_id_str: String(id), entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } },
});
const timeline = (ids, top, bottom) => ({ data: { home: { home_timeline_urt: { instructions: [{ type: "TimelineAddEntries", entries: [
    ...ids.map(id => ({ entryId: `tweet-${id}`, content: { itemContent: { tweet_results: { result: result(id) } } } })),
    { entryId: `cursor-top-${top}`, content: { value: top } },
    { entryId: `cursor-bottom-${bottom}`, content: { value: bottom } },
] }] } } } });

async function openSender(page, answers, storage = {}, main = MAIN) {
    const asked = [];
    await openPage(page, { storage: { OTDrefreshInterval: "0", device_id: "device-1", ...storage }, routes: {
        "https://otd.test/": route => {
            const url = new URL(route.request().url());
            if(url.pathname.startsWith("/i/api/graphql/")) {
                const request = route.request(), headers = request.headers();
                // For you's a POST with a JSON body, as x.com sends it; Following's a GET
                const sent = request.method() === "POST" ? request.postDataJSON() : { variables: JSON.parse(url.searchParams.get("variables")), features: JSON.parse(url.searchParams.get("features")) };
                asked.push({ path: url.pathname, method: request.method(), ...sent, tid: headers["x-client-transaction-id"], uuid: headers["x-client-uuid"], auth: !!headers.authorization });
                const [status, body] = answers.shift();
                return route.fulfill({ status, contentType: "application/json", headers: CORS, body: typeof body === "string" ? body : JSON.stringify(body) });
            }
            asked.push({ path: url.pathname });
            return route.fulfill({ contentType: "text/html", headers: CORS, body: HOME });
        },
        "https://abs.twimg.com/": route => {
            asked.push({ path: new URL(route.request().url()).pathname });
            return route.fulfill({ contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: main });
        },
    } });
    await page.evaluate(() => { window.solveChallenge = async (path, method) => `tid:${method}:${path}`; });
    await addScripts(page, "src/interception.js");
    return asked;
}
// TweetDeck's request for a home column's tweets, as for-you.js marks For you's; the ids it got, or a status
const ask = (page, query) => page.evaluate(query => new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `https://api.x.com/1.1/statuses/home_timeline.json?user_id=1&count=40${query}`);
    xhr.setRequestHeader("x-act-as-user-id", "1");
    xhr.onload = () => resolve(xhr.status === 200 ? JSON.parse(xhr.responseText).map(tweet => Number(tweet.id_str)) : xhr.status);
    xhr.send();
}), query);

test("For you asks X's HomeTimeline by x.com's id and features; new ones by its top cursor, further down by its bottom one", async ({ page }) => {
    const asked = await openSender(page, [
        [200, timeline([30, 20, 10], "T1", "B1")],
        [200, timeline([40, 5], "T2", "B2")],
        [200, timeline([3, 2], "T3", "B3")],
        [200, timeline([50, 40], "L1", "LB1")],
    ]);
    expect(await ask(page, "&otd_timeline=foryou")).toEqual([30, 20, 10]);
    // the ones it brings older than the newest too
    expect(await ask(page, "&otd_timeline=foryou&since_id=30")).toEqual([40, 5]);
    expect(await ask(page, "&otd_timeline=foryou&max_id=4")).toEqual([3, 2]);
    const graphql = asked.filter(a => a.variables);
    expect(asked.filter(a => !a.variables).map(a => a.path)).toEqual(["/", "/responsive-web/client-web/main.abc123.js"]);
    expect(graphql.map(a => [a.method, a.path, a.queryId, a.variables.cursor ?? null, a.variables.requestContext])).toEqual([
        ["POST", "/i/api/graphql/ForYou_1/HomeTimeline", "ForYou_1", null, "launch"],
        ["POST", "/i/api/graphql/ForYou_1/HomeTimeline", "ForYou_1", "T1", "ptr"],
        // the bottom cursor of the first page: a refresh's isn't further down
        ["POST", "/i/api/graphql/ForYou_1/HomeTimeline", "ForYou_1", "B1", "launch"],
    ]);
    expect(graphql[0].variables).toMatchObject({ count: 40, includePromotedContent: true, latestControlAvailable: true, withCommunity: true, seenTweetIds: [] });
    // the user's own value over the homepage's default; one it doesn't have is off
    expect(graphql[0].features).toMatchObject({ f_a: true, f_b: true, f_c: false });
    expect(graphql[0]).toMatchObject({ tid: "tid:POST:/i/api/graphql/ForYou_1/HomeTimeline", uuid: "device-1", auth: true });

    // Home, Following, as it was: HomeLatestTimeline, without For you's cursors
    asked.length = 0;
    expect(await ask(page, "&since_id=30")).toEqual([50, 40]);
    expect(asked.map(a => [a.method, a.path, a.variables.cursor ?? null])).toEqual([["GET", "/i/api/graphql/cWF3cqWadLlIXA6KJWhcew/HomeLatestTimeline", null]]);
});

test("For you's new tweets at most every refreshInterval; further down before a first page, nothing", async ({ page }) => {
    const asked = await openSender(page, [[200, timeline([30, 20], "T1", "B1")]], { OTDrefreshInterval: "35000" });
    expect(await ask(page, "&otd_timeline=foryou&max_id=9")).toEqual([]);
    expect(await ask(page, "&otd_timeline=foryou")).toEqual([30, 20]);
    expect(await ask(page, "&otd_timeline=foryou&since_id=30")).toEqual([]);
    expect(asked.filter(a => a.variables)).toHaveLength(1);
});

test("X dropping HomeTimeline's id: it's looked up in main.js again next time", async ({ page }) => {
    const asked = await openSender(page, [[404, {}], [200, timeline([30], "T1", "B1")]]);
    expect(await ask(page, "&otd_timeline=foryou")).toBe(404);
    expect(await page.evaluate(() => localStorage.OTDhomeTimelineQuery)).toBeUndefined();
    expect(await ask(page, "&otd_timeline=foryou")).toEqual([30]);
    expect(asked.filter(a => !a.variables).map(a => a.path)).toEqual(["/", "/responsive-web/client-web/main.abc123.js", "/", "/responsive-web/client-web/main.abc123.js"]);
});

test("HomeTimeline not in x.com's main.js: asked by the id x.com had, with the features of Following's", async ({ page }) => {
    const asked = await openSender(page, [[200, timeline([30], "T1", "B1")]], {}, MAIN.split(";e.exports=")[0]);
    expect(await ask(page, "&otd_timeline=foryou")).toEqual([30]);
    const request = asked.find(a => a.variables);
    expect([request.path, request.queryId]).toEqual(["/i/api/graphql/-X_hcgQzmHGl29-UXxz4sw/HomeTimeline", "-X_hcgQzmHGl29-UXxz4sw"]);
    expect(request.features).toMatchObject({ rweb_video_screen_enabled: false, longform_notetweets_consumption_enabled: true });
});

test("X answering For you without a body: its status is TweetDeck's error, the console without a SyntaxError", async ({ page }) => {
    const errors = [];
    page.on("console", message => message.type() === "error" && errors.push(message.text()));
    await openSender(page, [[422, ""]]);
    expect(await ask(page, "&otd_timeline=foryou")).toBe(422);
    expect(errors.filter(text => /SyntaxError|JSON/.test(text))).toEqual([]);
});
