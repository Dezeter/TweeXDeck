// X's smart cashtags: what interception.js keeps of a tweet's, "$Index" in place of a token's id in the text, and
// the card of an attached asset with X's numbers from SmartTagAttachmentQuery
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount, read } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 420, height: 900 } });

const TOKEN = "robinhood:0x56910d4409f3a0c78c64dd8d0545ff0705389870";
const SMARTTAG = { indices: [27, 79], tag: { info: { info: { name: "The Index", ticker: "Index", tradable_platforms: [] } }, rest_id: TOKEN }, text: TOKEN };

test("interception.js keeps a tweet's attached assets and smart tags by its id, and asks X for them", async ({ page }) => {
    await openPage(page);
    await addScripts(page, "src/interception.js");
    const result = await page.evaluate(([TOKEN, SMARTTAG]) => {
        const user = { __typename: "User", rest_id: "7", core: { name: "Crag", screen_name: "crag", created_at: "Wed May 03 18:30:51 +0000 2023" }, legacy: {} };
        const legacy = (id, text) => ({ id_str: id, full_text: text, created_at: "Wed Oct 28 20:32:48 +0000 2026", user_id_str: "7", conversation_id_str: id, entities: { symbols: [] } });
        const quoted = { __typename: "Tweet", rest_id: "2", core: { user_results: { result: user } }, legacy: legacy("2", "short"),
            note_tweet: { note_tweet_results: { result: { text: `a WORKING ${TOKEN}`, entity_set: { smarttags: [{ ...SMARTTAG, indices: [10, 62] }] } } } } };
        const tweet = { __typename: "Tweet", rest_id: "1", core: { user_results: { result: user } }, cashtag_attachments: [{ rest_id: TOKEN }],
            legacy: { ...legacy("1", "short"), is_quote_status: true, quoted_status_id_str: "2" },
            note_tweet: { note_tweet_results: { result: { text: `this fixes it for tokens, ${TOKEN} , where`, entity_set: { smarttags: [SMARTTAG], symbols: [] } } } },
            quoted_status_result: { result: quoted } };
        const plain = { __typename: "Tweet", rest_id: "3", core: { user_results: { result: user } }, cashtag_attachments: [], legacy: legacy("3", "nothing") };
        // as a timeline's query answers: neither
        const unsaid = { __typename: "Tweet", rest_id: "4", core: { user_results: { result: user } }, legacy: legacy("4", `just ${TOKEN}`) };
        parseTweet(tweet);
        parseTweet(plain);
        parseTweet(unsaid);
        // the tweet again, from a timeline: what X said of it stays
        parseTweet({ ...tweet, cashtag_attachments: undefined, note_tweet: undefined });
        const features = JSON.parse(new URLSearchParams(generateParams({ a: true }, { b: 1 })).get("features"));
        const store = window.OTDcashtagData;
        return { one: store.get("1"), two: store.get("2"), three: store.get("3"), four: store.has("4"), features };
    }, [TOKEN, SMARTTAG]);
    const tag = { id: TOKEN, text: TOKEN, name: "The Index", ticker: "Index" };
    expect(result.one).toEqual({ attached: [TOKEN], tags: [tag] });
    // X didn't say what the quote attaches; it said the third tweet attaches nothing
    expect(result.two).toEqual({ attached: null, tags: [tag] });
    expect(result.three).toEqual({ attached: [], tags: [] });
    expect(result.four).toBe(false);
    expect(result.features).toEqual({ a: true, rweb_cashtags_enabled: true, rweb_cashtags_composer_attachment_enabled: true });
    // TweetDetail too
    expect(await page.evaluate(() => JSON.parse(new URL(tweetDetailUrl("1")).searchParams.get("features")).rweb_cashtags_enabled)).toBe(true);
});

