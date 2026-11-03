// Posts longer than 280: TweetDeck's tweet box counts to 25 000 (long-posts.js), and interception.js sends such a
// post as x.com does, with CreateNoteTweet by the id and features x.com's own main.js and homepage have
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

const LONG = "Meet TweeXDeck - a free comeback of TweetDeck, built for myself and for anyone who wants it. ".repeat(7).trim();

// TweetDeck's tweet box: whether it can send the text, and how much is left
const composer = (page, text) => page.evaluate(text => {
    const require = window.__require;
    const id = Object.keys(require.m).find(id => require.m[id].toString().includes("t.hasQuotedTweet = !!t.quotedTweet"));
    const result = require(id)({
        tweetText: text, files: [], quotedTweet: null, tweetType: "tweet", selectedAccountKeys: ["twitter:1"], messageRecipients: [],
        configuration: { characters_reserved_per_media: 24, transformedURLLength: 23, dm_text_character_limit: 10000 },
        settings: {}, currentTime: new Date(), sendingStatus: "ready", accounts: [], selectedAccounts: [],
    });
    return { canSend: result.canSend, left: result.remainingCharCount };
}, text);

test("the tweet box takes a post longer than 280, up to 25 000", async ({ page }) => {
    await openPage(page);
    await addTweetDeck(page);
    expect(LONG.length).toBeGreaterThan(600);
    expect(await composer(page, LONG)).toMatchObject({ canSend: false });
    // as injection.js loads them: twitter-text's copy on window before this extension's scripts
    await addScripts(page, "files/twitter-text.js", "src/otd-common.js", "src/long-posts.js");
    expect(await composer(page, LONG)).toEqual({ canSend: true, left: 25000 - LONG.length });
    expect((await composer(page, "x".repeat(25001))).canSend).toBe(false);
    // the copy on window counts the same
    expect(await page.evaluate(() => twttr.txt.parseTweet("x".repeat(3000)).valid)).toBe(true);
});

test("switched off, the tweet box stops at 280", async ({ page }) => {
    await openPage(page, { storage: { OTDlongPosts: "0" } });
    await addTweetDeck(page);
    await addScripts(page, "src/otd-common.js", "src/long-posts.js");
    expect(await composer(page, LONG)).toMatchObject({ canSend: false });
});

const CORS = { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" };
const HOME = '<html><head><script src="https://abs.twimg.com/responsive-web/client-web/main.abc123.js"></script></head><body><script>window.__INITIAL_STATE__={"featureSwitch":{"defaultConfig":{"f_a":{"value":true},"f_b":{"value":false},"other":{"value":true}},"user":{"config":{"f_b":{"value":true}}}}};</script></body></html>';
const MAIN = 'e.exports={queryId:"oB-5XsHNAbjvARJEc8CZFw",operationName:"CreateTweet",operationType:"mutation",metadata:{featureSwitches:["f_a"],fieldToggles:[]}};e.exports={queryId:"NoteQ_1",operationName:"CreateNoteTweet",operationType:"mutation",metadata:{featureSwitches:["f_a","f_b","f_c"],fieldToggles:[]}}';
const posted = text => ({ data: { notetweet_create: { tweet_results: { result: {
    __typename: "Tweet", rest_id: "900",
    core: { user_results: { result: { __typename: "User", rest_id: "1", core: { name: "Dezeter", screen_name: "Dezeter", created_at: "Wed May 03 18:30:51 +0000 2023" }, legacy: {} } } },
    legacy: { id_str: "900", full_text: text.slice(0, 270), created_at: "Thu Oct 30 10:00:00 +0000 2026", user_id_str: "1", conversation_id_str: "900", entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } },
    note_tweet: { note_tweet_results: { result: { text, entity_set: { hashtags: [], symbols: [], urls: [], user_mentions: [] } } } },
} } } } });

