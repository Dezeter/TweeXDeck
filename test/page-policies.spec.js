// The extension takes x.com's own page policies off /i/tweetdeck, or TweetDeck can't run there: its CSP blocks
// the scripts injection.js adds, and cross-origin isolation (COOP / COEP) makes Firefox keep the CSP anyway.
const { test, expect } = require("@playwright/test");
const { openPage, read } = require("./helpers");

const X_HEADERS = [
    { name: "content-security-policy", value: "script-src 'nonce-abc' 'self' 'unsafe-inline' https://*.twimg.com; report-uri https://x.com/i/csp_report" },
    { name: "content-security-policy-report-only", value: "script-src 'none'" },
    { name: "cross-origin-opener-policy", value: "same-origin-allow-popups" },
    { name: "cross-origin-embedder-policy", value: "require-corp" },
    { name: "strict-transport-security", value: "max-age=631138519" },
    { name: "Content-Type", value: "text/html; charset=utf-8" },
];
const POLICIES = /^(content-security-policy|cross-origin-(opener|embedder)-policy)(-report-only)?$/i;

// Firefox's background script with chrome.* stubbed: its listeners by event in window.__listeners, in the order they
// listen, storage.local in window.__stored
const STUB = `
    const listeners = window.__listeners = {};
    window.__stored = window.__stored || {};
    const event = name => ({
        addListener: (fn, filter, spec) => { (listeners[name] ||= []).push({ fn, filter, spec }); },
        removeListener: fn => { listeners[name] = (listeners[name] || []).filter(l => l.fn !== fn); },
    });
    window.chrome = {
        webRequest: { OnHeadersReceivedOptions: {}, onHeadersReceived: event("headers"), onBeforeSendHeaders: event("beforeSend"), onSendHeaders: event("send"),
            onResponseStarted: event("started"), onBeforeRequest: event("request") },
        webNavigation: { onCommitted: event("navigation") },
        runtime: { onMessage: event("message"), getURL: path => path },
        storage: { local: { get: (defaults, done) => done({ ...defaults, ...window.__stored }), set: items => Object.assign(window.__stored, items) } },
    };
`;
async function firefoxBackground(page, stored) {
    await openPage(page);
    await page.evaluate(([stub, source, stored]) => {
        window.__stored = stored;
        new Function(stub)();
        new Function(source)();
        window.__ask = (action, tabId) => new Promise(resolve => window.__listeners.message[0].fn({ action }, { tab: { id: tabId } }, resolve));
    }, [STUB, read("src/background.js"), stored || {}]);
}

test("Firefox's background script takes x.com's page policies off TweetDeck's page and keeps the rest", async ({ page }) => {
    await firefoxBackground(page);
    const result = await page.evaluate(headers => {
        const [listener] = window.__listeners.headers;
        return { filter: listener.filter.urls, spec: listener.spec, headers: listener.fn({ url: "https://x.com/i/tweetdeck", responseHeaders: headers }).responseHeaders.map(h => h.name) };
    }, X_HEADERS);
    expect(result.filter).toEqual(expect.arrayContaining(["https://x.com/i/tweetdeck", "https://x.com/i/tweetdeck?*", "https://twitter.com/i/tweetdeck"]));
    expect(result.spec).toEqual(expect.arrayContaining(["blocking", "responseHeaders"]));
    expect(result.headers).toEqual(["strict-transport-security", "Content-Type"]);
});

test("Firefox's background script listens anew before each request for TweetDeck's page, so its changes come last", async ({ page }) => {
    await firefoxBackground(page);
    const result = await page.evaluate(headers => {
        const listeners = window.__listeners;
        // another extension's, which rewrites x.com's policy, listening after this one
        const other = { fn: details => ({ responseHeaders: details.responseHeaders }), filter: { urls: ["<all_urls>"] }, spec: ["blocking", "responseHeaders"] };
        listeners.headers.push(other);
        const ours = () => listeners.headers.filter(l => l !== other);
        const order = () => listeners.headers.map(l => l === other ? "other" : "ours");
        const before = order();
        const [send] = listeners.send;
        send.fn({ url: "https://x.com/i/tweetdeck", type: "main_frame", tabId: 7 });
        const afterRequest = order();
        // the other one listening anew, and the next request
        listeners.headers.push(listeners.headers.splice(0, 1)[0]);
        const moved = order();
        send.fn({ url: "https://x.com/i/tweetdeck?otd-load=1", type: "main_frame", tabId: 7 });
        const afterNext = order();
        const last = ours()[0];
        return {
            before, afterRequest, moved, afterNext, ours: ours().length,
            filter: send.filter, spec: last.spec, urls: last.filter.urls,
            headers: last.fn({ url: "https://x.com/i/tweetdeck", responseHeaders: headers }).responseHeaders.map(h => h.name),
        };
    }, X_HEADERS);
    expect(result.before).toEqual(["ours", "other"]);
    expect(result.afterRequest).toEqual(["other", "ours"]);
    expect(result.moved).toEqual(["ours", "other"]);
    expect(result.afterNext).toEqual(["other", "ours"]);
    expect(result.ours).toBe(1);
    expect(result.filter).toEqual({ urls: ["https://twitter.com/i/tweetdeck", "https://x.com/i/tweetdeck", "https://x.com/i/tweetdeck?*"], types: ["main_frame"] });
    expect(result.spec).toEqual(expect.arrayContaining(["blocking", "responseHeaders"]));
    expect(result.urls).toContain("https://x.com/i/tweetdeck");
    expect(result.headers).toEqual(["strict-transport-security", "Content-Type"]);
});

