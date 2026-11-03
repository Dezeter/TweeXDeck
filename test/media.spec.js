const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts, addAccount } = require("./helpers");

test.use({ viewport: { width: 600, height: 900 } });

// A column with tweets TweetDeck rendered: one tall photo, two photos, one wide photo in a retweet, a video,
// and text only. columnManager knows them and the column's media preview size (Small: the square) the way
// TweetDeck's does. 440px wide: a tweet's body has room for the square beside its text; 340px: it hasn't
async function openColumn(page, storage, width = 440, size = "small") {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(([width, size]) => {
        window.__size = size;
        TD.settings.getColumnWidth = () => "medium";
        const user = (id, screenName) => ({ id_str: id, screen_name: screenName, name: screenName, profile_image_url_https: "", entities: {} });
        const photo = (id, w, h) => ({ id_str: id, type: "photo", media_url_https: `https://pbs.twimg.com/media/P${id}.jpg`, original_info: { width: w, height: h },
            sizes: { large: { w, h, resize: "fit" }, medium: { w, h, resize: "fit" }, small: { w, h, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } },
            url: "https://t.co/m", display_url: "pic.x.com/m", expanded_url: `https://x.com/i/status/${id}/photo/1`, indices: [5, 18] });
        const video = { ...photo("40", 1280, 720), type: "video", media_url_https: "https://pbs.twimg.com/ext_tw_video_thumb/40/pu/img/V40.jpg",
            video_info: { aspect_ratio: [16, 9], variants: [
                { content_type: "application/x-mpegURL", url: "https://video.twimg.com/ext_tw_video/40/pu/pl/x.m3u8" },
                { content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/ext_tw_video/40/pu/vid/640x360/low.mp4?tag=12" },
                { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/ext_tw_video/40/pu/vid/1280x720/best.mp4?tag=12" },
            ] } };
        const tweet = (id, author, media) => ({ id_str: id, full_text: "look https://t.co/m", text: "look https://t.co/m", created_at: new Date().toUTCString(), source: "web", user: author,
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [], media }, extended_entities: { media } });
        const alice = user("10", "alice"), bob = user("20", "bob");
        const chirps = [
            window.__client.processTweet(tweet("100", alice, [photo("1", 1000, 4000)])),
            window.__client.processTweet(tweet("200", alice, [photo("2", 800, 600), photo("3", 800, 600)])),
            window.__client.processTweet({ ...tweet("301", bob, []), retweeted_status: tweet("300", alice, [photo("4", 2000, 1000)]) }),
            window.__client.processTweet(tweet("400", alice, [video])),
            window.__client.processTweet({ ...tweet("500", alice, []), full_text: "just text", text: "just text" }),
        ];
        window.__chirps = Object.fromEntries(chirps.map(c => [c.id, c]));
        TD.controller.columnManager = {
            get: key => key === "c1" ? { findChirp: id => window.__chirps[id], getMediaPreviewSize: () => window.__size } : null,
            findChirpByAccountKey: ({ chirpId, columnKey }) => columnKey === "c1" ? window.__chirps[chirpId] : null,
        };
        document.body.insertAdjacentHTML("beforeend", `<section class="js-column column" data-column="c1" style="width:${width}px;display:block"><div class="js-column-scroller column-scroller"><div class="js-chirp-container chirp-container"></div></div></section>`);
        const container = document.querySelector(".js-chirp-container");
        for(const chirp of chirps) container.insertAdjacentHTML("beforeend", chirp.render({ mediaPreviewSize: size }));
        window.__messages = [];
        window.addEventListener("message", e => { if(e.data?.action === "otdDownload") window.__messages.push(e.data); });
    }, [width, size]);
    await addScripts(page, "src/otd-common.js", "src/media-layout.js", "src/download-media.js", "src/inline-video.js");
    await page.waitForTimeout(300);
}

const previews = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".js-chirp-container > article")].map(article => {
    const links = [...article.querySelectorAll(".js-media-image-link")];
    return [article.dataset.key, links.map(link => ({ aspect: link.classList.contains("otd-aspect"), ratio: Math.round(link.getBoundingClientRect().height / link.getBoundingClientRect().width * 100) / 100 }))];
})));