// main: x.com's main.js, or null when it can't be read, as when Firefox's background script blocked it
async function openSender(page, answer, main = MAIN) {
    const asked = [];
    await openPage(page, { routes: {
        "https://otd.test/": route => {
            const url = new URL(route.request().url());
            asked.push(url.pathname);
            if(url.pathname.startsWith("/i/api/graphql/")) {
                asked.push({ body: route.request().postDataJSON(), tid: route.request().headers()["x-client-transaction-id"], auth: route.request().headers()["authorization"] });
                return route.fulfill({ contentType: "application/json", headers: CORS, body: JSON.stringify(answer(route.request().postDataJSON())) });
            }
            return route.fulfill({ contentType: "text/html", headers: CORS, body: HOME });
        },
        "https://abs.twimg.com/": route => {
            asked.push(new URL(route.request().url()).pathname);
            if(main === null) return route.abort();
            return route.fulfill({ contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: main });
        },
    } });
    await addTweetDeck(page);
    await page.evaluate(() => { window.solveChallenge = async (path, method) => `tid:${method}:${path}`; });
    await addScripts(page, "files/twitter-text.js", "src/interception.js");
    return asked;
}
// statuses/update as TweetDeck sends it: what TweetDeck gets back
const send = (page, status) => page.evaluate(status => new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://api.x.com/1.1/statuses/update.json");
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.setRequestHeader("Authorization", "Bearer x");
    xhr.onload = () => resolve({ status: xhr.status, body: JSON.parse(xhr.responseText) });
    xhr.send(new URLSearchParams({ status, in_reply_to_status_id: "77" }).toString());
}), status);

test("a post longer than 280 goes as x.com sends it: CreateNoteTweet by x.com's id, its features as x.com's homepage has them", async ({ page }) => {
    const asked = await openSender(page, () => posted(LONG));
    const sent = await send(page, LONG);
    // TweetDeck gets the post, with its whole text
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ id_str: "900", full_text: LONG });
    const request = asked.find(a => a.body);
    expect(asked.filter(a => typeof a === "string")).toEqual(["/", "/responsive-web/client-web/main.abc123.js", "/i/api/graphql/NoteQ_1/CreateNoteTweet"]);
    expect(request.body).toEqual({
        variables: { tweet_text: LONG, media: { media_entities: [], possibly_sensitive: false }, semantic_annotation_ids: [], dark_request: false,
            reply: { in_reply_to_tweet_id: "77", exclude_reply_user_ids: [] }, richtext_options: { richtext_tags: [] } },
        // the user's own value over the default; one the homepage doesn't have is off
        features: { f_a: true, f_b: true, f_c: false },
        queryId: "NoteQ_1",
    });
    expect(request.tid).toBe("tid:POST:/i/api/graphql/NoteQ_1/CreateNoteTweet");
    expect(request.auth).toBeTruthy();

    // the next one without asking x.com's pages again
    asked.length = 0;
    expect((await send(page, LONG)).status).toBe(200);
    expect(asked.filter(a => typeof a === "string")).toEqual(["/i/api/graphql/NoteQ_1/CreateNoteTweet"]);
    // a short one as before
    asked.length = 0;
    await send(page, "hi");
    expect(asked.filter(a => typeof a === "string")).toEqual(["/i/api/graphql/oB-5XsHNAbjvARJEc8CZFw/CreateTweet"]);
});

test("x.com's main.js that can't be read, or without CreateNoteTweet: the post goes by the id and features x.com had", async ({ page }) => {
    for(const main of [null, MAIN.split(";e.exports=")[0]]) {
        const asked = await openSender(page, () => posted(LONG), main);
        const sent = await send(page, LONG);
        expect(sent.status).toBe(200);
        expect(sent.body).toMatchObject({ id_str: "900", full_text: LONG });
        expect(asked.filter(a => typeof a === "string").at(-1)).toBe("/i/api/graphql/o4vMmMGVvt40x_q9DD3ehQ/CreateNoteTweet");
        const request = asked.find(a => a.body);
        expect(request.body.queryId).toBe("o4vMmMGVvt40x_q9DD3ehQ");
        expect(request.body.features).toMatchObject({ longform_notetweets_consumption_enabled: true, longform_notetweets_rich_text_read_enabled: true });
        expect(request.body.variables).toMatchObject({ tweet_text: LONG, richtext_options: { richtext_tags: [] } });
        await page.unrouteAll({ behavior: "ignoreErrors" });
    }
});

test("X refusing a long post is an error for TweetDeck, with X's code and words", async ({ page }) => {
    await openSender(page, () => ({ errors: [{ code: 186, message: "Tweet needs to be a bit shorter." }] }));
    expect(await send(page, LONG)).toEqual({ status: 403, body: { errors: [{ code: 186, message: "Tweet needs to be a bit shorter." }] } });
});