test("Chrome's rules take the same policies off TweetDeck's page on x.com and twitter.com", () => {
    const rules = JSON.parse(read("ruleset.json")).filter(rule => rule.action.type === "modifyHeaders");
    expect(rules.map(rule => rule.condition.urlFilter).sort()).toEqual(["https://twitter.com/i/tweetdeck", "https://x.com/i/tweetdeck"]);
    for(const rule of rules) {
        const removed = rule.action.responseHeaders.filter(h => h.operation === "remove").map(h => h.header);
        for(const { name } of X_HEADERS.filter(h => POLICIES.test(h.name))) expect(removed, rule.condition.urlFilter).toContain(name);
        expect(removed).toContain("cross-origin-embedder-policy-report-only");
        expect(rule.condition.resourceTypes).toContain("main_frame");
    }
});

test("Firefox's background script tells the load watchdog what it took off a tab's page, when, and what came back after every extension", async ({ page }) => {
    await firefoxBackground(page);
    const result = await page.evaluate(async headers => {
        const listeners = window.__listeners;
        const before = await window.__ask("otdPage", 7);
        const now = Date.now();
        listeners.headers[0].fn({ url: "https://x.com/i/tweetdeck", type: "main_frame", tabId: 7, requestId: "5", statusCode: 200, fromCache: false, responseHeaders: headers });
        listeners.headers[0].fn({ url: "https://x.com/i/tweetdeck?x", type: "xmlhttprequest", tabId: 8, requestId: "6", statusCode: 200, responseHeaders: headers });
        // a copy, as a message is
        const seen = { ...await window.__ask("otdPage", 7) };
        const other = await window.__ask("otdPage", 8);
        // another extension gave the page a policy again; an earlier request of the tab is no news
        const [started] = listeners.started;
        started.fn({ type: "main_frame", tabId: 7, requestId: "4", responseHeaders: [] });
        started.fn({ type: "main_frame", tabId: 7, requestId: "5", responseHeaders: [headers[0], headers.at(-1)] });
        const left = await window.__ask("otdPage", 7);
        return { before, seen, other, left, late: seen.at - now, filter: started.filter, spec: started.spec };
    }, X_HEADERS);
    expect(result.before).toBeNull();
    expect(result.seen).toMatchObject({ status: 200, fromCache: false, stripped: ["content-security-policy", "content-security-policy-report-only", "cross-origin-opener-policy", "cross-origin-embedder-policy"], requestId: "5" });
    expect(result.seen.left).toBeUndefined();
    expect(result.late).toBeGreaterThanOrEqual(0);
    expect(result.late).toBeLessThan(1000);
    expect(result.other).toBeNull();
    expect(result.left.left).toEqual(["content-security-policy"]);
    expect(result.filter).toEqual({ urls: ["https://twitter.com/i/tweetdeck", "https://x.com/i/tweetdeck", "https://x.com/i/tweetdeck?*"], types: ["main_frame"] });
    expect(result.spec).toEqual(["responseHeaders"]);
});

test("Chrome's background script says its rules don't tell", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(async source => {
        let listener;
        self.importScripts = () => {};
        window.chrome = { runtime: { onMessage: { addListener: fn => { listener = fn; } } } };
        new Function(source)();
        return new Promise(resolve => listener({ action: "otdPage" }, { tab: { id: 3 } }, resolve));
    }, read("src/background3.js"));
    expect(result).toEqual({ rules: true });
});

