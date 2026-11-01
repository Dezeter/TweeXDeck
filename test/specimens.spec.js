// Every kind of tweet TweetDeck draws, with this extension's look: in a home column (text, a reply, a retweet,
// photos, video, a GIF, sensitive media, quotes, link cards, a poll), in notifications, and opened in a column.
// The tests check what holds for all of them; SPECIMENS_OUT=<dir> also saves a picture of each, for a look.
// X's pictures and avatars are drawn here, in the proportions of the media.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { openPage, addTweetDeck, addAccount, addScripts } = require("./helpers");

// pictures sharp on a high-density screen
if(process.env.SPECIMENS_OUT) test.use({ deviceScaleFactor: 2 });

const COLORS = ["#7a5cfa", "#e0245e", "#17bf63", "#ffad1f", "#1d9bf0", "#f45d22", "#794bc4", "#00a5a5"];
// a picture of the given proportions, in place of X's media
const picture = (w, h, i) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COLORS[i % 8]}"/><stop offset="1" stop-color="${COLORS[(i + 3) % 8]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * .7}" cy="${h * .3}" r="${Math.min(w, h) * .12}" fill="#fff" opacity=".7"/><path d="M0 ${h} L${w * .35} ${h * .55} L${w * .6} ${h * .8} L${w * .8} ${h * .6} L${w} ${h} Z" fill="#000" opacity=".25"/></svg>`;
const avatar = i => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${COLORS[i % 8]}"/><circle cx="48" cy="38" r="18" fill="#fff" opacity=".85"/><ellipse cx="48" cy="92" rx="34" ry="26" fill="#fff" opacity=".85"/></svg>`;

const SIZES = { 1: [1600, 900], 2: [900, 1200], 3: [1200, 1200], 4: [800, 600], 5: [800, 600], 6: [800, 600], 7: [800, 600], 8: [1280, 720], 9: [480, 270], 10: [1000, 1000], 11: [1200, 628], 12: [1200, 628], 13: [400, 400], 14: [1500, 1000] };

