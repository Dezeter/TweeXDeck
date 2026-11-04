// The load watchdog on TweetDeck's page before it starts: what it hears, the panel, the report. It runs from the
// start of the page here, as the content script does, with the page's clock under the test's control.
const path = require("path");
const { test, expect } = require("@playwright/test");
const { ROOT, read, openPage, addScripts } = require("./helpers");

test.use({ locale: "en-US" });

const X_POLICY = "script-src 'nonce-abc'";

// reloaded: as if the watchdog had reloaded the page a moment ago, so it doesn't again;
// worker: x.com's service worker answers the page ("registered": it is there, but doesn't), the ones it lets go are
// counted in sessionStorage.__unregistered; storage: localStorage as the page opens;
// background: what the background script saw of the page, as content.js answers, its atOffset when it saw it from the
// start of the page's load; false: no answer. The watchdog's new loads of the page are counted in
// sessionStorage.__newLoads, what it's told of the service worker is in window.__workerTold
async function openWatched(page, { headers, routes, reloaded, worker, storage, background = { status: 200, fromCache: false, stripped: [] }, html } = {}) {
    // the page's time stands still between the test's steps
    const now = Date.now();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now + 1000);
    if(worker) await page.addInitScript(controls => {
        const registration = { unregister: async () => {
            sessionStorage.__unregistered = String(Number(sessionStorage.__unregistered || 0) + 1);
            return true;
        } };
        Object.defineProperty(navigator, "serviceWorker", { value: { controller: controls ? { scriptURL: "https://x.com/sw.js?v=1" } : null, getRegistrations: async () => [registration] } });
    }, worker !== "registered");
    if(storage) await page.addInitScript(storage => Object.assign(localStorage, storage), storage);
    await page.addInitScript(background => {
        // before the watchdog takes its mark off the address
        if(new URL(location.href).searchParams.has("otd-load")) sessionStorage.__newLoads = String(Number(sessionStorage.__newLoads || 0) + 1);
        window.__workerTold = [];
        // the page's clock has its time origin from its first task on
        const answer = () => {
            if(background?.atOffset === undefined) return background;
            const { atOffset, ...rest } = background;
            return { ...rest, at: performance.timeOrigin + atOffset };
        };
        window.addEventListener("message", e => {
            if(e.data?.action === "otdServiceWorker") window.__workerTold.push(e.data.block);
            if(background === false) return;
            if(e.data?.action === "otdPage") window.postMessage({ otdPage: answer() }, "*");
        });
    }, background);
    await page.addInitScript({ path: path.join(ROOT, "src/watchdog.js") });
    // what the copy button puts on the clipboard
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__copied = text; } } });
    });
    // the page itself with x.com's headers
    if(headers || html) routes = { ...routes, "http://otd.test/i/tweetdeck": route => route.fulfill({ headers: { "content-type": "text/html", ...headers }, body: html || read("files/index.html") }) };
    await openPage(page, { routes });
    if(reloaded) await page.evaluate(() => { sessionStorage.OTDautoReloadAt = String(Date.now()); });
}
const diagnostic = (page, ...entries) => page.evaluate(entries => {
    for(const entry of entries) document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify(entry) }));
}, entries);
const askReport = page => page.evaluate(() => {
    let report = "";
    document.addEventListener("otd-diagnostic-report", e => { report = e.detail; });
    document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
    return report;
});
const RELOADED = "The page was reloaded automatically already, it didn't help.";
// the reload the watchdog makes as the page's time moves on; the time stands still again on the new page
async function reloaded(page, run) {
    const load = page.waitForEvent("load");
    await page.clock.runFor(run);
    await load;
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
}
// the steps injection.js reports, and its first inline script
const inject = page => page.evaluate(() => {
    for(const step of ["extension", "page"]) document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "step", step }) }));
    const script = document.createElement("script");
    script.textContent = "window.__ran = true";
    document.head.appendChild(script);
    document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "step", step: "scripts" }) }));
});
const panel = page => page.locator("#otd-watchdog");
const findings = page => panel(page).locator(".findings li").allTextContents();

