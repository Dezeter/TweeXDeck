// How a tweet's photos and videos show in a column, by TweetDeck's own "Media preview size" of the column (its
// options), applied as it's picked:
// - Small: in a column with room for it, a small square at the top right of the text, which goes round it and on
//   under it at full width; a quoted tweet beside it when the text is shorter than the square, the buttons under it
//   at full width. Of several photos the square has the first with "+2"; a video has a play badge, a GIF "GIF". A
//   quoted tweet's media is a smaller square in the quote. A click opens TweetDeck's media window as before; a
//   video, with inline video on, opens the tweet back to full width and plays there. In a narrower column, where
//   the text beside a square would be a few words a line, and for a GIF that a reply is, TweetDeck's own small
//   preview. A link card with a large picture is X's small one, its picture beside the title, as the media are.
//   The option's picture shows the square;
// - Hidden, Medium and Large: TweetDeck's own; with "whole" in Settings → TweeXDeck → Media (OTD.MEDIA_STORAGE), a
//   single photo of Medium and Large whole, in its own proportions and no taller than half the screen, instead of
//   TweetDeck's strip; several photos and videos as TweetDeck has them.
// The tweet opened in a column's detail view keeps TweetDeck's. Before 5.20 the square was the setting's default,
// in every column with room, whatever its preview size.
// Loaded by injection.js after otd-common.js.
(() => {
    // before 5.15 a switch, "mediaAspect": whole, or switched off TweetDeck's strip
    if(localStorage.OTDmediaAspect !== undefined) {
        if(localStorage.OTDmediaAspect === "0" && localStorage[OTD.MEDIA_STORAGE] === undefined) localStorage[OTD.MEDIA_STORAGE] = "strip";
        localStorage.removeItem("OTDmediaAspect");
    }
    // "strip", TweetDeck's own, is now what nothing picked is
    if(localStorage[OTD.MEDIA_STORAGE] === "strip") localStorage.removeItem(OTD.MEDIA_STORAGE);
    const apply = () => {
        document.documentElement.classList.add("otd-media-thumb");
        document.documentElement.classList.toggle("otd-media-whole", localStorage[OTD.MEDIA_STORAGE] === "whole");
        for(const media of document.querySelectorAll("[data-otd-thumb]")) fit(media);
    };
    // a column's media preview size, as TweetDeck keeps it: "off", "small", "medium" or "large"
    function previewSize(key) {
        try {
            return window.TD?.controller?.columnManager?.get?.(key)?.getMediaPreviewSize?.() || null;
        } catch(e) {
            return null;
        }
    }
    // A square only where the text beside it keeps 208px: a tweet's body 300px wide (TweetDeck's super wide and
    // wider flex columns); in narrower ones it'd be a few words a line. By column, measured on one of its tweets,
    // again when the window or a column changes
    const SIDE_FROM = 300;
    function roomy(column) {
        const body = column.querySelector(".js-stream-item .tweet-body");
        const width = body ? body.getBoundingClientRect().width : 0;
        if(width > 0) column.dataset.otdMediaSide = width >= SIDE_FROM ? "1" : "0";
        return column.dataset.otdMediaSide !== "0";
    }
    // a GIF a reply is: the answer itself, whole and playing
    function gifReply(media) {
        if(media.closest(".js-quote-detail") || !media.querySelector(".is-gif")) return false;
        const chirp = OTD.chirpFor(media);
        return !!(chirp?.retweetedStatus || chirp)?.inReplyToID;
    }
    // the square or TweetDeck's own, for a tweet's or a quote's media: the box it's in says which
    function fit(media) {
        const box = media.parentElement;
        if(!box || media.dataset.otdThumb === "off") return;
        const column = media.closest(".js-column");
        const square = !!column && previewSize(column.dataset.column) === "small" && !("otdOpened" in media.dataset) && roomy(column) && !gifReply(media);
        box.classList.toggle(media.dataset.otdThumb === "quote" ? "otd-quote-thumb" : "otd-has-thumb", square);
        place(media);
        if(media.dataset.otdThumb === "tweet" && box.querySelector(":scope > .js-quote-detail")) watchQuote(box);
    }

    // A quote rises beside the square when the text ends above the square's bottom: TweetDeck's quote is a box of
    // its own, which goes beside a float at the width left. When the square would hang over it by less than a line,
    // the quote goes under it at full width instead: a narrower quote for a few pixels is more room lost than they
    // are. Again when the tweet's body changes size (a translation, the column's width).
    const OVERHANG = 24;
    function settle(box) {
        const quote = box.querySelector(":scope > .js-quote-detail");
        const media = box.querySelector(":scope > .js-media");
        if(!quote || !media) return;
        let under = false;
        if(box.classList.contains("otd-has-thumb")) {
            // where the quote starts beside the square: under what comes before it, the square aside
            const css = getComputedStyle(quote);
            let top = box.getBoundingClientRect().top;
            for(let el = quote.previousElementSibling; el; el = el.previousElementSibling) {
                const rect = el.getBoundingClientRect();
                if(el === media || !rect.height) continue;
                top = Math.max(top, rect.bottom + Math.max(parseFloat(getComputedStyle(el).marginBottom) || 0, parseFloat(css.marginTop) || 0));
            }
            const overhang = media.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(media).marginBottom) || 0) - top;
            under = overhang > 0 && overhang < OVERHANG;
        }
        quote.classList.toggle("otd-quote-under", under);
    }
    // Watched: the body, and what's before the quote, whose size doesn't change the body's once the quote is under
    // the square. That doesn't move with the quote, so the answer is the same once it has moved. In the next frame:
    // a body resized by the observer's own callback is a "ResizeObserver loop" error, which the load watchdog reports.
    const watched = new Map();
    const owners = new WeakMap();
    const due = new Set();
    const sizes = window.ResizeObserver && new ResizeObserver(entries => {
        if(!due.size) requestAnimationFrame(() => {
            due.forEach(settle);
            due.clear();
        });
        for(const entry of entries) if(owners.has(entry.target)) due.add(owners.get(entry.target));
    });
    function watchQuote(box) {
        if(!sizes) return settle(box);
        const quote = box.querySelector(":scope > .js-quote-detail");
        const before = [box];
        for(let el = quote.previousElementSibling; el; el = el.previousElementSibling) if(!el.classList.contains("js-media")) before.push(el);
        for(const el of watched.get(box) || []) if(!before.includes(el)) sizes.unobserve(el);
        for(const el of before) {
            owners.set(el, box);
            sizes.observe(el, { box: "border-box" });
        }
        watched.set(box, before);
    }
    // A square floats at the start of what it's beside, so the text goes beside it and not under it; elsewhere
    // the media goes back where TweetDeck put it: after a tweet's card container, at the end of a quote.
    function place(media) {
        const box = media.parentElement;
        if(!box) return;
        const thumb = box.classList.contains("otd-has-thumb") || box.classList.contains("otd-quote-thumb");
        if(thumb && box.firstElementChild !== media) box.prepend(media);
        else if(!thumb && box.firstElementChild === media) {
            const card = box.querySelector(":scope > .js-card-container");
            if(card) card.after(media);
            else box.append(media);
        }
    }
    apply();
    OTD.onChange(OTD.MEDIA_STORAGE, apply);

    // width and height of the one photo of a chirp (a retweet's, a liked tweet's), or nothing
    function photoSize(chirp) {
        const media = chirp?.getMedia?.() || [];
        if(media.length !== 1 || media[0].entity?.type !== "photo") return null;
        const { original_info: original, sizes } = media[0].entity;
        const size = original?.width ? { w: original.width, h: original.height } : sizes?.large;
        return size?.w > 0 && size?.h > 0 ? size : null;
    }

    function scan() {
        for(const [box, els] of watched) if(!box.isConnected) {
            els.forEach(el => sizes.unobserve(el));
            watched.delete(box);
        }
        // whole: TweetDeck's medium and large previews; small ones, quotes and the detail view stay as they are
        for(const link of document.querySelectorAll(".js-stream-item .js-media-image-link:is(.media-size-medium, .media-size-large):not([data-otd-aspect])")) {
            link.dataset.otdAspect = "";
            if(link.closest(".js-quote-detail, .js-tweet-detail")) continue;
            const size = photoSize(OTD.chirpFor(link));
            if(!size) continue;
            link.classList.add("otd-aspect");
            link.style.setProperty("--otd-aspect", `${(size.h / size.w * 100).toFixed(2)}%`);
        }
        // a column that got wider or narrower than a square needs: its media again
        for(const column of document.querySelectorAll(".js-column[data-otd-media-side]")) {
            const was = column.dataset.otdMediaSide;
            if(roomy(column) !== (was === "1")) for(const media of column.querySelectorAll("[data-otd-thumb]")) fit(media);
        }
        // thumb: the tweets and quotes with media, and how many photos past the first
        for(const media of document.querySelectorAll(".js-stream-item .tweet-body > .js-media:not([data-otd-thumb]), .js-stream-item .js-quote-detail > div > .js-media:not([data-otd-thumb])")) {
            if(media.closest(".js-tweet-detail")) {
                media.dataset.otdThumb = "off";
                continue;
            }
            media.dataset.otdThumb = media.closest(".js-quote-detail") ? "quote" : "tweet";
            const more = media.querySelectorAll(":scope > .js-media-preview-container, :scope > [class^='media-grid-'] > .media-image-container").length - 1;
            if(more > 0) media.dataset.otdMore = `+${more}`;
            fit(media);
        }
    }
    const rescan = OTD.watch(scan);
    window.addEventListener("resize", rescan);

    // the Small option of a column's "Media preview size": its picture the square beside the text, as TweetDeck draws
    // the others (61 by 59, its blue when picked)
    const smallPicture = (fill, edge) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='61' height='59' viewBox='0 0 61 59'><rect x='.5' y='.5' width='60' height='58' rx='3' fill='#fff' stroke='${edge}'/><rect x='7' y='6' width='8' height='8' rx='1' fill='${fill}'/><g fill='#e1e8ed'><rect x='17' y='8' width='17' height='2'/><rect x='8' y='18' width='26' height='3'/><rect x='8' y='24' width='26' height='3'/><rect x='8' y='30' width='19' height='3'/><rect x='8' y='37' width='46' height='3'/><rect x='8' y='43' width='31' height='3'/></g><rect x='38' y='17' width='16' height='16' rx='2' fill='${fill}'/></svg>`)}`;
    const SMALL = { picked: smallPicture("#257abb", "#2f80be"), other: smallPicture("#aab8c3", "#ced8df") };
    OTD.watch(() => {
        for(const img of document.querySelectorAll('.js-toggle-item[data-value="small"] > img.media-size-image:not([data-otd-square])')) {
            img.dataset.otdSquare = "";
            img.src = img.classList.contains("js-selected-media") ? SMALL.picked : SMALL.other;
        }
    });

    // a card is drawn for a column by TD.ui.Column's loadCard (the detail view draws its own): in a Small column a
    // summary_large_image goes as a summary, with the large picture as its thumbnail
    const Column = window.TD?.ui?.Column;
    const loadCard = Column?.prototype?.loadCard;
    if(loadCard) Column.prototype.loadCard = function(chirp) {
        const card = chirp?.card;
        if(previewSize(this?.state?.columnKey) !== "small" || card?.name !== "summary_large_image") return loadCard.apply(this, arguments);
        const values = card.binding_values || {};
        const image = values.summary_photo_image_original || values.thumbnail_image_original;
        const small = Object.create(chirp);
        small.card = { ...card, name: "summary", binding_values: { ...values, ...(image ? { thumbnail_image_original: image } : {}) } };
        return loadCard.call(this, small, ...[...arguments].slice(1));
    };

    // a video in a square plays nowhere: its tweet opens to full width first, inline-video.js plays it there
    document.addEventListener("click", e => {
        if(!OTD.isOn("inlineVideo") || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const box = e.target.closest?.('.js-media .js-media-preview-container.is-video a[rel="mediaPreview"]')?.closest(".otd-has-thumb, .otd-quote-thumb");
        if(!box) return;
        const media = box.querySelector(":scope > .js-media");
        media.dataset.otdOpened = "";
        fit(media);
    }, true);

    const mask = shape => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${shape}</svg>`)}")`;
    // Lucide's (ISC, files/icons/LICENSE)
    const EYE_OFF = mask("<path d='M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'/><path d='M14.084 14.158a3 3 0 0 1-4.242-4.242'/><path d='M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'/><path d='m2 2 20 20'/>");
    const PLAY = mask("<path d='M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' fill='#000'/>");
    // the square in a tweet and in a quote
    const M = ["html.otd-media-thumb .otd-has-thumb > .js-media", "html.otd-media-thumb .otd-quote-thumb > .js-media"];
    const both = rest => M.map(m => `${m}${rest}`).join(", ");
    OTD.addStyle(`
        /* whole: the strip's height becomes the image's proportion; !important over the dark theme's copy of the rule */
        html.otd-media-whole .js-media-image-link.otd-aspect { height: 0 !important; padding-top: min(50vh, var(--otd-aspect)) !important; background-size: cover; background-position: center; }

        /* thumb: an 80px square at the top right of the text, 12px from it; 64px and 10px in a quote. The text goes
           round it and on under it at full width: TweetDeck's is overflow: hidden, a box of its own, which beside a
           float would keep a column the square's height no longer needs. The buttons go under it at full width, the
           last line of the tweet (in a GIF's tweet TweetDeck's markup puts them in the body) */
        html.otd-media-thumb .otd-has-thumb > .tweet-text { overflow: visible; }
        html.otd-media-thumb .otd-has-thumb ~ .tweet-footer, html.otd-media-thumb .otd-has-thumb > .tweet-footer { clear: right; }
        ${both("")} { --otd-thumb: 80px; float: right; position: relative; width: var(--otd-thumb); height: var(--otd-thumb); margin: 0 0 8px 12px; overflow: hidden; border-radius: 12px; }
        ${M[1]} { --otd-thumb: 64px; margin: 0 0 6px 10px; border-radius: 10px; }
        /* a hairline round it, as on x.com: a dark picture on the dark theme doesn't melt into the column */
        ${both("")} { outline: 1px solid rgba(15, 20, 25, .1); outline-offset: -1px; }
        ${["html.dark.otd-media-thumb .otd-has-thumb > .js-media", "html.dark.otd-media-thumb .otd-quote-thumb > .js-media"].join(", ")} { outline-color: var(--otd-media-edge, rgba(255, 255, 255, .14)); }
        /* in a quote, its author's line cut short with "…" beside the square: TweetDeck's is a box as wide as the
           names, which wider than the room beside the square would go under it */
        html.otd-media-thumb .otd-quote-thumb > .tweet-header > .account-link, html.otd-media-thumb .otd-quote-thumb > .tweet-header .nbfc { display: block; }
        html.otd-media-thumb .otd-quote-thumb > .tweet-header .account-inline { max-width: calc(100% - 74px); }
        /* a quote the square would hang over by less than a line: under it, whole (settle) */
        html.otd-media-thumb .otd-has-thumb > .js-quote-detail.otd-quote-under { clear: right; }
        ${both(" > .js-media-preview-container")} { width: 100%; height: 100%; min-height: 0 !important; margin: 0 !important; }
        ${both(" > .js-media-preview-container ~ .js-media-preview-container")} { display: none; }
        /* the square's width too: a column's "small" previews are half as wide as the tweet */
        ${both(" .media-item")}, ${both(" .media-grid-container")} {
            width: 100% !important; height: var(--otd-thumb) !important; min-height: 0 !important; padding-top: 0 !important; margin: 0 !important; border-radius: inherit; background-size: cover; background-position: center;
        }
        /* TweetDeck's grid of several photos is the square itself: its height, the square's margins */
        ${both(".media-grid-container")} { height: var(--otd-thumb) !important; min-height: 0 !important; }
        /* and in it the first photo, whole, "+N" for the others, as without the grid: its halves and quarters are too
           small to make out in a square, and an empty half was seen */
        ${both(" > [class^='media-grid-'] > .media-image-container")} { width: 100% !important; height: 100% !important; float: none !important; }
        ${both(" > [class^='media-grid-'] > .media-image-container ~ .media-image-container")} { display: none !important; }
        ${both(" > [class^='media-grid-'] > .media-image-container > .media-image")} { inset: 0 !important; }
        ${both(" .media-item-gif")} { width: 100%; height: 100%; object-fit: cover; }
        /* TweetDeck's badges are for its strip; the square has its own */
        ${both(" .video-overlay")}, ${both(" .gif-badge")}, ${both(" .gif-pause")} { display: none; }
        ${both("[data-otd-more]::after")}, ${both(" .is-gif::after")} {
            position: absolute; z-index: 1; padding: 1px 6px; border-radius: 999px; background: rgba(15, 20, 25, .75);
            color: #fff; font-size: 11px; font-weight: 700; line-height: 16px; pointer-events: none;
        }
        ${both("[data-otd-more]::after")} { content: attr(data-otd-more); right: 4px; bottom: 4px; }
        ${both(" .is-gif::after")} { content: "GIF"; left: 4px; bottom: 4px; }
        /* a play button: a dark circle, a white triangle */
        ${both(" .is-video::after")} {
            content: ""; position: absolute; z-index: 1; left: 50%; top: 50%; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%;
            background: rgba(15, 20, 25, .75); pointer-events: none;
        }
        ${both(" .is-video::before")} {
            content: ""; position: absolute; z-index: 2; left: 50%; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -4px; background-color: #fff;
            -webkit-mask: ${PLAY} center / contain no-repeat; mask: ${PLAY} center / contain no-repeat; pointer-events: none;
        }
        /* TweetDeck's notice over sensitive media: an eye in the square, the whole of it shows it */
        ${both(" .media-sensitive")} { border-radius: inherit; }
        ${both(" .media-sensitive .padding-am")} { font-size: 0; }
        ${both(" .media-sensitive .padding-am > :not([rel=\"showSensitiveMedia\"])")} { display: none; }
        ${both(" .media-sensitive [rel=\"showSensitiveMedia\"]")} { position: absolute; inset: 0; font-size: 0; color: inherit; }
        ${both(" .media-sensitive [rel=\"showSensitiveMedia\"]::before")} {
            content: ""; position: absolute; left: 50%; top: 50%; width: 24px; height: 24px; margin: -12px 0 0 -12px; background-color: currentColor;
            -webkit-mask: ${EYE_OFF} center / contain no-repeat; mask: ${EYE_OFF} center / contain no-repeat;
        }
    `);
})();