// where a tweet's square, text and buttons are, from the tweet's left
const thumbs = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".js-chirp-container > article")].map(article => {
    const box = el => el && el.getBoundingClientRect();
    const media = box(article.querySelector(".tweet-body > .js-media"));
    const text = article.querySelector(".tweet-text");
    // the text's words: its box goes on under the square
    const range = document.createRange();
    range.selectNodeContents(text);
    const words = [...range.getClientRects()].filter(r => r.width > 0);
    const footer = box(article.querySelector(".tweet-actions"));
    const tweet = box(article.querySelector(".tweet"));
    const more = article.querySelector(".tweet-body > .js-media")?.dataset.otdMore ?? null;
    return [article.dataset.key, media && media.height > 0 ? {
        square: [Math.round(media.width), Math.round(media.height)],
        right: Math.round(tweet.right - media.right),
        // the text beside it, the buttons under it, the tweet's last line
        beside: words.length > 0 && words.every(r => r.right <= media.left - 12 + 0.5) && footer.top >= media.bottom - 0.5,
        top: Math.round(media.top - box(text).top),
        more,
    } : null];
})));

test("media are a square beside the text: TweetDeck's first of several with \"+1\", a play badge on a video; text alone as it was", async ({ page }) => {
    await openColumn(page);
    const result = await thumbs(page);
    const square = { square: [80, 80], right: 0, beside: true, top: 0, more: null };
    expect(result).toEqual({ "100": square, "200": { ...square, more: "+1" }, "301": square, "400": square, "500": null });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-key="400"] .is-video'), "::after").width)).toBe("28px");
    // the second of the two is TweetDeck's, hidden
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-key="200"] .js-media-preview-container')].map(c => getComputedStyle(c).display))).toEqual(["block", "none"]);
});

test("in a column without room for the square, TweetDeck's own preview under the text; widened, the square, and back", async ({ page }) => {
    await openColumn(page, {}, 340);
    // TweetDeck's preview: the body's width, as tall as TweetDeck makes it; or the square
    const look = async () => Object.fromEntries(Object.entries(await thumbs(page)).filter(([, t]) => t).map(([key, t]) => [key, t.square[0] === 80 ? "square" : t.square[0] === 274 && t.square[1] <= 280 ? "preview" : t.square.join("x")]));
    const all = kind => ({ "100": kind, "200": kind, "301": kind, "400": kind });
    expect(await look()).toEqual(all("preview"));
    expect(await page.evaluate(() => document.querySelector('[data-key="100"] .tweet-body').classList.contains("otd-has-thumb"))).toBe(false);
    await page.evaluate(() => {
        document.querySelector(".js-column").style.width = "440px";
        window.dispatchEvent(new Event("resize"));
    });
    await expect.poll(look).toEqual(all("square"));
    await page.evaluate(() => {
        document.querySelector(".js-column").style.width = "340px";
        window.dispatchEvent(new Event("resize"));
    });
    await expect.poll(look).toEqual(all("preview"));
});

test("TweetDeck's small preview fills the square", async ({ page }) => {
    await openColumn(page);
    // TweetDeck's small preview is half the tweet's width
    expect(await page.locator('[data-key="100"] .js-media-image-link.media-size-small').count()).toBe(1);
    await expect.poll(() => page.evaluate(() => {
        const box = el => el.getBoundingClientRect();
        const square = box(document.querySelector('[data-key="100"] .tweet-body > .js-media'));
        const image = box(document.querySelector('[data-key="100"] .js-media-image-link'));
        return [Math.round(square.width), Math.round(square.height), Math.round(image.width), Math.round(image.height), Math.round(image.left - square.left)];
    })).toEqual([80, 80, 80, 80, 0]);
});

