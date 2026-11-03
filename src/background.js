const extraInfoSpec = ["blocking", "responseHeaders"];
if (chrome.webRequest.OnHeadersReceivedOptions.hasOwnProperty("EXTRA_HEADERS")) {
    extraInfoSpec.push("extraHeaders");
}

// x.com's policies for its own app, which would block TweetDeck: its CSP blocks the scripts injection.js adds,
// and with cross-origin isolation (COOP / COEP, sent since late October 2026) Firefox switches the page to a new
// process and keeps the CSP. Location: x.com redirects /i/tweetdeck elsewhere.
const STRIPPED_HEADERS = [
    'content-security-policy',
    'content-security-policy-report-only',
    'cross-origin-opener-policy',
    'cross-origin-opener-policy-report-only',
    'cross-origin-embedder-policy',
    'cross-origin-embedder-policy-report-only',
    'location',
];

const TWEETDECK_PAGE = ["https://twitter.com/i/tweetdeck", "https://x.com/i/tweetdeck", "https://x.com/i/tweetdeck?*"];
const policiesOf = headers => headers.map(header => header.name.toLowerCase()).filter(name => STRIPPED_HEADERS.includes(name));

// what this script saw of TweetDeck's page, by tab, for the load watchdog's report (watchdog.js): when, what it
// took off, and what of it the page still had after every extension's listener
const pages = {};

function stripPolicies(details) {
    let headers = details.responseHeaders.filter(header => !STRIPPED_HEADERS.includes(header.name.toLowerCase()));
    if(details.type === "main_frame") {
        pages[details.tabId] = {
            status: details.statusCode,
            fromCache: !!details.fromCache,
            stripped: policiesOf(details.responseHeaders),
            at: Date.now(),
            requestId: details.requestId,
        };
    }
    return {
        responseHeaders: headers
    }
}
// Firefox applies what the extensions' listeners return in the order they started listening, and a CSP one of them
// sets after this one took x.com's off is merged with nothing and stays: an extension that rewrites x.com's policy
// (to let its own scripts in) and started listening later gives the page x.com's policy back. Listening anew
// before each request for TweetDeck's page makes this listener the last one.
let stripping = null;
function listenLast() {
    const listener = details => stripPolicies(details);
    // the new one before the old one goes, so a response between the two still has one
    chrome.webRequest.onHeadersReceived.addListener(listener, {urls: TWEETDECK_PAGE}, extraInfoSpec);
    if(stripping) chrome.webRequest.onHeadersReceived.removeListener(stripping);
    stripping = listener;
}
listenLast();
chrome.webRequest.onSendHeaders.addListener(() => listenLast(), {urls: TWEETDECK_PAGE, types: ["main_frame"]});
chrome.webRequest.onResponseStarted.addListener(
    function(details) {
        const page = pages[details.tabId];
        if(page?.requestId === details.requestId) page.left = policiesOf(details.responseHeaders || []);
    },
    {urls: TWEETDECK_PAGE, types: ["main_frame"]},
    ["responseHeaders"]
);

// Settings "blockServiceWorker": x.com's service worker script isn't loaded, so x.com can't register it again and
// answer TweetDeck's page from its cache; kept in storage.local
let blockServiceWorker = false;
chrome.storage.local.get({ blockServiceWorker: false }, items => {
    blockServiceWorker = !!items?.blockServiceWorker;
});
chrome.webRequest.onBeforeRequest.addListener(
    function() {
        if(blockServiceWorker) return { cancel: true };
    },
    {urls: ["https://x.com/sw.js*", "https://twitter.com/sw.js*"]},
    ["blocking"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
        let headers = details.requestHeaders.filter(header => header.name.toLowerCase() !== 'referer');
        return {
            requestHeaders: headers
        }
    },
    {urls: ["https://twitter.com/i/api/graphql/*", "https://x.com/i/api/graphql/*"]},
    extraInfoSpec.map(s => s.replace('response', 'request'))
)

chrome.webRequest.onBeforeRequest.addListener(
    function() {
        return {
            redirectUrl: 'https://twitter.com/i/tweetdeck'
        }
    },
    {urls: ["https://tweetdeck.twitter.com/*", "https://tweetdeck.x.com/*"]},
    ["blocking"]
);

chrome.webRequest.onBeforeRequest.addListener(
    function() {
        return {
            redirectUrl: 'https://twitter.com/i/tweetdeck'
        }
    },
    {urls: ["https://tweetdeck.com/*"]},
    ["blocking"]
);

