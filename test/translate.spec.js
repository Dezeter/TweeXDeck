// Translation in the background script (google-translate.js), for articles and Spaces' captions: Google's, and
// Microsoft's, as Edge asks it, where Google turns the address away (HTTP 429, as it does a VPN's) or fails
const { test, expect } = require("@playwright/test");
const { openPage, addScripts } = require("./helpers");

// google-translate.js with fetch answered as `answers` says: by the endpoint, a status or a function of the request
async function open(page, answers) {
    await openPage(page);
    await page.evaluate(answers => {
        window.__asked = [];
        window.__answers = answers;
        window.fetch = async (url, init = {}) => {
            const u = new URL(url);
            const where = u.hostname === "translate.googleapis.com" ? "google" : u.hostname === "edge.microsoft.com" ? "auth" : u.hostname === "api-edge.cognitive.microsofttranslator.com" ? "microsoft" : "other";
            window.__asked.push({ where, to: u.searchParams.get("tl") || u.searchParams.get("to"), token: init.headers?.authorization || null, body: init.body ? JSON.parse(init.body) : u.searchParams.get("q") });
            const answer = window.__answers[where];
            const status = typeof answer === "number" ? answer : Array.isArray(answer) ? answer.shift() : 200;
            if(status !== 200) return new Response("<html>unusual traffic</html>", { status });
            if(where === "google") return new Response(JSON.stringify([u.searchParams.get("q").split(/(?<=\n)/).map(s => [`[g] ${s}`, s]), null, "en"]));
            if(where === "auth") return new Response(`token-${window.__asked.filter(a => a.where === "auth").length}`);
            return new Response(JSON.stringify(JSON.parse(init.body).map(item => ({ detectedLanguage: { language: "en", score: 1 }, translations: [{ text: `[m] ${item.Text}`, to: "ru" }] }))));
        };
    }, answers);
    await addScripts(page, "src/google-translate.js");
}
const translate = (page, text, to = "ru") => page.evaluate(([text, to]) => googleTranslate(text, to), [text, to]);
const asked = page => page.evaluate(() => window.__asked.map(a => a.where));

test("Google's where it answers", async ({ page }) => {
    await open(page, {});
    expect(await translate(page, "Hello\nWorld")).toEqual({ text: "[g] Hello\n[g] World", lang: "en", via: "Google" });
    expect(await asked(page)).toEqual(["google"]);
});

test("Google turning the address away: Microsoft's, line by line, and Google left alone a while; its token kept, a new one when it's gone stale", async ({ page }) => {
    await open(page, { google: 429, microsoft: [200, 200, 401, 200] });
    expect(await translate(page, "Hello\n\nWorld")).toEqual({ text: "[m] Hello\n\n[m] World", lang: "en", via: "Microsoft" });
    // the empty line not asked about, the language as Microsoft has it
    expect(await page.evaluate(() => window.__asked.find(a => a.where === "microsoft"))).toEqual({ where: "microsoft", to: "ru", token: "Bearer token-1", body: [{ Text: "Hello" }, { Text: "World" }] });
    // Google not asked again for a while; the token kept
    expect(await translate(page, "Again", "zh")).toEqual({ text: "[m] Again", lang: "en", via: "Microsoft" });
    expect(await page.evaluate(() => window.__asked.at(-1))).toMatchObject({ where: "microsoft", to: "zh-Hans", token: "Bearer token-1" });
    // Microsoft saying the token is no good: a new one, once
    expect(await translate(page, "Once more")).toMatchObject({ text: "[m] Once more", via: "Microsoft" });
    expect(await asked(page)).toEqual(["google", "auth", "microsoft", "microsoft", "microsoft", "auth", "microsoft"]);
});

test("both failing: what each said", async ({ page }) => {
    await open(page, { google: 503, microsoft: 500 });
    expect(await translate(page, "Hello")).toEqual({ error: "Google HTTP 503, Microsoft HTTP 500" });
    // not a 429: Google asked again next time
    await translate(page, "Hello");
    expect((await asked(page)).filter(where => where === "google")).toHaveLength(2);
});