test("a GIF that is a reply plays whole, as TweetDeck shows it; a GIF of a tweet is a square", async ({ page }) => {
    await openColumn(page);
    await page.evaluate(() => {
        const user = { id_str: "20", screen_name: "bob", name: "bob", profile_image_url_https: "", entities: {} };
        const gif = { id_str: "9", type: "animated_gif", media_url_https: "https://pbs.twimg.com/tweet_video_thumb/G9.jpg", original_info: { width: 480, height: 270 },
            sizes: { large: { w: 480, h: 270, resize: "fit" }, medium: { w: 480, h: 270, resize: "fit" }, small: { w: 480, h: 270, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } },
            url: "https://t.co/g", display_url: "pic.x.com/g", expanded_url: "https://x.com/i/status/9/photo/1", indices: [7, 30],
            video_info: { aspect_ratio: [16, 9], variants: [{ content_type: "video/mp4", bitrate: 0, url: "https://video.twimg.com/tweet_video/G9.mp4" }] } };
        const tweet = (id, extra) => ({ id_str: id, full_text: "@alice https://t.co/g", text: "@alice https://t.co/g", created_at: new Date().toUTCString(), source: "web", user,
            entities: { hashtags: [], user_mentions: [{ id_str: "10", screen_name: "alice", name: "alice", indices: [0, 6] }], symbols: [], urls: [], media: [gif] }, extended_entities: { media: [gif] }, ...extra });
        for(const chirp of [window.__client.processTweet(tweet("700", { in_reply_to_status_id_str: "100", in_reply_to_user_id_str: "10", in_reply_to_screen_name: "alice" })), window.__client.processTweet(tweet("800", {}))]) {
            window.__chirps[chirp.id] = chirp;
            document.querySelector(".js-chirp-container").insertAdjacentHTML("beforeend", chirp.render({ mediaPreviewSize: window.__size }));
        }
    });
    await expect.poll(async () => (await thumbs(page))["800"]?.square).toEqual([80, 80]);
    // TweetDeck's small preview of it, under the text
    expect((await thumbs(page))["700"]).toMatchObject({ beside: false });
    expect(await page.$eval('[data-key="700"] .tweet-body', body => body.classList.contains("otd-has-thumb"))).toBe(false);
});

// the column's media preview size picked in its options: TweetDeck renders its tweets again (reloadTweets)
const pickSize = (page, size) => page.evaluate(size => {
    window.__size = size;
    const container = document.querySelector(".js-chirp-container");
    container.innerHTML = Object.values(window.__chirps).map(chirp => chirp.render({ mediaPreviewSize: size })).join("");
}, size);

test("Medium and Large, TweetDeck's own: the media under the text; picked Small again, the square", async ({ page }) => {
    await openColumn(page);
    const order = () => page.evaluate(() => [...document.querySelector('[data-key="100"] .tweet-body').children].map(c => c.classList[0]));
    expect(await order()).toEqual(["js-media", "nbfc", "js-tweet-text", "js-card-container"]);
    await pickSize(page, "medium");
    await expect.poll(order).toEqual(["nbfc", "js-tweet-text", "js-card-container", "js-media"]);
    expect((await thumbs(page))["100"]).toMatchObject({ beside: false });
    // Large: TweetDeck's own under the whole tweet
    await pickSize(page, "large");
    await expect.poll(order).toEqual(["nbfc", "js-tweet-text", "js-card-container"]);
    expect(await page.locator('[data-key="100"] .js-media-image-link.media-size-large').count()).toBe(1);
    expect(await page.locator(".otd-has-thumb, .otd-quote-thumb").count()).toBe(0);
    await pickSize(page, "small");
    await expect.poll(async () => (await thumbs(page))["100"]).toMatchObject({ square: [80, 80], beside: true });
});

test("the Small option of a column's media preview size shows the square beside the text; the others are TweetDeck's", async ({ page }) => {
    await openColumn(page);
    const pictures = await page.evaluate(async () => {
        const item = (value, text) => `<div class="js-toggle-item toggle-item pull-left padding-r--8" data-value="${value}"><span class="toggle-item-text txt-size--11 txt-mute">${text}</span>`
            + `<img class="media-size-image js-unselected-media block margin-t--5" src="https://ton.twimg.com/tweetdeck-web/web/assets/global/backgrounds/${value}-unselected.png" />`
            + `<img class="media-size-image js-selected-media block margin-t--5 is-hidden" src="https://ton.twimg.com/tweetdeck-web/web/assets/global/backgrounds/${value}-selected.png" /></div>`;
        document.body.insertAdjacentHTML("beforeend", `<div class="otd-test-sizes">${item("off", "Hidden")}${item("small", "Small")}${item("medium", "Medium")}${item("large", "Large")}</div>`);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return [...document.querySelectorAll(".otd-test-sizes img")].map(img => img.getAttribute("src").startsWith("data:image/svg+xml") ? `square ${decodeURIComponent(img.src).includes("#257abb") ? "picked" : "other"}` : img.getAttribute("src").split("/").pop());
    });
    expect(pictures).toEqual(["off-unselected.png", "off-selected.png", "square other", "square picked", "medium-unselected.png", "medium-selected.png", "large-unselected.png", "large-selected.png"]);
});