test("when x.com's policy blocks the extension's scripts, the page reloads at once; blocked again, the panel says so after 5 s and copies a report", async ({ page }) => {
    await openWatched(page, { headers: { "content-security-policy": X_POLICY } });
    await inject(page);
    expect(await page.evaluate(() => window.__ran ?? false)).toBe(false);
    await reloaded(page, 1000);
    expect(await page.evaluate(() => sessionStorage.__newLoads)).toBe("1");

    // the new page's time starts about a second off, after the reload
    await inject(page);
    expect(await panel(page).count()).toBe(0);
    await page.clock.runFor(5000);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText("TweetDeck hasn't loaded");
    const list = await findings(page);
    expect(list).toHaveLength(2);
    expect(list[0]).toContain("x.com blocked the extension's scripts (Content-Security-Policy), 1 blocked");
    expect(list[1]).toBe(RELOADED);

    await panel(page).getByRole("button", { name: "Copy diagnostics" }).click();
    await expect(panel(page).getByRole("button", { name: "Copied" })).toBeVisible();
    const report = await page.evaluate(() => window.__copied);
    expect(report).toMatch(/^TweeXDeck diagnostics\n/);
    expect(report).toContain("Page: http://otd.test/i/tweetdeck\n");
    expect(report).toContain("TweetDeck: not started");
    expect(report).toContain("Steps: extension 0 s, page 0 s, scripts 0 s; TD no, OTD no\n");
    expect(report).toContain("\nService worker: none\n");
    // the page's clock here takes performance's navigation entry; the extension's test has it
    expect(report).toMatch(/\nLoaded: [^;\n]+; the background script took off nothing \(HTTP 200\)\n/);
    expect(report).toContain("\nPage policy: script-src 'nonce-…'\n");
    expect(report).toMatch(/\n {2}script-src-elem inline\b.* ×1, first at 0 s\n/);

    // hidden for good, and no reload: it wouldn't help
    await page.evaluate(() => { window.__same = true; });
    await panel(page).getByRole("button", { name: "Hide" }).click();
    await page.clock.runFor(30000);
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__same)).toBe(true);
});

test("when Firefox keeps x.com's policy the background script took off, the page reloads once more, and a last time half a minute after the first", async ({ page }) => {
    // the policy still comes with the page here, as Firefox keeps it when the reload moves the tab to another process
    await openWatched(page, { headers: { "content-security-policy": X_POLICY }, background: { status: 200, fromCache: false, stripped: ["content-security-policy", "cross-origin-opener-policy", "cross-origin-embedder-policy"] } });
    await inject(page);
    await reloaded(page, 1000);
    expect(await page.evaluate(() => sessionStorage.__newLoads)).toBe("1");
    await inject(page);
    // the page's clock here starts a little before the time the reload was asked at
    expect(await askReport(page)).toMatch(/\nLoaded: [^;\n]+, -?\d+\.\d s after the automatic reload was asked; /);
    await reloaded(page, 1000);
    expect(await page.evaluate(() => sessionStorage.__newLoads)).toBe("2");

    // the panel meanwhile, with how long till the last try
    await inject(page);
    await page.clock.runFor(5000);
    await expect(panel(page)).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.__newLoads)).toBe("2");
    let list = await findings(page);
    expect(list[0]).toContain("in Firefox sometimes after plain x.com in this tab");
    expect(list[1]).toMatch(/^The page reloads once more in 2\d s: Firefox usually lets go of this policy in about half a minute\.$/);
    await reloaded(page, 25000);
    expect(await page.evaluate(() => sessionStorage.__newLoads)).toBe("3");

    // no fourth: the panel, with the reports of the pages before
    await inject(page);
    await page.clock.runFor(60000);
    await expect(panel(page)).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.__newLoads)).toBe("3");
    list = await findings(page);
    expect(list[1]).toBe(RELOADED);
    const report = await askReport(page);
    expect(report.match(/\n\nBefore the automatic reload at [^\n]+:\nTweeXDeck diagnostics\n/g)).toHaveLength(3);
    expect(report.match(/\nLoaded: [^;\n]+; the background script took off content-security-policy, cross-origin-opener-policy, cross-origin-embedder-policy \(HTTP 200\)\n/g)).toHaveLength(4);
});

