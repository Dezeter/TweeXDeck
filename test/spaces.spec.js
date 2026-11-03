// The Spaces column (spaces.js): the live Spaces of the people the user follows from X's fleetline, the ones to
// come from what they tweeted (TweetDeck's search, through interception.js), each one's details from
// AudioSpaceById; what the people the user follows do in each, hosting, speaking or listening; X asked again on its
// own, not while the page is hidden; its column's requests for tweets answered empty without asking X.
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", timezoneId: "Europe/Moscow", viewport: { width: 700, height: 900 } });

const CORS = { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" };
// 15:00 in Moscow
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const MINUTE = 60 * 1000;
const HOME = '<html><head><script src="https://abs.twimg.com/responsive-web/client-web/main.abc123.js"></script></head><body><script>window.__INITIAL_STATE__={"featureSwitch":{"defaultConfig":{"f_a":{"value":true}}}};</script></body></html>';
const MAIN = 'e.exports={queryId:"Space_1",operationName:"AudioSpaceById",operationType:"query",metadata:{featureSwitches:["f_a"],fieldToggles:[]}}';

// people: Alice's id bigger than a JavaScript number keeps, as most are now
const ALICE = "1600000000000000001";
const person = (id, name) => ({ periscope_user_id: `p${id}`, display_name: name, twitter_screen_name: name.toLowerCase(), avatar_url: `https://pbs.twimg.com/profile_images/${id}/a_normal.jpg`, user_results: { rest_id: id, result: { __typename: "User" } } });
const host = (id, name) => ({ result: { __typename: "User", rest_id: id, core: { name, screen_name: name.toLowerCase() }, avatar: { image_url: `https://pbs.twimg.com/profile_images/${id}/h_normal.jpg` } } });
const audioSpace = ({ id, state, title = "", creator, started, scheduled, listening = 0, admins = [], speakers = [], listeners = [] }) => ({ data: { audioSpace: {
    metadata: { rest_id: id, state, title, media_key: `28_${id}`, started_at: started, scheduled_start: scheduled, total_live_listeners: listening, creator_results: creator },
    participants: { total: admins.length + speakers.length + listeners.length, admins, speakers, listeners },
} } });
const SPACES = {
    // live, hosted by someone the user doesn't follow, Alice speaking and Bob listening; its title isn't markup
    "1LiveAAAAAAAA": audioSpace({ id: "1LiveAAAAAAAA", state: "Running", title: "Утренний <b>эфир</b>", creator: host("50", "Hana"), started: NOW - 25 * MINUTE, listening: 1234,
        admins: [person("50", "Hana")], speakers: [person(ALICE, "Alice"), person("60", "Gus")], listeners: [person("22", "Bob")] }),
    // live, hosted by Carl, whom the user follows; no title
    "1LiveBBBBBBBB": audioSpace({ id: "1LiveBBBBBBBB", state: "Running", creator: host("33", "Carl"), started: NOW - 70 * MINUTE, listening: 5, admins: [person("33", "Carl")] }),
    "1EndedCCCCCCC": audioSpace({ id: "1EndedCCCCCCC", state: "Ended", title: "Вчера", creator: host("44", "Dina"), started: NOW - 600 * MINUTE }),
    // scheduled today at 17:00 and tomorrow at 10:00
    "1SoonDDDDDDDD": audioSpace({ id: "1SoonDDDDDDDD", state: "NotStarted", title: "Вечерний разбор", creator: host("70", "Eve"), scheduled: NOW + 120 * MINUTE }),
    "1NextEEEEEEEE": audioSpace({ id: "1NextEEEEEEEE", state: "NotStarted", title: "Завтрашний", creator: host("71", "Finn"), scheduled: Date.UTC(2026, 10, 4, 7, 0, 0) }),
    "1OldFFFFFFFFF": audioSpace({ id: "1OldFFFFFFFFF", state: "Ended", title: "Давно", creator: host("72", "Gil"), started: NOW - 3000 * MINUTE }),
    // X has nothing of this one
    "1GoneGGGGGGGG": { data: {} },
};
// X's fleetline as text: Alice's id a bare number bigger than a JavaScript number keeps
const FLEETLINE = `{"threads":[],"hydrated_threads":[
    {"thread_id":"t1","user_id":${ALICE},"live_content":{"audiospace":{"broadcast_id":"1LiveAAAAAAAA"}}},
    {"thread_id":"t2","user_id_str":"22","live_content":{"audiospace":{"broadcast_id":"1LiveAAAAAAAA"}}},
    {"thread_id":"t3","user_id":33,"live_content":{"audiospace":{"broadcast_id":"1LiveBBBBBBBB"}}},
    {"thread_id":"t4","user_id":44,"live_content":{"audiospace":{"broadcast_id":"1EndedCCCCCCC"}}}
],"refresh_delay_secs":30}`;
// what the people the user follows tweeted with Spaces' links, as X's SearchTimeline answers
const tweet = (id, author, url) => ({ entryId: `tweet-${id}`, content: { itemContent: { tweet_results: { result: {
    __typename: "Tweet", rest_id: String(id),
    core: { user_results: { result: { __typename: "User", rest_id: author, core: { name: "a", screen_name: "a", created_at: "Wed May 03 18:30:51 +0000 2023" }, legacy: {} } } },
    legacy: { id_str: String(id), full_text: `Заходите ${url}`, created_at: new Date(NOW - id * MINUTE).toUTCString(), user_id_str: author, conversation_id_str: String(id),
        entities: { hashtags: [], symbols: [], user_mentions: [], urls: [{ url: "https://t.co/x", expanded_url: url, display_url: url.replace("https://", "") }] } },
} } } } });
const SEARCH = { data: { search_by_raw_query: { search_timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries: [
    tweet(1, "70", "https://x.com/i/spaces/1SoonDDDDDDDD"),
    tweet(2, "71", "https://twitter.com/i/spaces/1NextEEEEEEEE/peek"),
    tweet(3, ALICE, "https://x.com/i/spaces/1LiveAAAAAAAA"),
    tweet(4, "72", "https://x.com/i/spaces/1OldFFFFFFFFF"),
    tweet(5, "73", "https://x.com/i/spaces/1GoneGGGGGGGG"),
] }] } } } } };