test("a video in a square opens its tweet to full width and plays there", async ({ page }) => {
    await openColumn(page);
    await page.click('[data-key="400"] .js-media-image-link');
    expect(await page.evaluate(() => [document.querySelector('[data-key="400"] .tweet-body').classList.contains("otd-has-thumb"), !!document.querySelector('[data-key="400"] .otd-inline-video')])).toEqual([false, true]);
    expect(await page.evaluate(() => Math.round(document.querySelector('[data-key="400"] .otd-inline-video').getBoundingClientRect().width))).toBe(374);
});

test("a quote rises beside the square after a short text, goes under it whole when it would hang over it by less than a line; a quoted tweet's media are a smaller square in it", async ({ page }) => {
    // the page's errors, the load watchdog's report has them
    await page.addInitScript(() => {
        window.__errors = [];
        window.addEventListener("error", e => window.__errors.push(e.message));
    });
    await openColumn(page);
    const quote = await page.evaluate(() => {
        const quoted = window.__chirps["100"];
        const json = { id_str: "600", full_text: "see", text: "see", created_at: new Date().toUTCString(), source: "web", user: quoted.user ? { id_str: "20", screen_name: "bob", name: "bob", profile_image_url_https: "", entities: {} } : null,
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [] }, is_quote_status: true, quoted_status_id_str: "100" };
        const photo = window.__chirps["300"]?.getMedia?.()[0]?.entity || window.__chirps["301"].retweetedStatus.getMedia()[0].entity;
        const withQuote = window.__client.processTweet({ ...json, quoted_status: { id_str: "100", full_text: "tall", text: "tall", created_at: new Date().toUTCString(), source: "web", user: { id_str: "10", screen_name: "alice", name: "alice", profile_image_url_https: "", entities: {} },
            entities: { hashtags: [], user_mentions: [], symbols: [], urls: [], media: [photo] }, extended_entities: { media: [photo] } }, entities: { ...json.entities, media: [photo] }, extended_entities: { media: [photo] } });
        window.__chirps["600"] = withQuote;
        document.querySelector(".js-chirp-container").insertAdjacentHTML("beforeend", withQuote.render({ mediaPreviewSize: window.__size }));
        return true;
    });
    expect(quote).toBe(true);
    const layout = () => page.evaluate(() => {
        const article = document.querySelector('[data-key="600"]');
        const box = el => el.getBoundingClientRect();
        const square = box(article.querySelector(".tweet-body > .js-media"));
        const card = box(article.querySelector(".js-quote-detail"));
        const inner = box(article.querySelector(".js-quote-detail .js-media"));
        return { place: card.top >= square.bottom ? "under" : card.right <= square.left - 12 + 0.5 ? "beside" : "over", width: Math.round(card.width), inQuote: [Math.round(inner.width), Math.round(inner.height)] };
    });
    // "see" and the square 80px down: the quote beside it, 92px narrower
    await expect.poll(layout).toEqual({ place: "beside", width: 282, inQuote: [64, 64] });
    // the text longer (as a translation makes it), the square over the quote by this much
    const overhang = px => page.evaluate(px => {
        const article = document.querySelector('[data-key="600"]');
        const text = article.querySelector(".tweet-text");
        const media = article.querySelector(".tweet-body > .js-media");
        text.style.paddingBottom = "0px";
        const gap = Math.max(parseFloat(getComputedStyle(text).marginBottom), parseFloat(getComputedStyle(article.querySelector(".js-quote-detail")).marginTop));
        const bottom = media.getBoundingClientRect().bottom + parseFloat(getComputedStyle(media).marginBottom);
        text.style.paddingBottom = `${bottom - px - gap - text.getBoundingClientRect().bottom}px`;
    }, px);
    await overhang(10);
    await expect.poll(layout).toEqual({ place: "under", width: 374, inQuote: [64, 64] });
    await overhang(40);
    await expect.poll(layout).toEqual({ place: "beside", width: 282, inQuote: [64, 64] });
    // past the square: under it anyway
    await overhang(-20);
    await expect.poll(layout).toEqual({ place: "under", width: 374, inQuote: [64, 64] });
    expect(await page.$eval('[data-key="600"] .js-quote-detail', quote => quote.classList.contains("otd-quote-under"))).toBe(false);
    // the quote moved after the browser measured: in the next frame, not a "ResizeObserver loop" error
    expect(await page.evaluate(() => window.__errors)).toEqual([]);
});