const money = (value, currency = "USD") => ({ currency_code: currency, units: String(Math.trunc(value)), nanos: Math.round((value % 1) * 1e9) });
const ANSWER = change => ({ data: {
    finance_asset_data: { asset: {
        crypto: { __typename: "FinanceCryptoAsset", chain_logo_url: "https://abs.twimg.com/finance/v1/crypto/robinhood/native.png", contract_address: "0x56910d4409f3a0c78c64dd8d0545ff0705389870" },
        logo_url: "https://abs.twimg.com/finance/v1/crypto/robinhood/0x56910d4409f3a0c78c64dd8d0545ff0705389870.png",
        name: "The Index", quote: { change_24h_percent: change, market_cap: money(6770188.37), price: money(0.0069046) }, ticker: "Index",
    } },
    finance_chart_data: { data_points: [0.006914, 0.007083, 0.0064, 0.0081, 0.006773].map((value, i) => ({ price: money(value), timestamp: 1793179800000 + i * 300000 })), gaps: [], sessions: [] },
    smart_tag_by_rest_id: { rest_id: "robinhood:0x56910d4409f3a0c78c64dd8d0545ff0705389870", info: { info: { active: true } } },
} });

// a column with a tweet that attaches the token and names it in its text, and one that only names it
async function openColumn(page, { change = 50.4, status = 200, queryId } = {}) {
    const asked = [];
    await openPage(page, { routes: {
        "http://otd.test/i/api/graphql/": route => {
            const url = new URL(route.request().url());
            asked.push(url);
            // a token X has no asset for, a chain's own coin, and The Index for any other
            const symbol = JSON.parse(url.searchParams.get("variables") || "{}").assetSymbol;
            const body = symbol === NONE ? { data: { finance_asset_data: null } } : symbol === NATIVE ? HYPE : ANSWER(change);
            return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        },
        "https://abs.twimg.com/": route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }),
    } });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(TOKEN => {
        TD.settings.getColumnWidth = () => "medium";
        const user = { id_str: "7", screen_name: "crag", name: "Crag", profile_image_url_https: "", entities: {} };
        const tweet = (id, text) => ({ id_str: id, full_text: text, text, created_at: new Date().toUTCString(), source: "web", user, entities: { hashtags: [], user_mentions: [], symbols: [], urls: [] } });
        const chirps = [
            window.__client.processTweet(tweet("1", `fixes it for tokens, like ${TOKEN} , where`)),
            window.__client.processTweet(tweet("2", `basically a WORKING ${TOKEN}`)),
        ];
        const tag = { id: TOKEN, text: TOKEN, name: "The Index", ticker: "Index" };
        window.OTDcashtagData = new Map([["1", { attached: [TOKEN], tags: [tag] }], ["2", { attached: [], tags: [tag] }]]);
        window.__chirps = Object.fromEntries(chirps.map(c => [c.id, c]));
        TD.controller.columnManager = { get: key => key === "c1" ? { findChirp: id => window.__chirps[id] } : null };
        document.body.insertAdjacentHTML("beforeend", '<section class="js-column column" data-column="c1" style="width:340px;display:block"><div class="js-column-scroller column-scroller"><div class="js-chirp-container chirp-container"></div></div></section>');
        const container = document.querySelector(".js-chirp-container");
        for(const chirp of chirps) container.insertAdjacentHTML("beforeend", chirp.render({ mediaPreviewSize: "medium" }));
    }, TOKEN);
    await addScripts(page, "src/otd-common.js");
    // the query's id x.com asks it with, or another; "" draws no card
    const source = read("src/cashtags.js");
    await page.addScriptTag({ content: queryId === undefined ? source : source.replace(/const QUERY_ID = "[^"]*";/, `const QUERY_ID = ${JSON.stringify(queryId)};`) });
    return asked;
}
const card = page => page.locator('[data-key="1"] .otd-ticker-card');
const OTHER = "robinhood:0x88ad8ddf1e3898412146a534538d418c6f8a9062";
const NONE = "robinhood:0x0000000000000000000000000000000000000001";
const NATIVE = "hyperliquid:native";
const HYPE = (() => {
    const answer = ANSWER(3.1);
    Object.assign(answer.data.finance_asset_data.asset, { name: "Hyperliquid", ticker: "HYPE", logo_url: "https://abs.twimg.com/finance/v1/crypto/hyperliquid/native.png",
        crypto: { __typename: "FinanceCryptoAsset", chain_logo_url: "https://abs.twimg.com/finance/v1/crypto/hyperliquid/native.png" } });
    return answer;
})();
// a tweet in the column X's data says nothing of, as from a timeline: TweetDeck's timelines are asked with queries
// older than smart tags, which leave them out
const addUntagged = (page, id, text) => page.evaluate(([id, text]) => {
    const user = { id_str: "8", screen_name: "craghack", name: "CragHack", profile_image_url_https: "", entities: {} };
    const chirp = window.__client.processTweet({ id_str: id, full_text: text, text, created_at: new Date().toUTCString(), source: "web", user, entities: { hashtags: [], user_mentions: [], symbols: [], urls: [] } });
    window.__chirps[id] = chirp;
    document.querySelector(".js-chirp-container").insertAdjacentHTML("beforeend", chirp.render({ mediaPreviewSize: "medium" }));
}, [id, text]);

test("a token's id in the text is its cashtag, TweetDeck's own link, the name and id in its tooltip", async ({ page }) => {
    await openColumn(page);
    const texts = await page.$$eval(".js-tweet-text", texts => texts.map(text => {
        const tag = text.querySelector("a.otd-smarttag");
        return [text.textContent.trim(), tag?.getAttribute("rel"), tag?.title];
    }));
    expect(texts).toEqual([
        ["fixes it for tokens, like $Index , where", "hashtag", "The Index · robinhood:0x56910d4409f3a0c78c64dd8d0545ff0705389870"],
        ["basically a WORKING $Index", "hashtag", "The Index · robinhood:0x56910d4409f3a0c78c64dd8d0545ff0705389870"],
    ]);
    // drawn once, however often the page changes
    await page.evaluate(() => document.body.append(document.createElement("div")));
    await page.waitForTimeout(100);
    expect(await page.locator("a.otd-smarttag").count()).toBe(2);
});

test("an attached asset is a card under the text: logo and chain, name, ticker, price, day's change and chart", async ({ page }) => {
    const asked = await openColumn(page);
    await expect(card(page)).not.toHaveClass(/is-loading/);
    expect(await card(page).evaluate(box => ({
        name: box.querySelector(".otd-ticker-name").textContent,
        // Intl's spaces are no-break ones
        line: [...box.querySelectorAll(".otd-ticker-line > span")].map(span => span.textContent.replace(/\s/g, " ")),
        up: box.querySelector(".otd-ticker-change").classList.contains("is-up"),
        points: box.querySelector(".otd-ticker-chart polyline").getAttribute("points").split(" ").length,
        logo: getComputedStyle(box.querySelector(".otd-ticker-logo")).backgroundImage.includes("0x56910d4409f3a0c78c64dd8d0545ff0705389870.png"),
        chain: getComputedStyle(box.querySelector(".otd-ticker-chain")).backgroundImage.includes("native.png"),
        search: [box.getAttribute("rel"), box.dataset.searchTerm],
        under: box.previousElementSibling.classList.contains("js-tweet-text"),
    }))).toEqual({
        name: "The Index", line: ["Index", "0,00690 $", "+50,40 %"], up: true, points: 5, logo: true, chain: true,
        search: ["search", "$Index"], under: true,
    });
    // one question for the token, and none for a tweet that only names it
    expect(asked).toHaveLength(1);
    expect(asked[0].pathname).toBe("/i/api/graphql/qlU4kwL73-PXdo3qpTA4MA/SmartTagAttachmentQuery");
    // as x.com asks it: the asset, the day in 5-minute steps
    expect(JSON.parse(asked[0].searchParams.get("variables"))).toEqual({ assetSymbol: "robinhood:0x56910d4409f3a0c78c64dd8d0545ff0705389870", timeframe: "1D", candleSize: "5m" });
    expect(await page.locator('[data-key="2"] .otd-ticker-card').count()).toBe(0);
});

test("a fall is red; X not answering leaves the card with the name the text gave", async ({ page }) => {
    await openColumn(page, { change: -2.5 });
    await expect(card(page).locator(".otd-ticker-change")).toHaveText(/^-2,50\s%$/);
    expect(await card(page).locator(".otd-ticker-chart").getAttribute("class")).toContain("is-down");

    await openColumn(page, { status: 500 });
    await expect(card(page)).not.toHaveClass(/is-loading/);
    expect(await card(page).locator(".otd-ticker-name").textContent()).toBe("The Index");
    expect(await card(page).locator(".otd-ticker-price").count()).toBe(0);
});

test("without the query's id, the text's cashtag but no card, and nothing asked", async ({ page }) => {
    const asked = await openColumn(page, { queryId: "" });
    await page.waitForTimeout(200);
    expect(await page.locator("a.otd-smarttag").count()).toBe(2);
    expect(await page.locator(".otd-ticker-card").count()).toBe(0);
    expect(asked).toHaveLength(0);
});

test("switched off, the text and the tweet stay as TweetDeck draws them", async ({ page }) => {
    await page.addInitScript(() => { localStorage.OTDsmartCashtags = "0"; });
    const asked = await openColumn(page);
    await page.waitForTimeout(200);
    expect(await page.locator(".otd-smarttag, .otd-ticker-card").count()).toBe(0);
    expect(asked).toHaveLength(0);
});

test("a token's id that X's data doesn't tag is its cashtag too, its ticker from SmartTagAttachmentQuery, each time it's there", async ({ page }) => {
    const asked = await openColumn(page);
    await addUntagged(page, "3", `talking about ${OTHER} and why ${OTHER} is better`);
    const link = page.locator('[data-key="3"] a.otd-smarttag');
    await expect(link).toHaveCount(2);
    expect(await page.$eval('[data-key="3"] .js-tweet-text', text => text.textContent.trim())).toBe("talking about $Index and why $Index is better");
    expect(await link.first().evaluate(a => [a.getAttribute("rel"), a.title, a.dataset.otdToken])).toEqual(["hashtag", `The Index · ${OTHER}`, OTHER]);
    // asked once for it, as x.com asks it
    const forIt = asked.filter(url => JSON.parse(url.searchParams.get("variables")).assetSymbol === OTHER);
    expect(forIt.map(url => url.pathname)).toEqual(["/i/api/graphql/qlU4kwL73-PXdo3qpTA4MA/SmartTagAttachmentQuery"]);
    // a second tweet with it: no new question
    await addUntagged(page, "4", `again ${OTHER}`);
    await expect(page.locator('[data-key="4"] a.otd-smarttag')).toHaveCount(1);
    expect(asked.filter(url => JSON.parse(url.searchParams.get("variables")).assetSymbol === OTHER)).toHaveLength(1);
});

test("an id X has no asset for stays as the text has it", async ({ page }) => {
    const asked = await openColumn(page);
    await addUntagged(page, "3", `not a token: ${NONE}`);
    await expect.poll(() => asked.some(url => JSON.parse(url.searchParams.get("variables")).assetSymbol === NONE)).toBe(true);
    await page.waitForTimeout(200);
    expect(await page.$eval('[data-key="3"] .js-tweet-text', text => [text.textContent.trim(), text.querySelectorAll("a").length])).toEqual([`not a token: ${NONE}`, 0]);
});

test("a tweet X didn't say what it attaches has a card for each token its text names that X has, two at most, in the text's order", async ({ page }) => {
    await openColumn(page);
    await addUntagged(page, "3", `what a day for ${NATIVE} bulls, ${NONE} aside, and ${OTHER}, ${OTHER}; ${TOKEN} too`);
    const cards = page.locator('[data-key="3"] .otd-ticker-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).not.toHaveClass(/is-loading/);
    expect(await cards.evaluateAll(boxes => boxes.map(box => [box.querySelector(".otd-ticker-name").textContent, box.dataset.searchTerm, box.title]))).toEqual([
        ["Hyperliquid", "$HYPE", `Hyperliquid · ${NATIVE}`],
        ["The Index", "$Index", "The Index · 0x56910d4409f3a0c78c64dd8d0545ff0705389870"],
    ]);
    // under the text, one after the other
    expect(await page.$eval('[data-key="3"] .js-tweet-text', text => [text.nextElementSibling.matches(".otd-ticker-card"), text.nextElementSibling.nextElementSibling.matches(".otd-ticker-card")])).toEqual([true, true]);
    // the chain's own coin is a cashtag in the text too
    await expect.poll(() => page.$eval('[data-key="3"] .js-tweet-text', text => text.textContent.trim())).toBe(`what a day for $HYPE bulls, ${NONE} aside, and $Index, $Index; $Index too`);
    expect(await page.$eval('[data-key="3"] a.otd-smarttag', a => [a.title, a.dataset.otdToken])).toEqual([`Hyperliquid · ${NATIVE}`, NATIVE]);
});

test("no card for a text whose ids X has no asset for, nor for an id that's part of a word or a link", async ({ page }) => {
    const asked = await openColumn(page);
    await addUntagged(page, "3", `not a token: ${NONE}, nor ${NATIVE}s or https://example.com/${NATIVE}`);
    await expect.poll(() => asked.some(url => JSON.parse(url.searchParams.get("variables")).assetSymbol === NONE)).toBe(true);
    await page.waitForTimeout(200);
    expect(await page.locator('[data-key="3"] .otd-ticker-card, [data-key="3"] .otd-smarttag').count()).toBe(0);
    expect(asked.map(url => JSON.parse(url.searchParams.get("variables")).assetSymbol)).not.toContain(NATIVE);
});

test("beside the square of a tweet's photo, the card goes under it, as wide as the tweet's text", async ({ page }) => {
    // a column with room for the square beside the text
    await page.setViewportSize({ width: 600, height: 900 });
    await openColumn(page);
    await page.evaluate(OTHER => {
        document.querySelector(".js-column").style.width = "440px";
        const photo = { id_str: "9", type: "photo", media_url_https: "https://pbs.twimg.com/media/P9.jpg", original_info: { width: 800, height: 600 },
            sizes: { large: { w: 800, h: 600, resize: "fit" }, medium: { w: 800, h: 600, resize: "fit" }, small: { w: 680, h: 510, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } },
            url: "https://t.co/m", display_url: "pic.x.com/m", expanded_url: "https://x.com/i/status/9/photo/1", indices: [64, 77] };
        const user = { id_str: "8", screen_name: "craghack", name: "CragHack", profile_image_url_https: "", entities: {} };
        const text = `${OTHER} https://t.co/m`;
        const chirp = window.__client.processTweet({ id_str: "5", full_text: text, text, created_at: new Date().toUTCString(), source: "web", user,
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [], media: [photo] }, extended_entities: { media: [photo] } });
        window.__chirps["5"] = chirp;
        // the square is a Small column's
        TD.controller.columnManager = { get: key => key === "c1" ? { findChirp: id => window.__chirps[id], getMediaPreviewSize: () => "small" } : null };
        document.querySelector(".js-chirp-container").insertAdjacentHTML("beforeend", chirp.render({ mediaPreviewSize: "small" }));
    }, OTHER);
    await page.addScriptTag({ content: read("src/media-layout.js") });
    const box = page.locator('[data-key="5"] .otd-ticker-card');
    await expect(box).not.toHaveClass(/is-loading/);
    const place = await page.$eval('[data-key="5"] .tweet-body', body => {
        const rect = el => body.querySelector(el).getBoundingClientRect();
        const square = rect(":scope > .js-media"), card = rect(":scope > .otd-ticker-card"), text = rect(":scope > .js-tweet-text");
        return { thumb: body.classList.contains("otd-has-thumb"), under: card.top >= square.bottom, left: card.left - text.left, right: Math.round(body.getBoundingClientRect().right - card.right) };
    });
    expect(place).toEqual({ thumb: true, under: true, left: 0, right: 0 });
});
