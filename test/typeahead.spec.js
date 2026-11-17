// Suggestions as an @name or a #hashtag is typed (typeahead.js): X's own search as x.com asks it, its people in
// TweetDeck's own list under the tweet box, in X's order, with their checks; the lists made ahead X has no more of
// answered at once
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addAccount, addScripts } = require("./helpers");

const CORS = { "access-control-allow-origin": "http://otd.test", "access-control-allow-credentials": "true" };
// a person as X's typeahead answers them now
const person = (id, name, handle, extra = {}) => ({ id: Number(id), id_str: id, verified: false, ext_is_blue_verified: false, badges: [], is_dm_able: false, is_blocked: false, can_media_tag: true,
    name, screen_name: handle, profile_image_url: "", profile_image_url_https: `https://pbs.twimg.com/profile_images/${id}/a_normal.jpg`, location: "", is_protected: false,
    rounded_score: 0, social_proof: 0, connecting_user_count: 0, connecting_user_ids: [], social_context: { following: false, followed_by: false }, tokens: [], inline: false, ...extra });
const ANSWER = q => ({ num_results: 3, users: [
    person("1600000000000000100", "vibe/vibe", "vibevibefun", { ext_is_blue_verified: true }),
    // found by X, though neither the name nor the handle starts with what was typed
    person("101", "The Vibe Check", "checkthevibe"),
    person("102", "Vibes", "vibes_", { verified: true }),
], topics: q.startsWith("#") ? [{ topic: "#vibecoding", rounded_score: 0, tokens: [], inline: false }] : [], events: [], lists: [], ordered_sections: [], oneclick: [], hashtags: [], completed_in: 0.01, query: q });

// TweetDeck's typeahead data and its list under a tweet box, TweetDeck's remote suggestions on, as the decider
// interception.js answers has them; X's search answered by `answer` (a body, or an HTTP status)
async function open(page, { answer = ANSWER, storage } = {}) {
    const asked = [];
    await openPage(page, { storage, routes: {
        "https://otd.test/i/api/1.1/search/typeahead.json": route => {
            const url = new URL(route.request().url());
            asked.push({ where: "x.com", ...Object.fromEntries(url.searchParams), tid: route.request().headers()["x-client-transaction-id"] || null });
            const body = answer(url.searchParams.get("q"));
            if(typeof body === "number") return route.fulfill({ status: body, headers: CORS, body: "" });
            return route.fulfill({ contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
        },
        "https://api.otd.test/1.1/search/typeahead.json": route => {
            asked.push({ where: "api", q: new URL(route.request().url()).searchParams.get("q") });
            return route.fulfill({ contentType: "application/json", headers: CORS, body: JSON.stringify({ users: [] }) });
        },
    } });
    await page.evaluate(() => {
        window.solveChallenge = async (path, method) => `tid:${method}:${path}`;
        window.__told = [];
        document.addEventListener("otd-diagnostic", e => window.__told.push(JSON.parse(e.detail)));
    });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(() => {
        Object.assign(window.__account, { isContributor: () => false, isCookieUser: () => true });
        const decider = TD.decider.get;
        TD.decider.get = key => key === "autocomplete_remote_sources" || decider.call(TD.decider, key);
        const require = window.__require;
        const data = require(Object.keys(require.m).find(id => String(require.m[id]).includes("dataSourceToClient")));
        (data.default || data).attachTo(document);
        document.body.insertAdjacentHTML("beforeend", '<div class="compose" style="position:relative;width:300px;padding:10px"><textarea class="js-compose-text compose-text" style="width:280px;height:80px"></textarea></div>');
        window.__list = new TD.components.Autocomplete(require(0)(".js-compose-text"));
    });
    await addScripts(page, "src/otd-common.js", "src/typeahead.js");
    return asked;
}
const listed = page => page.evaluate(() => {
    const list = document.querySelector("ul.typeahead");
    return list && list.style.display !== "none" ? [...list.querySelectorAll("li")].map(li => `${li.querySelector(".fullname, p")?.textContent.trim()}${li.querySelector(".username") ? ` ${li.querySelector(".username").textContent.trim()}` : ""}${li.querySelector(".sprite-verified-mini") ? " ✓" : ""}`) : [];
});

test("@ and a few letters: the people X's search finds, in its order, with their checks; Enter puts the handle in", async ({ page }) => {
    const asked = await open(page);
    await page.click(".js-compose-text");
    await page.keyboard.type("Привет @vib", { delay: 30 });
    await expect.poll(() => listed(page)).toEqual(["vibe/vibe @vibevibefun ✓", "The Vibe Check @checkthevibe", "Vibes @vibes_ ✓"]);
    // asked as x.com's tweet box asks, at x.com, not api.x.com's search of before
    expect(asked.at(-1)).toMatchObject({ where: "x.com", q: "@vib", src: "compose", result_type: "users", include_ext_is_blue_verified: "1", tid: "tid:GET:/i/api/1.1/search/typeahead.json" });
    expect(asked.some(a => a.where === "api")).toBe(false);
    // the avatars as TweetDeck's list draws them
    expect(await page.$eval("ul.typeahead img", img => img.getAttribute("src"))).toBe("https://pbs.twimg.com/profile_images/1600000000000000100/a_mini.jpg");
    await page.keyboard.press("Enter");
    await expect.poll(() => page.$eval(".js-compose-text", el => el.value)).toBe("Привет @vibevibefun ");
    // for the diagnostics
    expect(await page.evaluate(() => window.__told.filter(e => e.kind === "typeahead").at(-1).text)).toMatch(/^\d+ asked, the last ok \(3 people, 0 topics\)$/);
});

test("# and a few letters: hashtags from X's search", async ({ page }) => {
    const asked = await open(page);
    await page.click(".js-compose-text");
    await page.keyboard.type("#vib", { delay: 30 });
    await expect.poll(() => listed(page)).toEqual(["#vibecoding"]);
    expect(asked.at(-1)).toMatchObject({ q: "#vib", src: "compose", result_type: "topics" });
});

test("the lists made ahead X has none of are answered at once, without asking; X failing shows nothing and says so", async ({ page }) => {
    const asked = await open(page, { answer: () => 503 });
    expect(await page.evaluate(() => new Promise(resolve => TD.controller.clients.getPreferredClient().typeaheadSearch({ prefetch: true, count: 2500 }, data => resolve(data))))).toEqual({ users: [], topics: [], lists: [] });
    expect(asked).toEqual([]);
    await page.click(".js-compose-text");
    await page.keyboard.type("@vib", { delay: 30 });
    await expect.poll(() => page.evaluate(() => window.__told.filter(e => e.kind === "typeahead").at(-1)?.text)).toMatch(/failed \(HTTP 503\)$/);
    expect(await listed(page)).toEqual([]);
});

test("switched off, TweetDeck asks its own way, as before", async ({ page }) => {
    const asked = await open(page, { storage: { OTDtypeahead: "0" } });
    await page.click(".js-compose-text");
    await page.keyboard.type("@vib", { delay: 30 });
    await expect.poll(() => asked.map(a => a.where)).toContain("api");
    expect(asked.some(a => a.where === "x.com")).toBe(false);
});