// TweetDeck with a Spaces column for the account `user` (the logged in one is 1), interception.js and spaces.js on
// a stubbed X; `answer` is X's: by what's asked, [status, body]. What was asked: path, the variables or the query,
// the features, and whether as another account.
async function open(page, { user = "1", main = MAIN, answer = {}, clock = "fixed" } = {}) {
    if(clock === "fixed") await page.clock.setFixedTime(NOW);
    else await page.clock.install({ time: NOW });
    const asked = [];
    const answers = { fleetline: () => [200, FLEETLINE], search: () => [200, SEARCH], space: id => [200, SPACES[id] ?? { data: {} }], ...answer };
    const reply = (route, [status, body]) => route.fulfill({ status, contentType: "application/json", headers: CORS, body: typeof body === "string" ? body : JSON.stringify(body) });
    await openPage(page, { storage: { device_id: "device-1" }, routes: {
        "https://otd.test/": route => {
            const request = route.request(), url = new URL(request.url()), actAs = request.headers()["x-act-as-user-id"] || null;
            if(url.pathname === "/i/api/fleets/v1/fleetline") {
                asked.push({ path: url.pathname, query: url.search, actAs });
                return reply(route, answers.fleetline());
            }
            if(url.pathname.startsWith("/i/api/graphql/")) {
                const variables = JSON.parse(url.searchParams.get("variables")), features = JSON.parse(url.searchParams.get("features"));
                asked.push({ path: url.pathname, variables, features, actAs });
                return reply(route, url.pathname.endsWith("/SearchTimeline") ? answers.search() : answers.space(variables.id));
            }
            asked.push({ path: url.pathname });
            return route.fulfill({ contentType: "text/html", headers: CORS, body: HOME });
        },
        "https://abs.twimg.com/": route => {
            asked.push({ path: new URL(route.request().url()).pathname });
            return route.fulfill({ contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: main });
        },
    } });
    await page.evaluate(() => {
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        window.__told = [];
        document.addEventListener("otd-diagnostic", e => {
            const entry = JSON.parse(e.detail);
            if(entry.kind === "spaces") window.__told.push(entry);
        });
    });
    await addScripts(page, "src/interception.js");
    await addTweetDeck(page, { css: true });
    await addScripts(page, "src/otd-common.js", "src/theme.js");
    await page.evaluate(user => {
        const accounts = TD.storage.accountController;
        accounts.getAll = () => [{ state: { username: "me", userId: "1" } }];
        accounts.getUserIdentifier = () => "me";
        accounts.get = key => ({ getUserID: () => String(key).split(":")[1] });
        const feed = { getMetadata: () => ({ otdTimeline: "spaces" }), getAccountKey: () => `twitter:${user}` };
        const home = { getMetadata: () => ({}), getAccountKey: () => "twitter:1" };
        TD.controller.columnManager.get = key => key === "s1" ? { getFeeds: () => [feed] } : key === "h1" ? { getFeeds: () => [home] } : null;
        const column = key => `<section class="js-column column" data-column="${key}" style="height:850px; width:350px; display:inline-block; vertical-align:top">
            <div class="js-column-scroller column-scroller scroll-v" style="height:850px"><div class="js-chirp-container chirp-container"><div class="js-column-loading-placeholder">Loading…</div></div></div></section>`;
        document.body.insertAdjacentHTML("beforeend", `<div class="js-app">${column("s1")}${column("h1")}</div>`);
    }, user);
    await addScripts(page, "src/spaces.js");
    return asked;
}
const flat = text => text.replace(/\s+/g, " ").trim();
// what the column shows: its headings, its cards, its message
const shown = page => page.evaluate(() => {
    const box = document.querySelector('[data-column="s1"] .otd-spaces');
    // its parts, one space between
    const text = el => el ? [...el.childNodes].map(node => node.textContent.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ") : null;
    return box && {
        headings: [...box.querySelectorAll(".otd-spaces-heading")].map(text),
        cards: [...box.querySelectorAll(".otd-space")].map(card => ({
            id: card.dataset.spaceId,
            top: text(card.querySelector(".otd-space-top")),
            title: text(card.querySelector(".otd-space-title")),
            host: text(card.querySelector(".otd-space-host")),
            faces: card.querySelectorAll(".otd-space-faces > img").length,
            people: text(card.querySelector(".otd-space-people")),
            yours: text(card.querySelector(".otd-space-yours")),
            button: text(card.querySelector(".otd-space-listen")),
            href: card.querySelector(".otd-space-listen").href,
        })),
        message: [...box.querySelectorAll(".otd-spaces-state > *")].map(text),
        checked: text(box.querySelector(".otd-spaces-checked")),
    };
});
const cards = async page => (await shown(page))?.cards.length ?? 0;

test("live ones first, the ones the people you follow host first, then the ones to come; ended and gone ones left out", async ({ page }) => {
    const asked = await open(page);
    await expect.poll(() => cards(page)).toBe(4);
    const column = await shown(page);
    expect(column.headings).toEqual(["В эфире · 2", "Запланированы · 2"]);
    expect(column.cards).toEqual([
        { id: "1LiveBBBBBBBB", top: "В эфире идёт 1 ч 10 мин", title: "Спейс · Carl", host: "Carl @carl", faces: 0, people: "5 слушателей", yours: null, button: "Слушать", href: "https://x.com/i/spaces/1LiveBBBBBBBB" },
        { id: "1LiveAAAAAAAA", top: "В эфире идёт 25 мин", title: "Утренний <b>эфир</b>", host: "Hana @hana", faces: 2, people: "1 234 слушателя", yours: "Из ваших подписок: Alice выступает · Bob слушает", button: "Слушать", href: "https://x.com/i/spaces/1LiveAAAAAAAA" },
        { id: "1SoonDDDDDDDD", top: "Запланирован начнётся сегодня в 17:00", title: "Вечерний разбор", host: "Eve @eve", faces: 0, people: null, yours: null, button: "Открыть на x.com", href: "https://x.com/i/spaces/1SoonDDDDDDDD" },
        { id: "1NextEEEEEEEE", top: "Запланирован начнётся завтра в 10:00", title: "Завтрашний", host: "Finn @finn", faces: 0, people: null, yours: null, button: "Открыть на x.com", href: "https://x.com/i/spaces/1NextEEEEEEEE" },
    ]);
    expect(column.checked).toBe("Проверено в 15:00 · Обновить");
    // a title is text, not markup
    expect(await page.locator('[data-column="s1"] .otd-space b').count()).toBe(0);
    // TweetDeck's own in it hidden, the other column as it was
    expect(await page.evaluate(() => ["s1", "h1"].map(key => getComputedStyle(document.querySelector(`[data-column="${key}"] .js-chirp-container`)).display))).toEqual(["none", "block"]);
    expect(await page.locator('[data-column="h1"] .otd-spaces').count()).toBe(0);

    // X asked: its fleetline, its search for what the people the user follows tweeted with Spaces, each Space once
    // by main.js's id and features, as the logged in account
    expect(asked.find(a => a.path === "/i/api/fleets/v1/fleetline")).toEqual({ path: "/i/api/fleets/v1/fleetline", query: "?only_spaces=true", actAs: null });
    const search = asked.filter(a => a.path.endsWith("/SearchTimeline"));
    expect(search).toHaveLength(1);
    expect(search[0].variables).toMatchObject({ rawQuery: "filter:follows filter:spaces", product: "Latest" });
    const spaces = asked.filter(a => a.path.endsWith("/AudioSpaceById"));
    expect(spaces.map(a => a.variables.id).sort()).toEqual(Object.keys(SPACES).sort());
    expect(new Set(spaces.map(a => a.path))).toEqual(new Set(["/i/api/graphql/Space_1/AudioSpaceById"]));
    expect(spaces[0]).toMatchObject({ variables: { isMetatagsQuery: false, withReplays: true, withListeners: true }, features: { f_a: true }, actAs: null });
    // for the load watchdog
    expect(await page.evaluate(() => window.__told)).toEqual([{ kind: "spaces", fleetline: "ok", search: "ok", details: "7 fine, 0 failed", live: 2, coming: 2 }]);
});

test("a column for another of the user's accounts asks as that account", async ({ page }) => {
    const asked = await open(page, { user: "7" });
    await expect.poll(() => cards(page)).toBe(4);
    const toX = asked.filter(a => a.path.startsWith("/i/api/"));
    expect(toX.length).toBeGreaterThan(2);
    expect(new Set(toX.map(a => a.actAs))).toEqual(new Set(["7"]));
});

test("nothing live and nothing to come: says so; X answering neither: says that, and tries again", async ({ page }) => {
    let down = true;
    await open(page, { answer: {
        fleetline: () => down ? [500, ""] : [200, '{"threads":[],"hydrated_threads":[]}'],
        search: () => down ? [500, ""] : [200, { data: { search_by_raw_query: { search_timeline: { timeline: { instructions: [] } } } } }],
    } });
    await expect.poll(async () => (await shown(page))?.message).toEqual(["X не ответил", "Не удалось получить спейсы (HTTP 500). Колонка попробует снова через минуту.", "Повторить"]);
    down = false;
    await page.click('[data-column="s1"] .otd-column-state-action');
    await expect.poll(async () => (await shown(page))?.message).toEqual(["Сейчас никто не в эфире", "Здесь появятся спейсы ваших подписок — идущие и запланированные. Колонка проверяет X раз в минуту, пока вкладка открыта."]);
});

test("the fleetline failing: what the search found still shows, live ones too", async ({ page }) => {
    await open(page, { answer: { fleetline: () => [503, ""] } });
    await expect.poll(() => cards(page)).toBe(3);
    expect((await shown(page)).cards.map(card => card.id)).toEqual(["1LiveAAAAAAAA", "1SoonDDDDDDDD", "1NextEEEEEEEE"]);
    // who's in it unknown without the fleetline
    expect((await shown(page)).cards[0].yours).toBeNull();
    expect(await page.evaluate(() => window.__told.at(-1))).toMatchObject({ fleetline: "HTTP 503", search: "ok" });
});

test("AudioSpaceById not in x.com's main.js: the id x.com had; main.js not asked again for an hour", async ({ page }) => {
    const asked = await open(page, { main: "e.exports={}", clock: "install" });
    await expect.poll(async () => {
        await page.clock.runFor(200);
        return cards(page);
    }).toBe(4);
    const spaces = asked.filter(a => a.path.endsWith("/AudioSpaceById"));
    expect(new Set(spaces.map(a => a.path))).toEqual(new Set(["/i/api/graphql/bpQedjCUnMgs3yXNi8fZlA/AudioSpaceById"]));
    expect(spaces[0].features).toMatchObject({ spaces_2022_h2_clipping: true, longform_notetweets_consumption_enabled: true });
    const mains = () => asked.filter(a => a.path.startsWith("/responsive-web/")).length;
    const before = mains();
    // live ones are asked again two minutes later
    await page.clock.runFor(3 * MINUTE);
    await expect.poll(() => asked.filter(a => a.path.endsWith("/AudioSpaceById")).length).toBeGreaterThan(spaces.length);
    expect(mains()).toBe(before);
});

test("asked again on its own: live ones every minute, the search every five; ended ones not again; nothing while the page is hidden", async ({ page }) => {
    const asked = await open(page, { clock: "install" });
    const count = path => asked.filter(a => a.path.endsWith(path)).length;
    const details = id => asked.filter(a => a.variables?.id === id).length;
    const run = async ms => {
        for(let left = ms; left > 0; left -= 10000) {
            await page.clock.runFor(Math.min(10000, left));
            // X's answers come in real time
            await page.waitForTimeout(50);
        }
    };
    await expect.poll(async () => {
        await page.clock.runFor(200);
        return cards(page);
    }).toBe(4);
    expect([count("/fleetline"), count("/SearchTimeline")]).toEqual([1, 1]);
    // a tick every 10 s: the first one a minute after the answer
    await run(MINUTE + 10000);
    await expect.poll(() => count("/fleetline")).toBe(2);
    expect(count("/SearchTimeline")).toBe(1);
    await run(4 * MINUTE + 10000);
    await expect.poll(() => count("/SearchTimeline")).toBe(2);
    // live ones every two minutes, the scheduled ones every ten, the ended and gone ones once, unless the fleetline
    // has them
    await expect.poll(() => details("1LiveAAAAAAAA")).toBeGreaterThanOrEqual(3);
    expect([details("1SoonDDDDDDDD"), details("1OldFFFFFFFFF"), details("1GoneGGGGGGGG")]).toEqual([1, 1, 1]);

    await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    const before = asked.length;
    await run(6 * MINUTE);
    expect(asked.length).toBe(before);
});

test("the Spaces column's requests for tweets are answered empty, X not asked", async ({ page }) => {
    const asked = await open(page);
    await expect.poll(() => cards(page)).toBe(4);
    const before = asked.length;
    expect(await page.evaluate(() => new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "https://api.x.com/1.1/statuses/home_timeline.json?user_id=1&count=40&otd_timeline=spaces");
        xhr.setRequestHeader("x-act-as-user-id", "1");
        xhr.onload = () => resolve([xhr.status, xhr.responseText]);
        xhr.send();
    }))).toEqual([200, "[]"]);
    expect(asked.length).toBe(before);
});

