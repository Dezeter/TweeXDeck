const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 420, height: 900 } });

const avatar = color => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="${color}"/></svg>`);

// A notifications column rendered by TweetDeck from activity JSON: likes of tweet t1 by A, B, C with other
// notifications in between, three follows in a row and a single like of t2
// a wider column and more of this extension's scripts, for a media square beside the text
async function openColumn(page, storage, { width = 360, scripts = [] } = {}) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await page.evaluate(([colors, width]) => {
        const account = { getUserID: () => "1", getKey: () => "twitter:1", getUsername: () => "Dezeter", getName: () => "Dezeter", getProfileImageURL: () => "", isPrivate: () => false };
        let n = 0;
        const user = (id, name) => ({ id_str: id, id: +id, screen_name: name.toLowerCase(), name, profile_image_url_https: colors[n++ % colors.length], entities: { description: { urls: [] }, url: { urls: [] } }, description: `bio of ${name}` });
        window.U = { me: user("1", "Dezeter"), a: user("11", "Krasovskiy"), b: user("12", "Ely"), c: user("13", "Pidr Crossaint"), d: user("14", "Jon Wynn"), e: user("15", "Alice"), f: user("16", "Bob"), g: user("17", "Carol"), h: user("18", "Henry") };
        const text = "Они продолжают говорить, что они — следующий Disney.\n\nНо посмотрите на 5 лет Google Trends: Pudgy почти всегда ниже 1 из 100. Максимум — 4, в августе 2025 года.\n\nКаждый всплеск — это токен или игры.\n\nДля обычных людей Pudgy был ничем раньше и остаётся ничем.";
        const entities = { hashtags: [], urls: [], user_mentions: [], symbols: [] };
        window.T = {
            t1: { id_str: "100", full_text: text, text, created_at: new Date(Date.now() - 864e5 * 14).toUTCString(), user: U.me, entities: { ...entities, media: [] }, extended_entities: { media: [{ id_str: "9", media_url_https: colors[2], type: "photo", sizes: { large: { w: 600, h: 300 }, medium: { w: 600, h: 300 }, small: { w: 600, h: 300 }, thumb: { w: 150, h: 150 } }, url: "https://t.co/m", display_url: "pic.x.com/m", expanded_url: "https://x.com/i/m", indices: [0, 0] }] }, source: "web" },
            t2: { id_str: "200", full_text: "Только Бульбазавр!", text: "Только Бульбазавр!", created_at: new Date(Date.now() - 864e5).toUTCString(), user: U.me, entities, source: "web" },
        };
        let t = 0;
        window.act = (action, source, target) => {
            const ts = Date.now() - (t += 60000);
            const json = { action, created_at: new Date(ts).toUTCString(), max_position: `${ts}`, min_position: `${ts}`, sources: [source], sources_size: 1, targets: [target], targets_size: 1, target_objects: [target], target_objects_size: 1 };
            return TD.services.TwitterAction.processRESTAction(json, account)[0];
        };
        window.chirps = {};
        // a notifications column, Small as TweetDeck has them
        TD.controller.columnManager = { get: key => key === "c1" ? { findChirp: k => window.chirps[k], getMediaPreviewSize: () => "small" } : null };
        document.body.insertAdjacentHTML("beforeend", `<section class="js-column column" data-column="c1" style="width:${width}px;display:block"><div class="js-column-scroller column-scroller"><div class="js-chirp-container chirp-container"></div></div></section>`);
        window.addChirp = (chirp, top) => {
            window.chirps[chirp.id] = chirp;
            document.querySelector(".js-chirp-container").insertAdjacentHTML(top ? "afterbegin" : "beforeend", chirp.render({ mediaPreviewSize: "small" }));
        };
        [act("favorite", U.a, T.t1), act("follow", U.e, U.me), act("follow", U.f, U.me), act("follow", U.g, U.me), act("favorite", U.b, T.t1), act("favorite", U.d, T.t2), act("favorite", U.c, T.t1)].forEach(c => addChirp(c));
    }, [["#e0245e", "#17bf63", "#1da1f2", "#ffad1f", "#794bc4", "#f45d22"].map(avatar), width]);
    await addScripts(page, "src/otd-common.js", ...scripts, "src/group-notifications.js");
    await page.waitForTimeout(400);
}

const view = page => page.evaluate(() => [...document.querySelectorAll(".js-chirp-container > article")].map(a => ({
    shown: getComputedStyle(a).display !== "none",
    group: a.classList.contains("otd-notif-group"),
    compact: a.classList.contains("otd-notif-compact"),
    header: a.querySelector(".activity-header .nbfc")?.textContent.replace(/\s+/g, " ").trim(),
    avatars: a.querySelectorAll(".otd-notif-avatars img").length,
    summaryShown: a.querySelector(".account-summary") ? getComputedStyle(a.querySelector(".account-summary")).display !== "none" : null,
    media: [...a.querySelectorAll(".js-media, .js-media-preview-container")].some(m => getComputedStyle(m).display !== "none"),
    textHeight: a.querySelector(".tweet-text") ? Math.round(a.querySelector(".tweet-text").getBoundingClientRect().height) : null,
})));

test("likes of one tweet and follows in a row are grouped like on x.com", async ({ page }) => {
    await openColumn(page);
    let items = await view(page);
    expect(items.filter(i => i.shown)).toHaveLength(3);

    // likes of t1: one item with three avatars, the other likes hidden even with notifications in between
    expect(items[0]).toMatchObject({ group: true, header: "Krasovskiy, Ely и ещё 1 лайкнули", avatars: 3 });
    expect(items[4].shown || items[6].shown).toBe(false);
    // three follows: one item, the avatar row stands in for the first card
    expect(items[1]).toMatchObject({ group: true, header: "Alice, Bob и ещё 1 подписались на вас", avatars: 3, summaryShown: false });
    expect(items[2].shown || items[3].shown).toBe(false);
    // a single like keeps TweetDeck's own header
    expect(items[5]).toMatchObject({ group: false, shown: true, avatars: 0 });
    expect(items[5].header).toMatch(/Jon Wynn/);
    // the liked tweet is cut to about three lines, without media
    expect(items[0]).toMatchObject({ compact: true, media: false });
    expect(items[0].textHeight).toBeLessThanOrEqual(80);

    // a new like of the same tweet arrives on top and heads the group
    await page.evaluate(() => addChirp(act("favorite", U.h, T.t1), true));
    await page.waitForTimeout(300);
    items = await view(page);
    expect(items[0]).toMatchObject({ group: true, header: "Henry, Krasovskiy и ещё 2 лайкнули", avatars: 4 });
    expect(items[1]).toMatchObject({ shown: false, group: false, avatars: 0 });
    expect(items[1].header).toMatch(/Krasovskiy/);

    // TweetDeck drops the older items: a group of one is a plain item again
    await page.evaluate(() => {
        const articles = [...document.querySelectorAll(".js-chirp-container > article")];
        for(const article of [articles[1], articles[5], articles[7]]) article.remove();
    });
    await page.waitForTimeout(300);
    items = await view(page);
    expect(items[0]).toMatchObject({ group: false, shown: true, avatars: 0 });
    expect(items[0].header).toMatch(/Henry/);
});

test("in a column with room for a media square, the liked tweet is still cut to three lines, not over the next item", async ({ page }) => {
    await openColumn(page, {}, { width: 460, scripts: ["src/modern-look.js", "src/media-layout.js"] });
    const liked = await page.evaluate(() => {
        const article = document.querySelector(".js-chirp-container > article");
        const text = article.querySelector(".tweet-text");
        const next = [...document.querySelectorAll(".js-chirp-container > article")].find(a => a !== article && getComputedStyle(a).display !== "none");
        return {
            // media-layout.js's square, though the media are hidden here
            square: article.querySelector(".tweet-body").classList.contains("otd-has-thumb"),
            overflow: getComputedStyle(text).overflow,
            cut: text.scrollHeight > text.clientHeight,
            inside: text.getBoundingClientRect().bottom <= article.getBoundingClientRect().bottom && article.getBoundingClientRect().bottom <= next.getBoundingClientRect().top + 0.5,
        };
    });
    expect(liked).toEqual({ square: true, overflow: "hidden", cut: true, inside: true });
});

test("OTDgroupNotifications=0 leaves the column as it was", async ({ page }) => {
    await openColumn(page, { OTDgroupNotifications: "0" });
    for(const item of await view(page)) expect(item).toMatchObject({ shown: true, group: false, compact: false });
});