test("x.com's policy put back by another extension: the report says what the page had after every extension, and when the background script saw it", async ({ page }) => {
    await openWatched(page, { headers: { "content-security-policy": `${X_POLICY} https://*.twimg.com; connect-src 'self'` }, background: {
        status: 200, fromCache: false, stripped: ["content-security-policy", "cross-origin-opener-policy"], left: ["content-security-policy"], atOffset: 300,
    } });
    // as on the page after the two reloads
    await page.evaluate(() => Object.assign(sessionStorage, { OTDautoReloadAt: String(Date.now()), OTDautoReloads: "2", OTDautoReloadFirst: String(Date.now()) }));
    await inject(page);
    const report = await askReport(page);
    expect(report).toMatch(/\nLoaded: [^;\n]+; the background script took off content-security-policy, cross-origin-opener-policy \(HTTP 200, 0\.3 s into its load\); after every extension's changes it had content-security-policy again\n/);
    expect(report).toContain("\nPage policy: script-src 'nonce-…' https://*.twimg.com; connect-src 'self'\nBlocked by: script-src 'nonce-…' https://*.twimg.com\n");

    await page.clock.runFor(5000);
    const list = await findings(page);
    expect(list).toHaveLength(3);
    expect(list[1]).toBe("Another extension put x.com's policy back: it changes the page's headers after TweeXDeck. That's usually a userscript manager that rewrites Content-Security-Policy, or a blocker. Switch its CSP changes off for x.com, or switch it off on this page.");
    expect(list[2]).toMatch(/^The page reloads once more in 2\d s/);
});

test("an answer about an earlier load of the tab says it isn't this page's", async ({ page }) => {
    await openWatched(page, { background: { status: 200, fromCache: false, stripped: [], atOffset: -42000 }, reloaded: true });
    expect(await askReport(page)).toContain("; the background script took off nothing (HTTP 200, 42 s before this page began loading: not its load)\n");
});

test("stuck with nothing to explain it, the page reloads once and keeps the stuck one's report; stuck again, the panel", async ({ page }) => {
    await openWatched(page);
    await inject(page);
    // TweetDeck got as far as logging in, and X never answered
    await diagnostic(page, { kind: "startup", key: "startup:start" }, { kind: "startup", key: "startup:do-login" },
        { kind: "request", id: 1, method: "GET", url: "https://api.x.com/1.1/account/verify_credentials.json" },
        { kind: "request", id: 2, method: "GET", url: "https://api.x.com/1.1/help/settings.json" }, { kind: "response", id: 2, method: "GET", url: "https://api.x.com/1.1/help/settings.json", status: 200 });
    await page.clock.runFor(15000);
    expect(await askReport(page)).toMatch(/\nTweetDeck's steps: startup:start 0 s, startup:do-login 0 s\n[^]*\nWaiting for X: \n {2}GET api\.x\.com\/1\.1\/account\/verify_credentials\.json for 15 s\n/);
    await reloaded(page, 6000);

    // the next page: stuck again, it shows the panel and says the reload didn't help
    await inject(page);
    await diagnostic(page, { kind: "request", id: 1, method: "GET", url: "https://api.x.com/1.1/account/verify_credentials.json" });
    await page.clock.runFor(21000);
    await expect(panel(page)).toBeVisible();
    const list = await findings(page);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatch(/^X doesn't answer TweetDeck's requests: GET api\.x\.com\/1\.1\/account\/verify_credentials\.json \(waiting 2\d s\)\. A reload usually helps\.$/);
    expect(list[1]).toBe(RELOADED);
    const report = await askReport(page);
    expect(report).toMatch(/\n\nBefore the automatic reload at \d{4}-\d\d-\d\dT[\d:.]+Z:\nTweeXDeck diagnostics\n/);
    expect(report.split("Before the automatic reload")[1]).toContain("\nWaiting for X: \n  GET api.x.com/1.1/account/verify_credentials.json for 20 s\n");
});

test("a page x.com's service worker answers: the worker goes and the page reloads at once, once", async ({ page }) => {
    await openWatched(page, { worker: true });
    await reloaded(page, 1000);
    expect(await page.evaluate(() => sessionStorage.__unregistered)).toBe("1");
    expect(await page.evaluate(() => sessionStorage.__newLoads)).toBe("1");
    expect(await askReport(page)).toMatch(/\nBefore the automatic reload at [^\n]+\n[^]*\nService worker: controls the page \(x\.com\/sw\.js\), 1 removed\n/);

    // still answered by it after the reload (a stub here): no more reloads, the panel says how to remove it by hand
    await inject(page);
    await page.clock.runFor(21000);
    expect(await findings(page)).toEqual([
        "x.com's service worker (x.com/sw.js) answers TweetDeck's page, past the extension. Remove it by hand and reload the page: about:serviceworkers in Firefox, chrome://serviceworker-internals in Chrome, find x.com and press \"Unregister\".",
        RELOADED,
    ]);
    expect(await page.evaluate(() => sessionStorage.__unregistered)).toBe("1");
});

test("with x.com's service worker kept off, it goes whenever TweetDeck opens, and the background script is told to keep it off", async ({ page }) => {
    await openWatched(page, { worker: "registered", storage: { OTDblockServiceWorker: "1" } });
    await expect.poll(() => page.evaluate(() => sessionStorage.__unregistered ?? null)).toBe("1");
    expect(await page.evaluate(() => window.__workerTold)).toEqual([true]);
    // not answering the page, it's no reason to reload
    await page.clock.runFor(3000);
    expect(await page.evaluate(() => sessionStorage.__newLoads ?? null)).toBeNull();
});

test("without the setting, a worker that doesn't answer the page stays, and the background script is told to let it be", async ({ page }) => {
    await openWatched(page, { worker: "registered" });
    await page.clock.runFor(3000);
    expect(await page.evaluate(() => [window.__workerTold, sessionStorage.__unregistered ?? null, sessionStorage.__newLoads ?? null])).toEqual([[false], null, null]);
});

test("a policy in a <meta> of x.com's page, and what the background script took off, are in the report", async ({ page }) => {
    await openWatched(page, {
        html: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'nonce-abc123' 'self'"></head><body>x.com</body></html>`,
        background: { status: 200, fromCache: true, stripped: ["content-security-policy", "cross-origin-opener-policy"] },
    });
    await inject(page);
    await reloaded(page, 1000);
    const report = (await askReport(page)).split("Before the automatic reload")[1];
    expect(report).toContain("\nPage policy: script-src 'nonce-…' 'self'; x.com's page has one in a <meta>\n");
    expect(report).toContain("; the background script took off content-security-policy, cross-origin-opener-policy (HTTP 200, from the cache)\n");
});

test("the watchdog's load is a new load of TweetDeck's address, whose mark leaves the address as the page opens", async ({ page }) => {
    await openWatched(page, { worker: true });
    await reloaded(page, 1000);
    expect(await page.evaluate(() => [sessionStorage.__newLoads, location.href])).toEqual(["1", "http://otd.test/i/tweetdeck"]);
    expect(await askReport(page)).toMatch(/\nLoaded: [^;\n]*, the watchdog's new load, -?\d+\.\d s after the automatic reload was asked; /);
});

test("the panel's Reload is a new load of the address too", async ({ page }) => {
    await openWatched(page, { headers: { "content-security-policy": X_POLICY }, reloaded: true });
    await inject(page);
    await page.clock.runFor(5000);
    await expect(panel(page)).toBeVisible();
    const load = page.waitForEvent("load");
    await panel(page).getByRole("button", { name: "Reload" }).click();
    await load;
    expect(await page.evaluate(() => [sessionStorage.__newLoads, location.href])).toEqual(["1", "http://otd.test/i/tweetdeck"]);
});

test("the nonces of the policy and of x.com's scripts tell whether the policy is this load's", async ({ page }) => {
    const xcom = nonce => `<!doctype html><html><head><script nonce="${nonce}">window.__xcom = true</script></head><body>x.com</body></html>`;
    await openWatched(page, { headers: { "content-security-policy": "script-src 'nonce-abcdef123'" }, html: xcom("abcdef123"), reloaded: true });
    await inject(page);
    expect(await askReport(page)).toContain("\nNonces: the policy's abcdef…; x.com's scripts' abcdef…, in the policy: this load's\n");

    // x.com's scripts have a nonce the policy doesn't: the policy came with another load
    await openWatched(page, { headers: { "content-security-policy": "script-src 'nonce-abcdef123'" }, html: xcom("zzz999zzz"), reloaded: true });
    await inject(page);
    expect(await askReport(page)).toContain("\nNonces: the policy's abcdef…; x.com's scripts' zzz999…, none of them in the policy: another load's policy\n");
    await page.clock.runFor(5000);
    expect(await findings(page)).toContain("The policy is another load's, not the one that came now: Firefox kept it for this page. A new load of the address helps, not a reload; the Reload button below does that.");
});

test("after a reload, without errors it waits 20 s, and goes away when TweetDeck starts after all", async ({ page }) => {
    await openWatched(page, { reloaded: true });
    await inject(page);
    expect(await page.evaluate(() => window.__ran)).toBe(true);

    await page.clock.runFor(15000);
    await expect(panel(page)).toHaveCount(0);
    await page.clock.runFor(6000);
    await expect(panel(page)).toBeVisible();
    expect(await findings(page)).toEqual(["No errors in sight: X may be slow to answer. Wait or reload the page.", RELOADED]);

    await page.evaluate(() => document.querySelector(".js-app").classList.remove("is-hidden"));
    await page.clock.runFor(1000);
    await expect(panel(page)).toHaveCount(0);
});

test("TweetDeck's login form counts as started", async ({ page }) => {
    await openWatched(page);
    await inject(page);
    await page.evaluate(() => document.querySelector(".js-app-loading").insertAdjacentHTML("beforeend", '<section class="js-login-form"></section>'));
    await page.clock.runFor(25000);
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => {
        let report = "";
        document.addEventListener("otd-diagnostic-report", e => { report = e.detail; });
        document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
        return report;
    })).toContain("TweetDeck: started at ");
});

test("the extension that never started, files that didn't load, the solver and X's answers, without queries", async ({ page }) => {
    const cors = { "access-control-allow-origin": "http://otd.test" };
    await openWatched(page, { routes: {
        "https://upload.x.com/i/ok": route => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "{}" }),
        "https://upload.x.com/": route => route.fulfill({ status: 401, headers: cors, contentType: "application/json", body: "{}" }),
        "https://upload.twitter.com/": route => route.fulfill({ status: 503, headers: cors, contentType: "application/json", body: "{}" }),
    }, reloaded: true });
    await page.clock.runFor(21000);
    expect(await findings(page)).toEqual(["The extension didn't start on the page: its script got no answer. Reload the page; if that doesn't help, restart the browser or reinstall the extension.", RELOADED]);

    // the real reporters: injection.js's file loader is in its main(), so a file is reported by hand
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "file", path: "/src/settings.js", error: "TypeError: NetworkError" }) })));
    // the solver can't reach x.com's homepage here
    await addScripts(page, "src/challenge.js", "src/interception.js");
    const urls = [
        "https://upload.x.com/i/ok",
        "https://upload.x.com/1.1/media/upload.json?command=STATUS&media_id=123",
        "https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=456",
        // the solver can't sign it, so it never goes out
        "https://api.x.com/1.1/account/verify_credentials.json?include_email=true",
    ];
    await page.evaluate(urls => new Promise(resolve => {
        let reported = 0;
        document.addEventListener("otd-diagnostic", e => {
            if(JSON.parse(e.detail).kind === "response" && ++reported === urls.length) resolve();
        });
        for(const url of urls) {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.send();
        }
    }), urls);
    // theme.js's twins of TweetDeck's dark rules
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "theme", text: "565 twins of TweetDeck's rules, its CSS read from its text" }) })));
    await page.clock.runFor(1000);
    const list = await findings(page);
    expect(list).toHaveLength(6);
    expect(list[1]).toBe("The extension's files didn't load: /src/settings.js. Reinstall the extension and keep its files after installing.");
    expect(list[2]).toMatch(/^x-client-transaction-id can't be computed, and X refuses some requests without it: TypeError: /);
    expect(list[3]).toBe("X answers 401/403: you're probably not logged in to x.com in this browser or the session expired. Open x.com, log in and reload this page.");
    expect(list[4]).toMatch(/^X answers with errors: /);
    expect(list[4]).toContain("GET upload.twitter.com/1.1/media/upload.json — 503");
    expect(list[4]).toContain("GET api.x.com/1.1/account/verify_credentials.json — not sent (Solver errored)");

    await panel(page).getByRole("button", { name: "Copy diagnostics" }).click();
    const report = await page.evaluate(() => window.__copied);
    expect(report).toMatch(/\nSolver: failed at \d+ s \(TypeError: [^)]*\)\n/);
    expect(report).toContain("\nDark theme: 565 twins of TweetDeck's rules, its CSS read from its text\n");
    expect(report).toContain("\nExtension files not loaded: /src/settings.js\n");
    expect(report).toContain("\nX: 1 answered fine, errors:\n");
    expect(report).toMatch(/\n {2}GET upload\.x\.com\/1\.1\/media\/upload\.json — 401 ×1, first at \d+ s\n/);
    expect(report).not.toMatch(/command=|media_id|include_email/);
    // all answered, or never sent
    expect(report).toContain("\nWaiting for X: nothing\n");
});