async function stand(page, { dark = false, width = "medium", media = "", density = "", storage = {} } = {}) {
    await openPage(page, {
        storage: { ...storage, ...(media ? { OTDmedia: media } : {}), ...(density ? { OTDdensity: density } : {}) },
        routes: {
            "https://pbs.twimg.com/": route => {
                const url = route.request().url();
                const avatarId = url.match(/profile_images\/(\d+)/)?.[1];
                if(avatarId) return route.fulfill({ contentType: "image/svg+xml", body: avatar(+avatarId) });
                const id = +(url.match(/(?:media|img|thumb|card_img)\/[A-Za-z]*(\d+)/)?.[1] || 1);
                const [w, h] = SIZES[id] || [800, 600];
                return route.fulfill({ contentType: "image/svg+xml", body: picture(w, h, id) });
            },
        },
    });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(([dark, width]) => {
        if(dark) document.documentElement.classList.add("dark");
        window.__account.isContributor = () => false;
        // the counts next to the buttons, as people have them
        TD.controller.stats.isInExperimentBucket = (experiment, bucket) => experiment === "live_engagement_in_column_8020" && bucket === "live_engagement_enabled";
        TD.settings.getColumnWidth = () => width;
        TD.settings.getTheme = () => dark ? "dark" : "light";
        TD.ui.main.updateColumnSize();
        const decider = TD.decider.get;
        TD.decider.get = key => key === "multi_photo_media_grid" ? true : decider.call(TD.decider, key);
        let n = 0;
        const user = (id, name, extra = {}) => ({ id_str: id, id: +id, screen_name: name.replace(/\W/g, ""), name, profile_image_url_https: `https://pbs.twimg.com/profile_images/${n++}/a_normal.jpg`, entities: { description: { urls: [] }, url: { urls: [] } }, description: "", followers_count: 1200, friends_count: 300, ...extra });
        const U = window.U = { me: user("1", "Dezeter"), a: user("11", "Badlynasty", { verified: true }), b: user("12", "Pantea.AEW"), c: user("13", "Zh0u"), d: user("14", "RAEN Foundation"), e: user("15", "Audrey"), f: user("16", "bloodredfrog") };
        const photo = (id, type = "photo") => {
            const [w, h] = { 1: [1600, 900], 2: [900, 1200], 3: [1200, 1200], 4: [800, 600], 5: [800, 600], 6: [800, 600], 7: [800, 600], 8: [1280, 720], 9: [480, 270], 10: [1000, 1000], 14: [1500, 1000] }[id] || [800, 600];
            const m = { id_str: String(id), type, media_url_https: `https://pbs.twimg.com/media/P${id}.jpg`, original_info: { width: w, height: h },
                sizes: { large: { w, h, resize: "fit" }, medium: { w, h, resize: "fit" }, small: { w, h, resize: "fit" }, thumb: { w: 150, h: 150, resize: "crop" } },
                url: "https://t.co/m", display_url: "pic.x.com/m", expanded_url: `https://x.com/i/status/${id}/photo/1`, indices: [0, 0] };
            if(type !== "photo") m.video_info = { aspect_ratio: [w, h], duration_millis: 42000, variants: [{ content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/x/low.mp4" }] };
            return m;
        };
        let t = 0;
        const ago = () => new Date(Date.now() - (t += 7 * 60000)).toUTCString();
        const ent = (extra = {}) => ({ hashtags: [], user_mentions: [], symbols: [], urls: [], ...extra });
        const tw = (id, author, text, extra = {}) => ({ id_str: String(id), full_text: text, text, created_at: ago(), source: "web", user: author, entities: ent(), retweet_count: 3, favorite_count: 12, reply_count: 5, ...extra });
        const withMedia = (json, media) => ({ ...json, entities: { ...json.entities, media }, extended_entities: { media } });
        const card = (name, values) => ({ name, url: "https://t.co/card", binding_values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? { type: "STRING", string_value: v } : v])) });
        const img = (id, w, h) => ({ type: "IMAGE", image_value: { url: `https://pbs.twimg.com/card_img/${id}/x.jpg`, width: w, height: h } });

        const long = "Мои ставки на сегодня на @biggerz. Я ставлю на победу и выход в плей-офф Furia и Spirit, а ещё немного на тотал больше в третьей карте. Если зайдёт, будет повод для отдельного треда #esports";
        const home = [
            ["text", tw(101, U.a, "Ссылка на реферала и бонусный код: BADLY")],
            ["long text, mention, hashtag", tw(102, U.a, long, { entities: ent({ user_mentions: [{ id_str: "99", screen_name: "biggerz", name: "BiggerZ", indices: [long.indexOf("@biggerz"), long.indexOf("@biggerz") + 8] }], hashtags: [{ text: "esports", indices: [long.length - 8, long.length] }] }) })],
            ["reply", tw(103, U.c, "@Dezeter Это правда работает? Как настроить?", { in_reply_to_status_id_str: "90", in_reply_to_user_id_str: "1", in_reply_to_screen_name: "Dezeter", entities: ent({ user_mentions: [{ id_str: "1", screen_name: "Dezeter", name: "Dezeter", indices: [0, 8] }] }), display_text_range: [9, 44] })],
            // X's self_thread, as it marked a thread's tweets: "Show this thread" under them
            ["thread", tw(120, U.a, "Продолжение треда: вот что я хотел добавить", { in_reply_to_status_id_str: "90", in_reply_to_user_id_str: "11", in_reply_to_screen_name: "Badlynasty", self_thread: { id_str: "90" } })],
            ["thread with a photo", withMedia(tw(121, U.a, "И ещё один кадр в тред", { in_reply_to_status_id_str: "91", in_reply_to_user_id_str: "11", in_reply_to_screen_name: "Badlynasty", self_thread: { id_str: "91" } }), [photo(1)])],
            ["retweet", { ...tw(104, U.f, "RT"), retweeted_status: tw(1040, U.b, "⭕ РАСПРОДАНО ЗА 3 ДНЯ ⭕ Привет моей удивительной семейке! Последний билет на концерт в Тбилиси ушёл сегодня утром") }],
            ["photo, landscape", withMedia(tw(105, U.a, "Закат над городом"), [photo(1)])],
            ["photo, portrait", withMedia(tw(106, U.b, "Новый постер"), [photo(2)])],
            ["two photos", withMedia(tw(107, U.c, "До и после"), [photo(4), photo(5)])],
            ["three photos", withMedia(tw(108, U.d, "Три кадра со съёмки"), [photo(4), photo(5), photo(6)])],
            ["four photos", withMedia(tw(109, U.e, "Четыре"), [photo(4), photo(5), photo(6), photo(7)])],
            ["video", withMedia(tw(110, U.a, "Видео с матча, финальная карта"), [photo(8, "video")])],
            ["gif", withMedia(tw(111, U.f, "когда наконец зашла ставка"), [photo(9, "animated_gif")])],
            // a reply that is a GIF
            ["gif reply", withMedia(tw(123, U.e, "@Badlynasty", { in_reply_to_status_id_str: "105", in_reply_to_user_id_str: "11", in_reply_to_screen_name: "Badlynasty", display_text_range: [12, 12], entities: ent({ user_mentions: [{ id_str: "11", screen_name: "Badlynasty", name: "Badlynasty", indices: [0, 11] }] }) }), [photo(9, "animated_gif")])],
            ["sensitive", withMedia(tw(112, U.b, "Осторожно, спойлеры"), [photo(10)]), { possibly_sensitive: true }],
            ["quote", tw(113, U.c, "Вот реальный пример, о котором я говорил", { is_quote_status: true, quoted_status_id_str: "1130", quoted_status: tw(1130, U.d, "Самый быстрый способ перевести деньги — через нас, благодарим за доверие") })],
            ["quote with a photo", tw(114, U.e, "Что такое?", { is_quote_status: true, quoted_status_id_str: "1140", quoted_status: withMedia(tw(1140, U.a, "Транзакция прошла за 3 секунды"), [photo(14)]) })],
            ["photo and a quote", withMedia(tw(115, U.b, "Смотрите, что нашла", { is_quote_status: true, quoted_status_id_str: "1150", quoted_status: tw(1150, U.c, "Цитируемый твит без картинки") }), [photo(3)])],
            // a line of text by a square, a quote with a square of its own under it
            ["video and a quote with a photo", withMedia(tw(124, U.f, "С Хэллоуином!", { is_quote_status: true, quoted_status_id_str: "1240", quoted_status: withMedia(tw(1240, U.d, "Сезон тыкв открыт."), [photo(10)]) }), [photo(8, "video")])],
            // text longer than its square, in the tweet and in its quote
            ["long text and a video", withMedia(tw(125, U.e, "Только что запустил задачу с телефона прямо на свой компьютер.\n\nЭто самый простой способ управлять агентами на своих машинах: пишешь задачу, и самая свободная машина её берёт, запускает в отдельной копии и показывает ход работы.\n\nРаботает на Mac и Linux", { is_quote_status: true, quoted_status_id_str: "1250", quoted_status: withMedia(tw(1250, U.a, "Я превратил старые компьютеры в парк агентов.\n\nНачни задачу на одном, передай другому, перенеси на третий. Запускай параллельно и проверяй с телефона.\n\nСобери свой парк"), [photo(4, "video")]) }), [photo(1, "video")])],
            ["link card, large", tw(116, U.a, "BiggerZ: Global Online Casino https://t.co/card", { card: card("summary_large_image", { title: "BiggerZ: Global Online Casino, Sportsbook & Prediction Markets", description: "BiggerZ brings together 6,000+ casino games, sports betting and prediction markets", domain: "biggerz.com", vanity_url: "biggerz.com", card_url: "https://t.co/card", summary_photo_image_original: img(11, 1200, 628), thumbnail_image_original: img(11, 1200, 628) }) })],
            ["link card, small", tw(117, U.d, "Статья https://t.co/card", { card: card("summary", { title: "Как работает TweetDeck в 2026 году", description: "Разбор расширения, которое возвращает старый интерфейс", domain: "habr.com", vanity_url: "habr.com", card_url: "https://t.co/card", thumbnail_image_original: img(13, 400, 400) }) })],
            ["poll", tw(118, U.e, "Какую тему вы используете?", { card: card("poll3choice_text_only", { choice1_label: "Светлую", choice1_count: "120", choice2_label: "Тёмную", choice2_count: "340", choice3_label: "Lights out", choice3_count: "88", counts_are_final: { type: "BOOLEAN", boolean_value: false }, end_datetime_utc: new Date(Date.now() + 864e5).toISOString(), duration_minutes: "1440" }) })],
            ["liked and retweeted", tw(119, U.c, "Твит, который я лайкнул и ретвитнул", { favorited: true, retweeted: true })],
        ];
        window.__home = home.map(([label, json, extra]) => [label, window.__client.processTweet({ ...json, ...(extra || {}) })]);
        window.__chirps = Object.fromEntries(window.__home.map(([, c]) => [c.id, c]));
        TD.controller.columnManager = { get: key => key === "home" ? { findChirp: id => window.__chirps[id], getMediaPreviewSize: () => "medium" } : null, getAllOrdered: () => [] };

        // TweetDeck's own column header, as its columns render it
        const header = (title, icon) => TD.ui.template.render("column/column_header", {
            columntitle: TD.ui.template.render("column_title", { emojifiedTitle: title, needsUserAttribution: true, screenName: "@Dezeter" }),
            columniconclass: icon, withImageAttribution: true,
        });
        const column = (key, title, body) => `<section class="js-column column" data-column="${key}"><div class="column-holder"><div class="column-panel flex flex-column height-p--100">${header(title, { home: "icon-home", notif: "icon-notifications" }[key] || "icon-user")}<div class="js-column-content column-content flex-auto position-rel flex flex-column height-p--100"><div class="js-column-scroller column-scroller position-rel scroll-v flex-auto height-p--100"><div class="js-chirp-container chirp-container">${body}</div></div></div></div></div></section>`;
        const homeHtml = window.__home.map(([label, chirp]) => chirp.render({ mediaPreviewSize: "medium" }).replace("<article ", `<article data-otd-label="${label}" `)).join("");
        // notifications, as X's activity JSON
        const account = window.__account;
        let at = 0;
        const act = (action, source, target, targetObject) => {
            const ts = Date.now() - (at += 9 * 60000);
            const json = { action, created_at: new Date(ts).toUTCString(), max_position: `${ts}`, min_position: `${ts}`, sources: [source], sources_size: 1, targets: [target], targets_size: 1, target_objects: [targetObject || target], target_objects_size: 1 };
            return TD.services.TwitterAction.processRESTAction(json, account)[0];
        };
        const mine = withMedia(tw(201, U.me, "Самый быстрый способ перевести деньги без комиссии, благодарим за доверие 🙏"), [photo(3)]);
        const mineText = tw(202, U.me, "Это адрес нашего кошелька, проверяйте перед отправкой");
        const notifs = [
            ["like, grouped", act("favorite", U.a, mine)], ["", act("favorite", U.b, mine)], ["", act("favorite", U.c, mine)],
            ["retweet", act("retweet", U.d, mineText)],
            ["follows, grouped", act("follow", U.e, U.me)], ["", act("follow", U.f, U.me)],
            ["reply to me", act("reply", U.c, tw(203, U.c, "@Dezeter Вот реально, у меня тоже так", { in_reply_to_status_id_str: "202", in_reply_to_user_id_str: "1", in_reply_to_screen_name: "Dezeter", display_text_range: [9, 37] }))],
            ["quote of mine", act("quote", U.d, tw(204, U.d, "Ты сделал TweetDeck снова удобным", { is_quote_status: true, quoted_status_id_str: "202", quoted_status: mineText }))],
            ["mention", act("mention", U.b, tw(205, U.b, "Спасибо @Dezeter за расширение!", { entities: ent({ user_mentions: [{ id_str: "1", screen_name: "Dezeter", name: "Dezeter", indices: [8, 16] }] }) }))],
        ].filter(([, chirp]) => chirp);
        window.__notifs = notifs;
        for(const [, c] of notifs) window.__chirps[c.id] = c;

        window.__renderCards = () => {
            const req = window.__require;
            const id = Object.keys(req.m).find(id => req.m[id].toString().includes("t.renderCardForChirp = function"));
            const { renderCardForChirp } = req(id);
            const $ = OTD.jQuery();
            for(const [, chirp] of window.__home) {
                const container = document.querySelector(`article[data-key="${chirp.id}"] .js-card-container`);
                // as TweetDeck's column does it
                if(chirp.card && container) try { TD.ui.Column.prototype.loadCard.call({ getChirpById: () => $(container).closest("article") }, chirp, "home"); } catch(e) { console.log("card", e.message); }
            }
        };
        const notifHtml = notifs.map(([label, chirp]) => chirp.render({ mediaPreviewSize: "medium" }).replace("<article ", `<article data-otd-label="${label || "·"}" `)).join("");
        // the opened tweet, as TweetDeck's detail view draws it
        const focal = window.__client.processTweet(withMedia(tw(301, U.a, "Закат над городом, снято на телефон. Без фильтров!", { favorite_count: 1280, retweet_count: 64, reply_count: 12, quote_count: 3 }), [photo(1)]));
        const reply = window.__client.processTweet(withMedia(tw(302, U.c, "@Badlynasty Красиво! А это мой вчерашний", { in_reply_to_status_id_str: "301", in_reply_to_user_id_str: "11", in_reply_to_screen_name: "Badlynasty", display_text_range: [12, 41] }), [photo(2)]));
        window.__chirps[focal.id] = focal;
        window.__chirps[reply.id] = reply;
        const detail = TD.ui.template.render("status/tweet_detail", { chirp: focal, withDragHandle: false, isFavorited: false, isRetweeted: false, renderQuoted() { return ""; } });
        const detailHtml = `<div class="js-detail-container column-scroller" data-otd-label="opened tweet"><div class="js-tweet-detail tweet-detail-wrapper">${detail}</div><div class="js-tweet-replies tweet-detail-reply">${reply.render({ mediaPreviewSize: "medium" }).replace("<article ", '<article data-otd-label="reply in the opened tweet" ')}</div></div>`;
        // TweetDeck's own left bar, condensed as people keep it
        document.body.insertAdjacentHTML("beforeend", `<div class="js-app application is-condensed" style="position:absolute;left:0;top:0;bottom:0;width:60px" data-otd-label="left bar">${TD.ui.template.render("topbar/app_header", {}).replace("js-app-header pin-all app-header", "js-app-header pin-all app-header is-condensed")}</div>`);
        document.body.insertAdjacentHTML("beforeend", `<div class="js-app-content app-content" style="left:60px"><div class="js-app-columns-container app-columns-container scroll-h"><div class="js-app-columns app-columns horizontal-flow-container">${column("home", "Home", homeHtml)}${column("notif", "Notifications", notifHtml)}${column("detail", "Tweet", detailHtml)}</div></div></div>`);
        window.__detailMedia = () => {
            const box = document.querySelector(".js-tweet-detail .js-tweet-media");
            if(!box) return;
            box.classList.remove("is-hidden");
            box.innerHTML = TD.ui.template.render("status/tweet_detail_media", Object.assign(Object.create(focal), { isPossiblySensitive: false,
                renderMediaGridView() { return this.media.renderGridView({ isPossiblySensitive: false }); },
                renderMediaDetailView() { return this.media.renderDetailView({ chirpId: this.chirpId, isPossiblySensitive: false }); } }));
        };
    }, [dark, width]);
}