test("whole: a single image of Medium and Large in its own proportions, no taller than half the screen", async ({ page }) => {
    await openColumn(page, { OTDmedia: "whole" }, 440, "medium");
    const result = await previews(page);
    // a very tall (1:4) photo: capped at 50vh = 450px
    expect(result["100"]).toHaveLength(1);
    expect(result["100"][0].aspect).toBe(true);
    expect(await page.evaluate(() => Math.round(document.querySelector('[data-key="100"] .js-media-image-link').getBoundingClientRect().height))).toBe(450);
    // two photos: TweetDeck's grid as it was
    expect(result["200"].every(p => !p.aspect)).toBe(true);
    // wide (2:1) photo of a retweet: full proportion
    expect(result["301"]).toEqual([{ aspect: true, ratio: 0.5 }]);
    // a video keeps TweetDeck's preview
    expect(result["400"].every(p => !p.aspect)).toBe(true);
});

test("TweetDeck's strip, picked as OTDmedia=strip or with the switch before 5.15 off, is what nothing picked is now", async ({ page }) => {
    for(const storage of [{ OTDmedia: "strip" }, { OTDmediaAspect: "0" }, { OTDmediaAspect: "1" }]) {
        await openColumn(page, storage, 440, "medium");
        expect(await page.evaluate(() => [localStorage.OTDmedia ?? null, localStorage.OTDmediaAspect ?? null])).toEqual([null, null]);
        // the tall photo in TweetDeck's strip, not whole
        expect(await page.evaluate(() => [document.documentElement.classList.contains("otd-media-whole"), Math.round(document.querySelector('[data-key="100"] .js-media-image-link').getBoundingClientRect().height)])).toEqual([false, 130]);
        await page.evaluate(() => localStorage.clear());
    }
});

test("in a Small column a large link card is X's small one, its picture beside the title; in a Medium one TweetDeck's", async ({ page }) => {
    await openPage(page);
    await addTweetDeck(page);
    const cards = await page.evaluate(() => {
        window.__cards = [];
        TD.ui.Column.prototype.loadCard = function(chirp) { window.__cards.push([chirp.card.name, chirp.card.binding_values.thumbnail_image_original?.image_value.url ?? null, chirp.id]); };
        return true;
    });
    expect(cards).toBe(true);
    await addScripts(page, "src/otd-common.js", "src/media-layout.js");
    expect(await page.evaluate(() => {
        // TD.ui.Column of a column by its key, which is its size here
        TD.controller.columnManager = { get: key => ({ getMediaPreviewSize: () => key }) };
        const ui = key => ({ state: { columnKey: key } });
        const picture = { type: "IMAGE", image_value: { url: "https://pbs.twimg.com/card_img/1/large.jpg", width: 1200, height: 628 } };
        const chirp = { id: "7", card: { name: "summary_large_image", binding_values: { summary_photo_image_original: picture, title: { string_value: "t" } } } };
        TD.ui.Column.prototype.loadCard.call(ui("small"), chirp, "home");
        TD.ui.Column.prototype.loadCard.call(ui("small"), { id: "8", card: { name: "summary", binding_values: {} } }, "home");
        TD.ui.Column.prototype.loadCard.call(ui("medium"), chirp, "home");
        return [window.__cards, chirp.card.name];
    })).toEqual([[["summary", "https://pbs.twimg.com/card_img/1/large.jpg", "7"], ["summary", null, "8"], ["summary_large_image", null, "7"]], "summary_large_image"]);
});