test("the column in the light theme, the dark one and Lights out: cards on the column's own shade, text readable", async ({ page }) => {
    await open(page);
    await expect.poll(() => cards(page)).toBe(4);
    for(const theme of ["light", "dark", "lights-out"]) {
        await page.evaluate(theme => {
            document.documentElement.classList.toggle("dark", theme !== "light");
            document.documentElement.classList.toggle("otd-lights-out", theme === "lights-out");
        }, theme);
        const look = await page.evaluate(() => {
            const card = document.querySelector('[data-column="s1"] .otd-space');
            const style = el => getComputedStyle(el);
            return {
                card: style(card).backgroundColor,
                title: style(card.querySelector(".otd-space-title")).color,
                badge: style(card.querySelector(".otd-space-badge")).color,
                button: style(card.querySelector(".otd-space-listen")).backgroundColor,
            };
        });
        expect(look.card, theme).not.toBe("rgba(0, 0, 0, 0)");
        expect(look.title, theme).toBe(theme === "light" ? "rgb(27, 28, 31)" : theme === "dark" ? "rgb(230, 231, 233)" : "rgb(231, 233, 234)");
        expect(look.badge, theme).toBe(theme === "light" ? "rgb(208, 48, 79)" : "rgb(255, 107, 129)");
        expect(look.button, theme).toBe("rgb(68, 102, 238)");
    }
});