// a picture of each tweet in <SPECIMENS_OUT>/<name>/, numbered, with their labels in labels.json, and of the top of
// the page, its columns side by side
async function shoot(page, name) {
    const dir = path.join(process.env.SPECIMENS_OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const { width } = page.viewportSize();
    await page.screenshot({ path: path.join(dir, "page.png"), clip: { x: 0, y: 0, width, height: 1100 } });
    const SEL = "article[data-otd-label]:not([data-otd-label='·']):not(.js-tweet-replies article), [data-otd-label='opened tweet']";
    const labels = await page.evaluate(SEL => [...document.querySelectorAll(SEL)].map(a => a.dataset.otdLabel), SEL);
    for(const [i, el] of (await page.$$(SEL)).entries()) await el.screenshot({ path: path.join(dir, `${String(i).padStart(2, "0")}.png`) });
    fs.writeFileSync(path.join(dir, "labels.json"), JSON.stringify(labels));
}

// for each tweet of the home and notifications columns: what sticks out of it, and where its square is
const layout = page => page.evaluate(() => [...document.querySelectorAll("article[data-otd-label]")].filter(a => a.offsetParent).map(article => {
    const box = el => el?.getBoundingClientRect();
    const tweet = box(article);
    // what shows: an element clipped by a box of its own inside the tweet doesn't stick out of it
    const clipped = el => {
        for(let up = el.parentElement; up && up !== article; up = up.parentElement) if(getComputedStyle(up).overflowX !== "visible") return true;
        return false;
    };
    const out = [...article.querySelectorAll("*")].filter(el => el.offsetParent && !el.closest(".js-tweet-actions") && !clipped(el)).some(el => box(el).right > tweet.right + 0.5 || box(el).left < tweet.left - 0.5);
    const media = article.querySelector(".tweet-body > .js-media");
    const square = media?.parentElement.classList.contains("otd-has-thumb") && box(media);
    const text = box(article.querySelector(".tweet-text"));
    const quote = box(article.querySelector(".tweet-body > .js-quote-detail"));
    const buttons = box(article.querySelector(".tweet-actions"));
    const body = media && box(media.parentElement);
    const under = media && !square && box(media);
    // the text's words: beside the square they keep 12px from it, under it they go on at the full width (a space at
    // a line's end, TweetDeck's text being pre-wrap, hangs past it unseen)
    const lines = !square ? [] : (() => {
        const text = article.querySelector(".tweet-text");
        const walk = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        const rects = [...text.querySelectorAll("img")].map(img => img.getBoundingClientRect());
        for(let node; (node = walk.nextNode());) for(const word of node.data.matchAll(/\S+/g)) {
            range.setStart(node, word.index);
            range.setEnd(node, word.index + word[0].length);
            rects.push(...range.getClientRects());
        }
        return rects.filter(r => r.width > 0 && r.height > 0);
    })();
    const beside = square && lines.filter(r => r.bottom > square.top + 0.5 && r.top < square.bottom - 0.5);
    return {
        label: article.dataset.otdLabel,
        out,
        // the buttons the tweet's last line, under its text and media
        buttonsLast: !media || !buttons || buttons.top >= Math.max(box(media).bottom, text.bottom) - 0.5,
        // TweetDeck's own preview: under the text, the body's width, no taller than a strip
        under: under ? [under.top >= text.bottom - 0.5, Math.abs(under.width - body.width) <= 1, under.height <= 200] : null,
        // Firefox lays out in fractions of a pixel: half a pixel either way is the same place
        // a quote under it, or beside it 12px from it
        square: square ? [Math.round(square.width), Math.round(square.height), beside.every(r => r.right <= square.left - 12 + 0.5),
            !quote || quote.top >= square.bottom - 0.5 || quote.right <= square.left - 12 + 0.5] : null,
        // the text under the square at full width; the quote beside it
        wrapped: square ? lines.some(r => r.top >= square.bottom && r.right > square.left) : null,
        quoteBeside: square && quote ? quote.top < square.bottom - 0.5 : null,
        // for a failure's message
        rects: square ? JSON.stringify({ lines: lines.filter(r => r.right > square.left - 12.5).map(r => [r.top, r.right]), square: [square.top, square.left, square.right, square.bottom], quote: quote && [quote.top, quote.right] }) : "",
    };
}));

// where an icon's drawing is: its middle, from the middle of what it stands with (a column's title, a nav link's box,
// a count next to it)
const iconPlaces = page => page.evaluate(() => {
    const mid = r => r.top + r.height / 2;
    const drawing = icon => {
        const box = icon.getBoundingClientRect();
        const before = getComputedStyle(icon, "::before");
        return box.top + parseFloat(before.marginTop || 0) + parseFloat(before.height) / 2;
    };
    const out = {};
    document.querySelectorAll(".column-header").forEach((header, i) => {
        out[`column ${i}`] = Math.round(drawing(header.querySelector(".column-type-icon")) - mid(header.querySelector(".column-heading").getBoundingClientRect()));
    });
    document.querySelectorAll(".app-navigator .app-nav-link, .app-navigator .app-nav-tab:not(.is-hidden)").forEach(link => {
        // "Expand" has an icon for each way, one of them hidden
        const icon = [...link.querySelectorAll(".icon")].find(i => i.getBoundingClientRect().width > 0);
        out[`nav ${link.dataset.title}`] = Math.round(drawing(icon) - mid(link.getBoundingClientRect()));
    });
    // the condensed bar's round search button
    const search = document.querySelector(".app-search-fake");
    const searchIcon = search.querySelector(".icon");
    const searchBox = search.getBoundingClientRect(), searchIconBox = searchIcon.getBoundingClientRect();
    out["search button circle"] = Math.round(drawing(searchIcon) - mid(searchBox));
    out["search button across"] = Math.round(searchIconBox.left + searchIconBox.width / 2 - (searchBox.left + searchBox.width / 2));
    const action = document.querySelector('article[data-otd-label="text"] .tweet-action[rel="reply"]');
    out["reply button"] = Math.round(drawing(action.querySelector(".icon")) - mid(action.getBoundingClientRect()));
    // the hover circle of a button, with its count, in a column and in the opened tweet, round its icon
    document.querySelectorAll('article[data-otd-label="text"] .tweet-action, [data-otd-label="opened tweet"] .js-tweet-detail .tweet-detail-action').forEach(button => {
        const after = getComputedStyle(button, "::after");
        if(after.content === "none") return;
        const box = button.getBoundingClientRect();
        const icon = button.querySelector(".icon");
        const circle = box.top + parseFloat(after.top) + parseFloat(after.marginTop) + parseFloat(after.height) / 2;
        const across = box.left + parseFloat(after.left) + parseFloat(after.width) / 2 - (icon.getBoundingClientRect().left + icon.getBoundingClientRect().width / 2);
        const where = `${button.closest(".js-tweet-detail") ? "opened tweet" : "column"} ${button.getAttribute("rel")} circle`;
        out[where] = Math.round(circle - drawing(icon));
        out[`${where} across`] = Math.round(across);
    });
    return out;
});

const SCRIPTS = ["src/otd-common.js", "src/modern-look.js", "src/theme.js", "src/icons.js", "src/media-layout.js", "src/self-threads.js", "src/compact-headers.js", "src/group-notifications.js"];
// medium columns have TweetDeck's own previews under the text, super wide and flex ones the square beside it
for(const [name, options] of Object.entries({
    "light": {}, "dark": { dark: true }, "superwide": { width: "superwide" }, "flex": { width: "flex" }, "dark-flex": { dark: true, width: "flex" },
    "whole": { media: "whole" }, "comfortable": { density: "comfortable" },
})) test(`every kind of tweet, ${name}: nothing sticks out, media beside the text where there's room, else under it, buttons last`, async ({ page }) => {
    await page.setViewportSize({ width: options.width === "flex" ? 1400 : 1000, height: 3000 });
    await stand(page, options);
    await addScripts(page, ...SCRIPTS);
    await page.evaluate(() => { window.__renderCards(); window.__detailMedia(); });
    await page.waitForTimeout(500);
    const tweets = await layout(page);
    expect(tweets.filter(t => t.out).map(t => t.label)).toEqual([]);
    expect(tweets.filter(t => !t.buttonsLast).map(t => t.label)).toEqual([]);
    const squares = tweets.filter(t => t.square);
    const side = ["superwide", "flex"].includes(options.width) && !options.media;
    const MEDIA = ["thread with a photo", "photo, landscape", "photo, portrait", "two photos", "three photos", "four photos", "video", "gif", "sensitive", "photo and a quote", "video and a quote with a photo", "long text and a video"];
    if(side) {
        expect(squares.map(t => t.label)).toEqual(expect.arrayContaining(MEDIA));
        for(const t of squares) expect(t.square, `${t.label} ${t.rects}`).toEqual([80, 80, true, true]);
        // long text goes on under its square; a quote rises beside the square a line of text leaves room by, and
        // goes under it after text as long as the square
        const by = label => tweets.find(t => t.label === label);
        expect([by("long text and a video").wrapped, by("long text and a video").quoteBeside, by("video and a quote with a photo").quoteBeside, by("photo and a quote").quoteBeside])
            .toEqual([true, false, true, true]);
        // a GIF that is a reply plays whole
        expect(tweets.find(t => t.label === "gif reply").under).toEqual([true, true, true]);
    } else {
        expect(squares).toEqual([]);
        if(!options.media) for(const t of tweets.filter(t => MEDIA.includes(t.label))) expect(t.under, t.label).toEqual([true, true, true]);
    }
    // icons where TweetDeck's font put them: a column's on its title's line, the left bar's in their buttons
    const places = await iconPlaces(page);
    expect(Object.keys(places)).toEqual(expect.arrayContaining(["column favorite circle", "opened tweet favorite circle"]));
    for(const [where, off] of Object.entries(places)) expect(Math.abs(off), where).toBeLessThanOrEqual(where.endsWith("circle") || where.endsWith("across") ? 1 : where.startsWith("column") ? 5 : 2);
    // "↩ @Dezeter" for "Replying to @Dezeter": under the name in a medium column, on its line in a wide one; a
    // notification of my own tweet without my name over it
    expect(await page.evaluate(() => {
        const replies = document.querySelector('article[data-otd-label="reply"] .other-replies');
        const name = document.querySelector('article[data-otd-label="reply"] .tweet-header .fullname').getBoundingClientRect();
        const line = replies.getBoundingClientRect();
        const own = [...document.querySelectorAll('[data-column="notif"] article')].filter(a => a.offsetParent && a.querySelector(".activity-header") && a.querySelector(".js-tweet > .tweet-header"))
            .map(a => [a.dataset.otdLabel, a.querySelector(".js-tweet > .tweet-header").offsetParent !== null]);
        return { icon: !!replies.querySelector(".otd-reply-icon"), words: getComputedStyle(replies.querySelector(".otd-reply-words")).position, onNameLine: Math.abs((line.top + line.bottom) / 2 - (name.top + name.bottom) / 2) < 6,
            own: [own.some(([label]) => label === "like, grouped"), own.some(([label]) => label === "retweet"), own.filter(([, shown]) => shown).length] };
    })).toEqual({ icon: true, words: "absolute", onNameLine: options.width === "flex",
        own: [true, true, 0] });
    // of several photos in TweetDeck's grid, the first fills the square, "+N" for the rest
    if(side) expect(await page.evaluate(() => ["two photos", "three photos", "four photos"].map(label => {
        const media = document.querySelector(`article[data-otd-label="${label}"] .tweet-body > .js-media`);
        const square = media.getBoundingClientRect();
        const shown = [...media.querySelectorAll(".media-image")].map(image => image.getBoundingClientRect()).filter(r => r.width > 0);
        return [label, media.dataset.otdMore, shown.length, shown.every(r => Math.abs(r.width - square.width) < 0.5 && Math.abs(r.height - square.height) < 0.5)];
    }))).toEqual([["two photos", "+1", 1, true], ["three photos", "+2", 1, true], ["four photos", "+3", 1, true]]);
    // "Show this thread" under the text, over the buttons, beside the square
    const threads = await page.evaluate(() => [...document.querySelectorAll('article[data-otd-label^="thread"]')].map(article => {
        const link = article.querySelector(".js-show-this-thread p")?.getBoundingClientRect();
        const text = article.querySelector(".tweet-text").getBoundingClientRect();
        const buttons = article.querySelector(".tweet-actions").getBoundingClientRect();
        const square = article.querySelector(".otd-has-thumb > .js-media")?.getBoundingClientRect();
        return [article.dataset.otdLabel, !!link && link.top >= text.bottom - 0.5 && link.bottom <= buttons.top + 0.5 && (!square || link.right <= square.left - 12 + 0.5)];
    }));
    expect(threads).toEqual([["thread", true], ["thread with a photo", true]]);
    // a like's burst of a heart on the heart, as TweetDeck puts it in on a like: in a column, with the count, and opened
    expect(await page.evaluate(() => ['article[data-otd-label="text"] .tweet-action[rel="favorite"]', '[data-otd-label="opened tweet"] .tweet-detail-action[rel="favorite"]'].map(selector => {
        const button = document.querySelector(selector);
        const icon = button.querySelector(".icon").getBoundingClientRect();
        button.insertAdjacentHTML("beforeend", '<i class="heartsprite heart-anim"></i>');
        const burst = button.querySelector(".heartsprite").getBoundingClientRect();
        button.querySelector(".heartsprite").remove();
        return [Math.round(burst.left + burst.width / 2 - icon.left - icon.width / 2), Math.round(burst.top + burst.height / 2 - icon.top - icon.height / 2)];
    }))).toEqual([[0, 0], [0, 0]]);
    // the dark theme calm: no frame in TweetDeck's blue or its grey-blue, a quote on a shade of its own
    if(options.dark) expect(await page.evaluate(() => {
        const frames = new Set();
        for(const el of document.querySelectorAll(".js-app *, .js-app-content *")) {
            if(!el.getClientRects().length) continue;
            const style = getComputedStyle(el);
            for(const side of ["Top", "Right", "Bottom", "Left"]) {
                if(parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none") frames.add(style[`border${side}Color`]);
            }
        }
        const quote = getComputedStyle(document.querySelector('article[data-otd-label="quote"] .quoted-tweet'));
        return { blue: ["rgb(29, 161, 242)", "rgb(56, 68, 77)", "rgb(61, 84, 102)"].filter(color => frames.has(color)), quote: [quote.borderTopColor, quote.backgroundColor] };
    })).toEqual({ blue: [], quote: ["rgba(0, 0, 0, 0)", "rgba(255, 255, 255, 0.04)"] });
    // the light theme calm too: none of TweetDeck's blue or its bluish greys left, in text, backgrounds or frames
    if(!options.dark) expect(await page.evaluate(() => {
        const TWEETDECK = ["rgb(29, 161, 242)", "rgb(27, 149, 224)", "rgb(20, 23, 26)", "rgb(101, 119, 134)", "rgb(136, 153, 166)", "rgb(170, 184, 194)", "rgb(204, 214, 221)", "rgb(225, 232, 237)", "rgb(245, 248, 250)", "rgb(28, 41, 56)"];
        const left = new Set();
        for(const el of document.querySelectorAll(".js-app, .js-app *, .js-app-content *")) {
            if(!el.getClientRects().length) continue;
            const style = getComputedStyle(el);
            const used = [style.color, style.backgroundColor];
            for(const side of ["Top", "Right", "Bottom", "Left"]) {
                if(parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none") used.push(style[`border${side}Color`]);
            }
            for(const color of used) if(TWEETDECK.includes(color)) left.add(`${color} ${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`);
        }
        const quote = getComputedStyle(document.querySelector('article[data-otd-label="quote"] .quoted-tweet'));
        return { left: [...left], quote: [quote.borderTopColor, quote.backgroundColor] };
    })).toEqual({ left: [], quote: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.035)"] });
    // a hairline round a square
    if(side) expect(await page.$eval('article[data-otd-label="photo, landscape"] .tweet-body > .js-media', el => getComputedStyle(el).outlineWidth)).toBe("1px");
    if(process.env.SPECIMENS_OUT) await shoot(page, name);
});