// opens the "…" menu of a tweet the way TweetDeck renders it, and clicks "Download media" if it's there
async function download(page, key) {
    return page.evaluate(key => {
        window.__messages = [];
        const article = document.querySelector(`.js-chirp-container > article[data-key="${key}"]`);
        article.querySelector('[rel="actionsMenu"]').click();
        const chirp = window.__chirps[key];
        const menu = document.createElement("div");
        menu.className = "js-dropdown dropdown-menu";
        menu.innerHTML = TD.ui.template.render("menus/actions", { chirp: chirp.getRelatedTweet?.() || chirp, user: chirp.getMainUser() });
        article.append(menu);
        const item = menu.querySelector('[data-otd-action="download-media"]');
        if(!item) return null;
        item.click();
        return new Promise(resolve => setTimeout(() => resolve({ label: item.textContent, messages: window.__messages }), 50));
    }, key);
}

test("\"Download media\" in the menu saves photos at full size and videos at the best quality", async ({ page }) => {
    await openColumn(page);
    expect(await download(page, "100")).toEqual({ label: "Download media", messages: [
        { action: "otdDownload", url: "https://pbs.twimg.com/media/P1?format=jpg&name=orig", filename: "alice_100.jpg" },
    ] });
    expect((await download(page, "200")).messages.map(m => m.filename)).toEqual(["alice_200_1.jpg", "alice_200_2.jpg"]);
    // a retweet saves the retweeted tweet's media under its author
    expect((await download(page, "301")).messages).toEqual([
        { action: "otdDownload", url: "https://pbs.twimg.com/media/P4?format=jpg&name=orig", filename: "alice_300.jpg" },
    ]);
    expect((await download(page, "400")).messages).toEqual([
        { action: "otdDownload", url: "https://video.twimg.com/ext_tw_video/40/pu/vid/1280x720/best.mp4?tag=12", filename: "alice_400.mp4" },
    ]);
    // no media, no item
    expect(await download(page, "500")).toBeNull();
});

test("OTDdownloadMedia=0 leaves the menu as it was", async ({ page }) => {
    await openColumn(page, { OTDdownloadMedia: "0" });
    expect(await download(page, "100")).toBeNull();
});

// content.js passes only X's media hosts on to the background script
test("content.js forwards downloads from this page to the background, for X's media only", async ({ page }) => {
    await openPage(page);
    const sent = await page.evaluate(async source => {
        const sent = [];
        window.chrome = { runtime: { getURL: () => "", sendMessage: message => sent.push(message) } };
        new Function(source)();
        window.postMessage({ action: "otdDownload", url: "https://pbs.twimg.com/media/P1?format=jpg&name=orig", filename: "a.jpg" }, "*");
        window.postMessage({ action: "otdDownload", url: "https://evil.example/x.exe", filename: "x.exe" }, "*");
        await new Promise(resolve => setTimeout(resolve, 100));
        return sent;
    }, require("fs").readFileSync(require("path").join(__dirname, "../src/content.js"), "utf8"));
    expect(sent).toEqual([{ action: "download", url: "https://pbs.twimg.com/media/P1?format=jpg&name=orig", filename: "a.jpg" }]);
});

test("the background script saves only X's media", async ({ page }) => {
    await openPage(page);
    const downloads = await page.evaluate(source => {
        const downloads = [];
        let listener;
        window.importScripts = () => {};
        window.chrome = { runtime: { onMessage: { addListener: fn => { listener = fn; } } }, downloads: { download: options => downloads.push(options) } };
        new Function(source)();
        listener({ action: "download", url: "https://video.twimg.com/ext_tw_video/40/pu/vid/1280x720/best.mp4?tag=12", filename: "alice_400.mp4" }, {}, () => {});
        listener({ action: "download", url: "https://evil.example/x.exe", filename: "x.exe" }, {}, () => {});
        return downloads;
    }, require("fs").readFileSync(require("path").join(__dirname, "../src/background3.js"), "utf8"));
    expect(downloads).toEqual([{ url: "https://video.twimg.com/ext_tw_video/40/pu/vid/1280x720/best.mp4?tag=12", filename: "alice_400.mp4", conflictAction: "uniquify" }]);
});
