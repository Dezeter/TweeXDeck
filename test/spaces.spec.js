// The Spaces column (spaces.js): the live Spaces of the people the user follows from X's fleetline, the ones to
// come from what they tweeted (TweetDeck's search, through interception.js), each one's details from
// AudioSpaceById; what the people the user follows do in each, hosting, speaking or listening; X asked again on its
// own, not while the page is hidden; its column's requests for tweets answered empty without asking X.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { ROOT, openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", timezoneId: "Europe/Moscow", viewport: { width: 700, height: 900 } });

const CORS = { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" };
// 15:00 in Moscow
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const MINUTE = 60 * 1000;
const HOME = '<html><head><script src="https://abs.twimg.com/responsive-web/client-web/main.abc123.js"></script></head><body><script>window.__INITIAL_STATE__={"featureSwitch":{"defaultConfig":{"f_a":{"value":true}}}};</script></body></html>';
const MAIN = 'e.exports={queryId:"Space_1",operationName:"AudioSpaceById",operationType:"query",metadata:{featureSwitches:["f_a"],fieldToggles:[]}}';

// people: Alice's id bigger than a JavaScript number keeps, as most are now
const ALICE = "1600000000000000001";
// a Space's audio as HLS: 40 s of a tone in MP3, in segments of 2 s, one after another without a break (Firefox
// doesn't take MP3 again after a discontinuity), without LAME's bit reservoir: every frame decodes on its own, as
// Firefox needs where playing starts in the middle, at a live stream's edge (X's AAC has no such reservoir)
const FIXTURES = path.join(__dirname, "fixtures", "space");
const SEGMENTS = [...fs.readFileSync(path.join(FIXTURES, "playlist.m3u8"), "utf8").matchAll(/#EXTINF:([\d.]+),\n(s\d+\.ts)/g)].map(m => [m[2], m[1]]);
const playlist = (count, end) => `${["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:2", "#EXT-X-MEDIA-SEQUENCE:0",
    ...SEGMENTS.slice(0, count).flatMap(([file, duration]) => [`#EXTINF:${duration},`, file]), ...end ? ["#EXT-X-ENDLIST"] : []].join("\n")}\n`;
// a live Space's playlist: a segment more every 2 s from its first request, as X's is until the Space ends
function live() {
    let start = 0;
    return () => {
        start ||= Date.now();
        return playlist(Math.min(SEGMENTS.length, 3 + Math.floor((Date.now() - start) / 2000)), false);
    };
}
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
    const answers = { fleetline: () => [200, FLEETLINE], search: () => [200, SEARCH], space: id => [200, SPACES[id] ?? { data: {} }],
        stream: key => [200, { source: { location: `https://stream.test/${key}/playlist.m3u8?type=live`, status: "LIVE_PUBLIC", streamType: "HLS" }, chatToken: "chat-1" }],
        chat: () => [200, { access_token: "access-1", endpoint: "https://chat.test", room_id: "room-1", replay_endpoint: "https://chat.test" }],
        // the Space's audio: a live one's playlist, a segment more every 2 s, as X's is until the Space ends
        playlist: live(), ...answer };
    const reply = (route, [status, body]) => route.fulfill({ status, contentType: "application/json", headers: CORS, body: typeof body === "string" ? body : JSON.stringify(body) });
    // the chat's WebSocket, before the page opens as Playwright has it: what the page sent it, and a way to send
    // the page what X's chat would
    asked.chat = { sent: [], socket: null };
    await page.routeWebSocket("wss://chat.test/chatapi/v1/chatnow", ws => {
        asked.chat.socket = ws;
        ws.onMessage(message => asked.chat.sent.push(JSON.parse(message)));
    });
    await openPage(page, { storage: { device_id: "device-1" }, routes: {
        "https://otd.test/": route => {
            const request = route.request(), url = new URL(request.url()), actAs = request.headers()["x-act-as-user-id"] || null;
            if(url.pathname.startsWith("/i/api/1.1/live_video_stream/status/")) {
                asked.push({ path: url.pathname, query: url.search, actAs });
                return reply(route, answers.stream(decodeURIComponent(url.pathname.split("/").pop())));
            }
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
        // the extension's own files
        "http://otd.test/ext/": route => {
            const file = new URL(route.request().url()).pathname.replace("/ext/", "");
            asked.push({ path: `/ext/${file}` });
            return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(ROOT, file)) });
        },
        "https://stream.test/": route => {
            const name = new URL(route.request().url()).pathname.split("/").pop();
            asked.push({ path: `/stream/${name}` });
            const headers = { "access-control-allow-origin": "*" };
            if(name.endsWith(".m3u8")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", headers, body: answers.playlist() });
            return route.fulfill({ contentType: "video/mp2t", headers, body: fs.readFileSync(path.join(FIXTURES, name)) });
        },
        // the Space's chat: its address and token for the stream's chat token
        "https://proxsee.pscp.tv/": route => {
            const request = route.request();
            asked.push({ path: `/pscp${new URL(request.url()).pathname}`, body: request.postDataJSON() });
            return reply(route, answers.chat());
        },
        "https://abs.twimg.com/": route => {
            asked.push({ path: new URL(route.request().url()).pathname });
            return route.fulfill({ contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: main });
        },
    } });
    await page.evaluate(() => {
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        window.__told = [];
        document.documentElement.dataset.otdBase = "http://otd.test/ext/";
        // the audio elements played, and what they went through
        window.__events = [];
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function() {
            window.__audio = this;
            if(!this.__watched) {
                this.__watched = true;
                for(const name of ["loadedmetadata", "canplay", "playing", "waiting", "stalled", "pause", "seeking", "seeked", "ended", "error", "emptied"]) {
                    this.addEventListener(name, () => window.__events.push(`${name}@${this.currentTime.toFixed(2)}`));
                }
            }
            return play.call(this).catch(e => {
                window.__events.push(`play rejected: ${e.name}`);
                throw e;
            });
        };
        window.addEventListener("error", e => window.__events.push(`error: ${e.message}`));
        document.addEventListener("otd-diagnostic", e => {
            const entry = JSON.parse(e.detail);
            if(entry.kind === "spaces" || entry.kind === "spaces-player") window.__told.push(entry);
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
            href: card.querySelector(".otd-space-title").href,
            // a live one's plays here, a scheduled one's is a link to x.com
            plays: card.querySelector(".otd-space-listen").tagName === "BUTTON",
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
        { id: "1LiveBBBBBBBB", top: "В эфире идёт 1 ч 10 мин", title: "Спейс · Carl", host: "Carl @carl", faces: 0, people: "5 слушателей", yours: null, button: "Слушать", href: "https://x.com/i/spaces/1LiveBBBBBBBB", plays: true },
        { id: "1LiveAAAAAAAA", top: "В эфире идёт 25 мин", title: "Утренний <b>эфир</b>", host: "Hana @hana", faces: 2, people: "1 234 слушателя", yours: "Из ваших подписок: Alice выступает · Bob слушает", button: "Слушать", href: "https://x.com/i/spaces/1LiveAAAAAAAA", plays: true },
        { id: "1SoonDDDDDDDD", top: "Запланирован начнётся сегодня в 17:00", title: "Вечерний разбор", host: "Eve @eve", faces: 0, people: null, yours: null, button: "Открыть на x.com", href: "https://x.com/i/spaces/1SoonDDDDDDDD", plays: false },
        { id: "1NextEEEEEEEE", top: "Запланирован начнётся завтра в 10:00", title: "Завтрашний", host: "Finn @finn", faces: 0, people: null, yours: null, button: "Открыть на x.com", href: "https://x.com/i/spaces/1NextEEEEEEEE", plays: false },
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

// --- listening ---------------------------------------------------------------------------------------------------
const playerShown = page => page.evaluate(() => {
    const box = document.querySelector(".otd-space-player");
    return box && {
        column: box.closest("[data-column]")?.dataset.column,
        title: box.querySelector(".otd-space-player-title").textContent,
        state: box.querySelector(".otd-space-player-state").textContent,
        toggle: box.querySelector(".otd-space-player-toggle").hidden ? null : box.querySelector(".otd-space-player-toggle").getAttribute("aria-label"),
        open: box.querySelector(".otd-space-player-open").href,
    };
});
// the audio played, at least `seconds` in; if not, what the player and the browser said of it, to tell why
async function plays(page, seconds) {
    try {
        await expect.poll(async () => (await audio(page))?.time ?? 0, { timeout: 15000 }).toBeGreaterThan(seconds);
    } catch(e) {
        const said = await page.evaluate(() => {
            const a = window.__audio, ranges = r => r ? [...Array(r.length).keys()].map(i => `${r.start(i).toFixed(2)}-${r.end(i).toFixed(2)}`).join(" ") : "";
            return {
                state: document.querySelector(".otd-space-player-state")?.textContent,
                told: window.__told.filter(t => t.kind === "spaces-player").map(t => `${t.state}${t.error ? ` (${t.error})` : ""}`).join(", "),
                audio: a && { time: a.currentTime, paused: a.paused, readyState: a.readyState, networkState: a.networkState, error: a.error && `${a.error.code} ${a.error.message}`, buffered: ranges(a.buffered), seekable: ranges(a.seekable), duration: a.duration },
                hls: typeof Hls === "function" ? Hls.version : null,
                events: window.__events?.slice(-30),
            };
        });
        throw new Error(`${e.message}\nthe player: ${JSON.stringify(said, null, 1)}`);
    }
}
const listenButton = (page, id) => page.locator(`[data-column="s1"] .otd-space[data-space-id="${id}"] .otd-space-listen`);
const audio = page => page.evaluate(() => window.__audio && { time: window.__audio.currentTime, paused: window.__audio.paused, volume: window.__audio.volume, src: !!window.__audio.getAttribute("src") || !!window.__audio.srcObject || window.__audio.currentSrc !== "" });

test("Listen plays a live Space right in TweetDeck: its stream from live_video_stream, hls.js, a player on top of the column", async ({ page }) => {
    const asked = await open(page);
    await expect.poll(() => cards(page)).toBe(4);
    // the scheduled ones still open on x.com
    expect(await page.locator('[data-column="s1"] .is-coming a.otd-space-listen').count()).toBe(2);
    await listenButton(page, "1LiveAAAAAAAA").click();
    await plays(page, 0.5);
    expect(await playerShown(page)).toEqual({ column: "s1", title: "Утренний <b>эфир</b>", state: "В эфире · Hana", toggle: "Пауза", open: "https://x.com/i/spaces/1LiveAAAAAAAA" });
    expect(await page.locator(".otd-space-player b").count()).toBe(0);
    // asked for its stream by its media key, as x.com asks; hls.js loaded from the extension once, the stream's playlist and segments
    expect(asked.filter(a => a.path.startsWith("/i/api/1.1/live_video_stream/"))).toEqual([{ path: "/i/api/1.1/live_video_stream/status/28_1LiveAAAAAAAA", query: "?client=web&use_syndication_guest_id=false&cookie_set_host=otd.test", actAs: null }]);
    expect(asked.filter(a => a.path.startsWith("/ext/")).map(a => a.path)).toEqual(["/ext/files/hls/hls.light.min.js"]);
    expect(asked.some(a => a.path === "/stream/s0.ts")).toBe(true);
    // its card's button pauses it
    await expect(listenButton(page, "1LiveAAAAAAAA")).toHaveText("Пауза");
    await listenButton(page, "1LiveAAAAAAAA").click();
    await expect.poll(async () => (await playerShown(page)).state).toBe("На паузе");
    expect((await audio(page)).paused).toBe(true);
    await expect(listenButton(page, "1LiveAAAAAAAA")).toHaveText("Слушать");
    // the player's ▶ goes on
    await page.click(".otd-space-player-toggle");
    await expect.poll(async () => (await audio(page)).paused).toBe(false);

    // the volume, kept for the next time
    await page.locator(".otd-space-player-volume").fill("0.3");
    expect([(await audio(page)).volume, await page.evaluate(() => localStorage.OTDspacesVolume)]).toEqual([0.3, "0.3"]);

    // another one: the first one let go of
    await listenButton(page, "1LiveBBBBBBBB").click();
    await expect.poll(async () => (await playerShown(page))?.title).toBe("Спейс · Carl");
    await plays(page, 0.5);
    expect((await audio(page)).volume).toBe(0.3);
    await expect(listenButton(page, "1LiveAAAAAAAA")).toHaveText("Слушать");
    expect(await page.locator(".otd-space-player").count()).toBe(1);

    // closed: the music stops, the player's gone
    const played = await page.evaluateHandle(() => window.__audio);
    await page.click(".otd-space-player-close");
    expect(await playerShown(page)).toBeNull();
    expect(await played.evaluate(a => a.paused)).toBe(true);
    expect(await page.evaluate(() => window.__told.filter(e => e.kind === "spaces-player").map(e => e.state).at(-1))).toBe("stopped");
});

test("a Space whose stream ends: the player says it has ended", async ({ page }) => {
    // 6 s of it, and its end
    await open(page, { answer: { playlist: () => playlist(3, true) } });
    await expect.poll(() => cards(page)).toBe(4);
    await listenButton(page, "1LiveAAAAAAAA").click();
    await expect.poll(async () => (await playerShown(page))?.state, { timeout: 20000 }).toBe("Спейс закончился");
    expect((await playerShown(page)).toggle).toBeNull();
});

test("X not giving a Space's stream: the player says it couldn't connect, and tries again", async ({ page }) => {
    let refused = true;
    await open(page, { answer: { stream: key => refused ? [404, ""] : [200, { source: { location: `https://stream.test/${key}/playlist.m3u8`, status: "LIVE_PUBLIC" } }] } });
    await expect.poll(() => cards(page)).toBe(4);
    await listenButton(page, "1LiveAAAAAAAA").click();
    await expect.poll(async () => (await playerShown(page))?.state).toBe("Не удалось подключиться (HTTP 404)");
    expect((await playerShown(page)).toggle).toBe("Ещё раз");
    refused = false;
    await page.click(".otd-space-player-toggle");
    await plays(page, 0.5);
    expect((await playerShown(page)).state).toBe("В эфире · Hana");
});

test("hls.js goes on the page as a global even where the page has an AMD loader", async ({ page }) => {
    await open(page);
    await expect.poll(() => cards(page)).toBe(4);
    await page.evaluate(() => {
        window.define = () => { window.__defined = true; };
        window.define.amd = {};
    });
    await listenButton(page, "1LiveAAAAAAAA").click();
    await plays(page, 0.5);
    expect(await page.evaluate(() => [typeof window.Hls, !!window.__defined, typeof window.define])).toEqual(["function", false, "function"]);
});

// a message of the Space's chat as X's sends it: JSON in JSON in JSON
const chatMessage = (kind, body, sender) => JSON.stringify({ kind, payload: JSON.stringify({ room: "room-1", body: JSON.stringify(body), sender }), signature: "sig" });
const caption = (username, text, final = false) => chatMessage(1, { body: text, final, username, type: 45, timestamp: 1 }, { username, display_name: username });
const stageShown = page => page.evaluate(() => [...document.querySelectorAll(".otd-space-player-face")].map(face => `${face.title}${face.classList.contains("is-speaking") ? " *" : ""}`));
const captionLines = page => page.evaluate(() => [...document.querySelectorAll(".otd-space-player-caption:not([hidden]) > .otd-space-player-line")].map(line => line.textContent));
const captionShown = page => page.evaluate(() => {
    const box = document.querySelector(".otd-space-player-caption");
    return box && !box.hidden ? box.textContent : null;
});

test("the player shows who's on stage, and from the Space's chat who speaks and what they say", async ({ page }) => {
    const asked = await open(page);
    await expect.poll(() => cards(page)).toBe(4);
    await listenButton(page, "1LiveAAAAAAAA").click();
    await plays(page, 0.2);
    // the host, the co-hosts and the speakers, as AudioSpaceById has them
    expect(await stageShown(page)).toEqual(["Hana @hana", "Alice @alice", "Gus @gus"]);

    // the chat asked for as x.com's listeners do: its address for the stream's chat token, then told its token and room
    await expect.poll(() => asked.chat.sent.length).toBe(2);
    expect(asked.find(a => a.path.startsWith("/pscp/"))).toEqual({ path: "/pscp/api/v2/accessChatPublic", body: { chat_token: "chat-1" } });
    expect(asked.chat.sent.map(m => [m.kind, JSON.parse(m.payload)])).toEqual([
        [3, { access_token: "access-1" }],
        [2, { body: JSON.stringify({ room: "room-1" }), kind: 1 }],
    ]);
    // no button for captions before there are any
    expect(await page.locator(".otd-space-player-cc").isHidden()).toBe(true);

    // Alice speaks: her face marked, her words under it as they come, the caption's text as text
    asked.chat.socket.send(caption("alice", "Всем привет"));
    await expect.poll(() => stageShown(page)).toEqual(["Hana @hana", "Alice @alice *", "Gus @gus"]);
    expect((await playerShown(page)).state).toBe("Говорит Alice");
    expect(await captionShown(page)).toBe("Alice: Всем привет");
    asked.chat.socket.send(caption("alice", "Всем привет, сегодня <b>о главном</b>", true));
    await expect.poll(() => captionShown(page)).toBe("Alice: Всем привет, сегодня <b>о главном</b>");
    // the speaker's name in bold, what they say as text
    expect(await page.locator(".otd-space-player-caption b").allTextContents()).toEqual(["Alice:"]);
    // someone not on stage by AudioSpaceById's last answer: by the chat's name
    asked.chat.socket.send(caption("newcomer", "Можно вопрос?"));
    await expect.poll(() => playerShown(page).then(p => p.state)).toBe("Говорит newcomer");
    expect(await stageShown(page)).toEqual(["Hana @hana", "Alice @alice", "Gus @gus"]);

    // across the column, edge to edge, what was said before over the last one; kept
    await page.click(".otd-space-player-wide");
    await expect.poll(() => captionLines(page)).toEqual(["Alice: Всем привет, сегодня <b>о главном</b>", "newcomer: Можно вопрос?"]);
    expect(await page.evaluate(() => {
        const box = document.querySelector(".otd-space-player").getBoundingClientRect(), lines = document.querySelector(".otd-space-player-caption").getBoundingClientRect();
        return [Math.round(lines.left - box.left), Math.round(box.right - lines.right)];
    })).toEqual([0, 0]);
    expect(await page.evaluate(() => localStorage.OTDspacesCaptionsWide)).toBe("1");
    expect(await page.locator(".otd-space-player-wide").getAttribute("aria-pressed")).toBe("true");
    // a click on them folds them back: the last one under the faces
    await page.click(".otd-space-player-caption");
    await expect.poll(() => captionLines(page)).toEqual(["newcomer: Можно вопрос?"]);
    expect(await page.evaluate(() => localStorage.OTDspacesCaptionsWide)).toBeUndefined();

    // a while after the last caption no one speaks, the caption goes later
    await expect.poll(() => playerShown(page).then(p => p.state), { timeout: 6000 }).toBe("В эфире · Hana");
    expect(await captionShown(page)).toBe("newcomer: Можно вопрос?");
    await expect.poll(() => captionShown(page), { timeout: 10000 }).toBeNull();

    // captions off, kept: who speaks still shows
    await page.click(".otd-space-player-cc");
    expect(await page.evaluate(() => localStorage.OTDspacesCaptions)).toBe("0");
    asked.chat.socket.send(caption("gus", "Согласен"));
    await expect.poll(() => playerShown(page).then(p => p.state)).toBe("Говорит Gus");
    expect(await captionShown(page)).toBeNull();
    expect(await page.locator(".otd-space-player-cc").getAttribute("aria-pressed")).toBe("false");

    // for the load watchdog: the chat open, its captions, its kinds of messages by their fields' names only
    asked.chat.socket.send(chatMessage(2, { occupancy: 40, total_participants: 50 }));
    await expect.poll(() => page.evaluate(() => window.__told.filter(e => e.kind === "spaces-player").at(-1).messages)).toEqual(["1:45:body,final,timestamp,type,username", "2:-:occupancy,total_participants"]);
    expect(await page.evaluate(() => window.__told.filter(e => e.kind === "spaces-player").at(-1))).toMatchObject({ state: "playing", chat: "open", captions: 4 });

    // closed: the chat too
    await page.click(".otd-space-player-close");
    await expect.poll(() => page.evaluate(() => window.__told.filter(e => e.kind === "spaces-player").at(-1).chat)).toBe("closed");
});

test("the chat not to be had: the Space plays all the same", async ({ page }) => {
    const asked = await open(page, { answer: { chat: () => [403, ""] } });
    await expect.poll(() => cards(page)).toBe(4);
    await listenButton(page, "1LiveAAAAAAAA").click();
    await plays(page, 0.5);
    expect((await playerShown(page)).state).toBe("В эфире · Hana");
    expect(asked.chat.socket).toBeNull();
    expect(await page.evaluate(() => window.__told.filter(e => e.kind === "spaces-player").at(-1))).toMatchObject({ state: "playing", chat: "HTTP 403", captions: 0 });
});

test("the player's buttons and the cards' keep their look in the dark theme with the pointer over them and pressed", async ({ page }) => {
    const asked = await open(page);
    await expect.poll(() => cards(page)).toBe(4);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await listenButton(page, "1LiveAAAAAAAA").click();
    await expect.poll(() => asked.chat.sent.length).toBe(2);
    asked.chat.socket.send(caption("alice", "Привет"));
    await expect.poll(() => page.locator(".otd-space-player-cc").isVisible()).toBe(true);
    // TweetDeck's dark theme has its light blue under the pointer, a ring pressed or with the focus
    const looks = async selector => {
        const target = page.locator(selector).first();
        await target.hover();
        await page.mouse.down();
        const look = await target.evaluate(el => { const st = getComputedStyle(el); return [st.backgroundColor, st.boxShadow, st.borderTopWidth]; });
        await page.mouse.up();
        await page.mouse.move(0, 0);
        return look;
    };
    // in an order where pressing one leaves the next there: the close last
    for(const selector of [".otd-space-player-toggle", ".otd-space-player-wide", ".otd-space-player-cc", ".otd-spaces-refresh", '[data-column="s1"] .otd-space[data-space-id="1LiveBBBBBBBB"] .otd-space-listen', ".otd-space-player-close"]) {
        const [background, shadow, border] = await looks(selector);
        expect(background, selector).not.toBe("rgb(234, 245, 253)");
        expect(border, selector).toBe("0px");
        if(!selector.includes("-cc")) expect(shadow, selector).toBe("none");
    }
});