test("switched off, no reload and no panel; the report is still there", async ({ page }) => {
    await openWatched(page);
    await page.evaluate(() => { localStorage.OTDloadWatchdog = "0"; });
    await page.clock.runFor(30000);
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => {
        let report = "";
        document.addEventListener("otd-diagnostic-report", e => { report = e.detail; });
        document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
        return report;
    })).toContain("TweetDeck: not started");
});

test("the columns' requests for new tweets: how many, without a top cursor, the last one and the last with tweets; an error's last time", async ({ page }) => {
    await openWatched(page);
    expect(await askReport(page)).toContain("\nColumns asking for new tweets: none yet\n");
    const notFound = id => ({ kind: "response", id, method: "GET", url: "https://api.x.com/1.1/statuses/home_timeline.json", status: 404 });
    await diagnostic(page, { kind: "poll", feed: "home", tweets: 3, cursor: false });
    await page.clock.runFor(2000);
    await diagnostic(page, { kind: "poll", feed: "home", tweets: 0, cursor: true }, notFound(1));
    await page.clock.runFor(2000);
    await diagnostic(page, { kind: "poll", feed: "home", tweets: 0, cursor: true }, notFound(2), { kind: "poll", feed: "list", tweets: 1, cursor: true });
    const report = await askReport(page);
    const home = report.match(/\nColumns asking for new tweets: \n {2}home ×3 \(1 without a top cursor\), the last at (\d+) s, the last with tweets at (\d+) s\n {2}list ×1 \(0 without a top cursor\), the last at \d+ s, the last with tweets at \d+ s\n/);
    expect(home).not.toBeNull();
    expect(home[1] - home[2]).toBe(4);
    const error = report.match(/\n {2}GET api\.x\.com\/1\.1\/statuses\/home_timeline\.json — 404 ×2, first at (\d+) s, last at (\d+) s\n/);
    expect(error).not.toBeNull();
    expect(error[2] - error[1]).toBe(2);
});