test("content.js passes the load watchdog's questions to the background script and the answer back", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(async source => {
        const sent = [];
        const answers = [];
        window.chrome = { runtime: { getURL: () => "", sendMessage: (message, reply) => {
            sent.push(message);
            if(message.action === "otdPage") reply({ status: 200, fromCache: false, stripped: [] });
        } } };
        new Function(source)();
        window.addEventListener("message", e => { if(e.data && "otdPage" in e.data) answers.push(e.data.otdPage); });
        window.postMessage({ action: "otdPage" }, "*");
        window.postMessage({ action: "otdServiceWorker", block: true }, "*");
        window.postMessage({ action: "otdServiceWorker", block: "yes" }, "*");
        await new Promise(resolve => setTimeout(resolve, 100));
        return { sent, answers };
    }, read("src/content.js"));
    expect(result).toEqual({
        sent: [{ action: "otdPage" }, { action: "otdServiceWorker", block: true }, { action: "otdServiceWorker", block: false }],
        answers: [{ status: 200, fromCache: false, stripped: [] }],
    });
});

test("Firefox's background script keeps x.com's service worker script from loading while the setting says so, and remembers it", async ({ page }) => {
    await firefoxBackground(page, { blockServiceWorker: true });
    const result = await page.evaluate(async () => {
        const listeners = window.__listeners;
        const stored = window.__stored;
        const worker = listeners.request.find(l => l.filter.urls.includes("https://x.com/sw.js*"));
        const load = () => worker.fn({ url: "https://x.com/sw.js", type: "script" }) ?? null;
        const tell = block => listeners.message[0].fn({ action: "otdServiceWorker", block }, { tab: { id: 1 } }, () => {});
        const remembered = load();
        tell(false);
        const off = [load(), { ...stored }];
        tell(true);
        const on = [load(), { ...stored }];
        return { filter: worker.filter.urls, spec: worker.spec, remembered, off, on };
    });
    expect(result).toEqual({
        filter: ["https://x.com/sw.js*", "https://twitter.com/sw.js*"],
        spec: ["blocking"],
        remembered: { cancel: true },
        off: [null, { blockServiceWorker: false }],
        on: [{ cancel: true }, { blockServiceWorker: true }],
    });
});

test("Chrome's background script keeps x.com's service worker script from loading with rules of its own while the setting says so", async ({ page }) => {
    await openPage(page);
    const result = await page.evaluate(async source => {
        let listener;
        const updates = [];
        self.importScripts = () => {};
        window.chrome = { runtime: { onMessage: { addListener: fn => { listener = fn; } } }, declarativeNetRequest: { updateDynamicRules: update => updates.push(update) } };
        new Function(source)();
        listener({ action: "otdServiceWorker", block: true }, { tab: { id: 3 } }, () => {});
        listener({ action: "otdServiceWorker", block: false }, { tab: { id: 3 } }, () => {});
        return updates;
    }, read("src/background3.js"));
    expect(result).toEqual([
        { removeRuleIds: [100, 101], addRules: [
            { id: 100, priority: 1, action: { type: "block" }, condition: { urlFilter: "|https://x.com/sw.js" } },
            { id: 101, priority: 1, action: { type: "block" }, condition: { urlFilter: "|https://twitter.com/sw.js" } },
        ] },
        { removeRuleIds: [100, 101], addRules: [] },
    ]);
});

test("Firefox's background script keeps x.com's app off TweetDeck's page, but lets main.js be read for its GraphQL ids", async ({ page }) => {
    await firefoxBackground(page);
    const result = await page.evaluate(() => {
        const [navigation] = window.__listeners.navigation;
        navigation.fn({ tabId: 7, frameId: 0, url: "https://x.com/i/tweetdeck", transitionType: "link" });
        const blocker = window.__listeners.request.find(l => l.filter.urls.includes("https://abs.twimg.com/*"));
        const asked = (path, type, tabId = 7) => !!blocker.fn({ url: `https://abs.twimg.com/responsive-web/client-web/${path}`, type, tabId, frameId: 0 })?.cancel;
        return {
            // x.com's own <script>s
            scripts: [asked("main.2313f56808170e13a.js", "script"), asked("bundle.Spaces.abc.js", "script"), asked("ondemand.s.abc.js", "script"), asked("vendor.abc.js", "script")],
            // what interception.js and challenge.js read by fetch
            fetched: [asked("main.2313f56808170e13a.js", "xmlhttprequest"), asked("ondemand.s.abc.js", "xmlhttprequest"), asked("bundle.Spaces.abc.js", "xmlhttprequest")],
            // another tab, not TweetDeck's
            other: asked("main.2313f56808170e13a.js", "script", 8),
        };
    });
    expect(result).toEqual({ scripts: [true, true, false, false], fetched: [false, false, true], other: false });
});