const isFirefox = typeof browser !== "undefined";

// Store the URL of the tab that initiated the request.
let urls = {};

const flushCache = chrome.webRequest.handlerBehaviorChanged;

chrome.webNavigation.onCommitted.addListener(
    function (details) {
        // Flushes in-memory cache when moving from other twitter.com sites to TweetDeck,
        // because if cache hits, `onBeforeRequest` event won't be called (and thus we can't block unwanted requests below).
        // Only needed in Chrome. See: https://developer.chrome.com/docs/extensions/reference/webRequest/#caching
        if (
            !isFirefox &&
            (urls[details.tabId]?.[details.frameId].startsWith("https://twitter.com/") || urls[details.tabId]?.[details.frameId].startsWith("https://x.com/")) &&
            details.transitionType !== "reload" &&
            (details.url === "https://twitter.com/i/tweetdeck" || details.url === "https://x.com/i/tweetdeck")
        ) {
            flushCache();
        // Update stored URL
        }
        if (details.tabId === -1 || details.frameId !== 0) {
            return;
        }
        if (!urls.hasOwnProperty(details.tabId)) {
            urls[details.tabId] = {};
        }
        urls[details.tabId][details.frameId] = details.url;
    },
    { url: [{ hostSuffix: "twitter.com" }, { hostSuffix: "x.com" }] },
);

// Block requests for files related to Web App on TweetDeck's page, so x.com's own app doesn't start there. Not the
// ones read rather than run: ondemand.s and vendor, and main.{random}.js read by fetch, whose GraphQL ids and features
// interception.js looks up (graphqlQuery); x.com's own <script> of it is still blocked.
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        try {
            let parsedUrl = new URL(details.url);
            let path = parsedUrl.pathname;
            // want to use details.originUrl but it's not available in Chrome
            let requestFrom = urls[details.tabId][details.frameId];
            if (
                (
                    path.startsWith("/responsive-web/client-web-legacy/") ||
                    path.startsWith("/responsive-web/client-web/")
                ) &&
                (requestFrom === "https://twitter.com/i/tweetdeck" || requestFrom === "https://x.com/i/tweetdeck") &&
                !path.includes('ondemand.s.') &&
                !path.includes('vendor.') &&
                !(details.type === "xmlhttprequest" && /\/main\.[\w-]+\.js$/.test(path))
            ) {
                return {
                    cancel: true,
                };
            }
        } catch (e) {}
    },
    { urls: ["https://abs.twimg.com/*"] },
    ["blocking"],
);

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if(request.action === 'setcookie') {
        chrome.cookies.getAll({url: "https://x.com"}, async cookies => {
            console.log('setcookie', cookies);
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, tab => {
                tab = tab[0];
                chrome.cookies.getAllCookieStores(async cookieStores => {
                    console.log('cookieStores', cookieStores, tab);
                    const storeId = cookieStores?.find( cookieStore => cookieStore?.tabIds?.indexOf(tab?.id) !== -1)?.id;

                    for(let cookie of cookies) {
                        chrome.cookies.set({
                            url: "https://twitter.com",
                            name: cookie.name,
                            value: cookie.value,
                            expirationDate: cookie.expirationDate,
                            domain: ".twitter.com",
                            sameSite: cookie.sameSite,
                            secure: cookie.secure,
                            httpOnly: cookie.httpOnly,
                            storeId
                        }, () => {
                            console.log('set cookie', cookie, storeId);
                        });
                    }
                });
            });
        });
    } else if(request.action === 'getcookie') {
        chrome.cookies.getAll({url: "https://x.com"}, async cookies => {
            console.log('getcookie', cookies);
            sendResponse(cookies);
        });
        return true;
    } else if(request.action === 'download') {
        // from download-media.js through content.js
        if(/^https:\/\/(pbs|video)\.twimg\.com\//.test(request.url)) chrome.downloads.download({ url: request.url, filename: request.filename, conflictAction: 'uniquify' });
    } else if(request.action === 'googleTranslate') {
        // this listener is async, so Firefox takes the returned value as the response
        const response = await googleTranslate(request.text, request.to);
        sendResponse(response);
        return response;
    } else if(request.action === 'otdPage') {
        // from the load watchdog through content.js: what this script saw of the tab's page
        const page = pages[sender.tab?.id] || null;
        sendResponse(page);
        return page;
    } else if(request.action === 'otdServiceWorker') {
        blockServiceWorker = request.block === true;
        chrome.storage.local.set({ blockServiceWorker });
    }
});