test("the Spaces column's last check: how X answered its fleetline, its search and the Spaces' details, what it showed", async ({ page }) => {
    await openWatched(page);
    expect(await askReport(page)).toContain("\nSpaces column: no news\n");
    await diagnostic(page, { kind: "spaces", fleetline: "ok", search: "HTTP 429", details: "3 fine, 1 failed (HTTP 404)", live: 2, coming: 1 });
    expect(await askReport(page)).toMatch(/\nSpaces column: fleetline ok, search HTTP 429, details 3 fine, 1 failed \(HTTP 404\); 2 live, 1 to come, at \d+ s\n/);
    await diagnostic(page, { kind: "spaces-player", state: "failed", error: "HTTP 403" });
    expect(await askReport(page)).toMatch(/\nSpaces column: fleetline ok, [^\n]*, at \d+ s; player failed \(HTTP 403\) at \d+ s\n/);
    // its chat: open, its captions, the kinds of messages it had by their fields' names
    await diagnostic(page, { kind: "spaces-player", state: "playing", error: "", chat: "open", captions: 12, messages: ["1:45:body,final,username", "2:-:occupancy"] });
    expect(await askReport(page)).toMatch(/; player playing at \d+ s, chat open, 12 captions, messages 1:45:body,final,username; 2:-:occupancy\n/);
});
