// X's smart cashtags, as x.com shows them:
// - a token its text names by id ("robinhood:0x56910d…", "hyperliquid:native") is "$Index", a cashtag of
//   TweetDeck's own, which opens TweetDeck's search for it, the token's name and id in its tooltip. By what X said
//   of the tweet, or, as the timelines' queries TweetDeck asks are older than smart tags and leave them out, by the
//   id's look in the text, its ticker from SmartTagAttachmentQuery: an id X has no asset for stays as it is;
// - an asset the tweet attaches is a card under the text: its logo and chain, name, ticker, price, change in 24 h
//   and a chart of that day, from X's SmartTagAttachmentQuery; a click searches its cashtag, as the text's does.
//   It's asked as x.com asks it, for the day in 5-minute steps; without the query's id there's no card. When X
//   didn't say what the tweet attaches (the timelines' queries leave that out too), the tokens its text names are.
// interception.js keeps what X said of a tweet's cashtags (window.OTDcashtagData, by tweet id), and asks for it.
// A card's numbers are a minute old at most, and stay as they were drawn. Loaded by injection.js after
// otd-common.js. Switch "smartCashtags".
(() => {
    if(!OTD.isOn("smartCashtags")) return;

    const QUERY_ID = "qlU4kwL73-PXdo3qpTA4MA";
    const QUERY_PATH = `/i/api/graphql/${QUERY_ID}/SmartTagAttachmentQuery`;
    const variables = restId => ({ assetSymbol: restId, timeframe: "1D", candleSize: "5m" });
    const FRESH_FOR = 60000;
    const LOCALE = OTD.LOCALE;

    const data = () => window.OTDcashtagData;
    const asked = new Map();
    // the asset, its quote and its day, or null when X has none
    function asset(restId) {
        const known = asked.get(restId);
        if(known && Date.now() - known.at < FRESH_FOR) return known.answer;
        const answer = (async () => {
            const query = `variables=${encodeURIComponent(JSON.stringify(variables(restId)))}`;
            const res = await fetch(`${QUERY_PATH}?${query}`, { headers: await OTD.xHeaders(QUERY_PATH, "GET"), credentials: "include" });
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const found = json?.data?.finance_asset_data?.asset;
            return found ? { ...found, chart: json.data.finance_chart_data?.data_points || [] } : null;
        })().catch(e => {
            console.warn("SmartTagAttachmentQuery", restId, e);
            asked.delete(restId);
            return null;
        });
        asked.set(restId, { at: Date.now(), answer });
        return answer;
    }

    // google.type.Money
    const money = m => m ? Number(m.units || 0) + Number(m.nanos || 0) / 1e9 : NaN;
    function price(value, currency) {
        const digits = value < 1 ? { minimumSignificantDigits: 3, maximumSignificantDigits: 3 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
        try {
            return new Intl.NumberFormat(LOCALE, { style: "currency", currency: currency || "USD", ...digits }).format(value);
        } catch(e) {
            return String(value);
        }
    }
    const change = percent => new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(percent / 100);

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    };
    // TweetDeck's own link for a cashtag: its click opens TweetDeck's search
    function cashtagLink(ticker, className = "") {
        const holder = document.createElement("div");
        holder.innerHTML = TD.ui.template.render("text/search_link", { searchTerm: ticker, symbol: "$", escapedSymbol: escape("$") });
        const link = holder.firstElementChild;
        if(className) link.classList.add(...className.split(" "));
        return link;
    }

    // the day's prices as a line, in a box 100 wide and 32 tall stretched to the card's room
    function chart(points, up) {
        const prices = points.map(p => money(p.price)).filter(Number.isFinite);
        if(prices.length < 2) return null;
        const low = Math.min(...prices), high = Math.max(...prices);
        const y = value => high === low ? 16 : 30 - (value - low) / (high - low) * 28;
        const line = prices.map((value, i) => `${(i / (prices.length - 1) * 100).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", `otd-ticker-chart ${up ? "is-up" : "is-down"}`);
        svg.setAttribute("viewBox", "0 0 100 32");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("aria-hidden", "true");
        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", line);
        polyline.setAttribute("vector-effect", "non-scaling-stroke");
        svg.append(polyline);
        return svg;
    }

    // a card as soon as the tweet is drawn, with what the tweet's text says of it; X's numbers when they come.
    // TweetDeck's "search" link: its click searches the card's cashtag, whatever the card says
    function card(restId, tag) {
        const term = tag?.ticker ? `$${tag.ticker}` : restId;
        const box = el("a", "otd-ticker-card");
        box.href = `https://twitter.com/search?q=${encodeURIComponent(term)}`;
        box.rel = "search";
        box.target = "_blank";
        box.dataset.searchTerm = term;
        box.title = tag?.name ? `${tag.name} · ${restId}` : restId;
        const logo = el("span", "otd-ticker-logo");
        const text = el("span", "otd-ticker-text");
        const name = el("span", "otd-ticker-name", tag?.name || "");
        const line = el("span", "otd-ticker-line");
        line.append(el("span", "otd-ticker-symbol", tag?.ticker || ""));
        text.append(name, line);
        box.append(logo, text);
        box.classList.add("is-loading");
        asset(restId).then(found => {
            if(!found) {
                if(!tag?.name) box.remove();
                box.classList.remove("is-loading");
                return;
            }
            box.classList.remove("is-loading");
            box.title = `${found.name} · ${found.crypto?.contract_address || restId}`;
            if(found.ticker) {
                box.dataset.searchTerm = `$${found.ticker}`;
                box.href = `https://twitter.com/search?q=${encodeURIComponent(box.dataset.searchTerm)}`;
            }
            if(found.logo_url) logo.style.backgroundImage = `url("${encodeURI(found.logo_url)}")`;
            if(found.crypto?.chain_logo_url) {
                const chain = el("span", "otd-ticker-chain");
                chain.style.backgroundImage = `url("${encodeURI(found.crypto.chain_logo_url)}")`;
                logo.append(chain);
            }
            name.textContent = found.name || tag?.name || "";
            const percent = Number(found.quote?.change_24h_percent);
            const up = !(percent < 0);
            line.replaceChildren(el("span", "otd-ticker-symbol", found.ticker || tag?.ticker || ""));
            const value = money(found.quote?.price);
            if(Number.isFinite(value)) line.append(el("span", "otd-ticker-price", price(value, found.quote.price.currency_code)));
            if(Number.isFinite(percent)) line.append(el("span", `otd-ticker-change ${up ? "is-up" : "is-down"}`, change(percent)));
            const drawn = chart(found.chart || [], up);
            if(drawn) box.append(drawn);
        });
        return box;
    }

    // the text's own, not a link's
    function textNodes(text) {
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        const nodes = [];
        for(let node = walker.nextNode(); node; node = walker.nextNode()) if(!node.parentElement.closest("a")) nodes.push(node);
        return nodes;
    }
    // a smart tag's text in a tweet's text, the tweet's, a quote's or a translation's, each time it's there. The
    // link keeps the id, for the translation to put it back where its text has the id (grok-translate.js)
    function tagText(text, tags) {
        if(!text) return;
        for(const tag of tags) {
            if(!tag.ticker) continue;
            for(let rest of textNodes(text).filter(node => node.data.includes(tag.text))) {
                for(let at; (at = rest.data.indexOf(tag.text)) >= 0;) {
                    rest = rest.splitText(at);
                    rest.data = rest.data.slice(tag.text.length);
                    const link = cashtagLink(tag.ticker, "otd-smarttag");
                    link.title = tag.name ? `${tag.name} · ${tag.id}` : tag.id;
                    link.dataset.otdToken = tag.id;
                    rest.before(link);
                }
            }
        }
    }

    // a token's id as X writes it in a text, the chain and the contract, or "native" for the chain's own coin
    // ("hyperliquid:native"): as grok-translate.js keeps it whole
    const TOKEN = /(?<![\w:/])[a-z][a-z0-9_-]{1,20}:(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|native)(?![\w/])/g;
    // the ids a text names, in its order, the links' aside
    const idsIn = text => [...new Set(textNodes(text).flatMap(node => node.data.match(TOKEN) || []))];
    // its ticker and name, for as long as the page is open; asked again later when X didn't answer
    const tickers = new Map();
    function tickerOf(restId) {
        if(!tickers.has(restId)) tickers.set(restId, asset(restId).then(found => {
            if(found?.ticker) return { id: restId, text: restId, ticker: String(found.ticker), name: String(found.name || "") };
            tickers.delete(restId);
            return null;
        }));
        return tickers.get(restId);
    }
    // the ids in a text that what X said of the tweet didn't tag: "$Ticker" once X says what they are
    function tagFound(text, known = []) {
        if(!text || !QUERY_ID) return;
        for(const id of idsIn(text)) if(!known.some(tag => tag.text === id)) tickerOf(id).then(tag => {
            if(tag && text.isConnected) tagText(text, [tag]);
        });
    }
    // the cards under a tweet's text, two at most: the assets X says it attaches, or, when X didn't say, the tokens
    // its text names that X has an asset for, in the text's order. Before the text's ids are links
    function addCards(text, known) {
        if(!text || !QUERY_ID) return;
        const tags = known?.tags || [];
        const put = cards => {
            let after = text;
            for(const [restId, tag] of cards.slice(0, 2)) {
                const made = card(restId, tag);
                after.after(made);
                after = made;
            }
        };
        if(known?.attached) return put(known.attached.map(restId => [restId, tags.find(tag => tag.id === restId)]));
        Promise.all(idsIn(text).map(id => {
            const tag = tags.find(tag => tag.text === id);
            return tag ? [tag.id, tag] : tickerOf(id).then(found => found && [id, found]);
        })).then(cards => {
            if(text.isConnected) put(cards.filter(Boolean));
        });
    }

    function scan() {
        const store = data() || new Map();
        for(const item of document.querySelectorAll(".js-stream-item[data-key]:not([data-otd-cashtags]), .js-tweet-detail .js-stream-item:not([data-otd-cashtags])")) {
            item.dataset.otdCashtags = "";
            const chirp = OTD.chirpFor(item);
            const tweet = chirp?.retweetedStatus || chirp?.targetTweet || chirp;
            const known = tweet && store.get(String(tweet.id));
            const text = item.querySelector(".js-tweet-text:not(.js-quoted-tweet-text)");
            addCards(text, known);
            tagFound(text, known?.tags);
            if(known) tagText(text, known.tags);
            for(const quote of item.querySelectorAll(".js-quote-detail[data-tweet-id]")) {
                const quoted = store.get(quote.dataset.tweetId);
                tagFound(quote.querySelector(".js-quoted-tweet-text"), quoted?.tags);
                if(quoted) tagText(quote.querySelector(".js-quoted-tweet-text"), quoted.tags);
            }
        }
        // a translation made before an id's ticker came keeps the id
        for(const translation of document.querySelectorAll(".otd-grok-tr:not([data-otd-cashtags])")) {
            translation.dataset.otdCashtags = "";
            tagFound(translation);
        }
    }
    OTD.watch(scan);

    OTD.addStyle(`
        .otd-ticker-card { display: flex; align-items: center; gap: 10px; margin: 8px 0; padding: 10px 12px; border: 1px solid #e1e8ed; border-radius: 14px; color: inherit !important; text-decoration: none !important; }
        html.dark .otd-ticker-card { border-color: transparent; background: var(--otd-raised, transparent); }
        .otd-ticker-card:hover { background: rgba(15, 20, 25, .03); }
        html.dark .otd-ticker-card:hover { background: var(--otd-raised-hover, rgba(255, 255, 255, .03)); }
        .otd-ticker-logo { position: relative; flex: none; width: 36px; height: 36px; border-radius: 10px; background: #e1e8ed center / cover no-repeat; }
        html.dark .otd-ticker-logo { background-color: var(--otd-raised-solid, #38444d); }
        .otd-ticker-chain { position: absolute; right: -3px; bottom: -3px; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; background: #fff center / cover no-repeat; box-sizing: border-box; }
        html.dark .otd-ticker-chain { border-color: var(--otd-panel, #15202b); background-color: var(--otd-panel, #15202b); }
        .otd-ticker-text { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; line-height: 18px; }
        .otd-ticker-name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .otd-ticker-line { display: flex; flex-wrap: wrap; column-gap: 6px; font-size: 13px; }
        .otd-ticker-symbol { color: #536471; }
        html.dark .otd-ticker-symbol { color: var(--otd-text-2, #8899a6); }
        .otd-ticker-price { font-weight: 700; font-variant-numeric: tabular-nums; }
        .otd-ticker-change { font-variant-numeric: tabular-nums; }
        .otd-ticker-change.is-up { color: #00ba7c; }
        .otd-ticker-change.is-down { color: #f4212e; }
        .otd-ticker-chart { flex: 0 1 120px; min-width: 48px; height: 32px; fill: none; stroke-width: 1.5px; stroke-linejoin: round; }
        .otd-ticker-chart.is-up { stroke: #00ba7c; }
        .otd-ticker-chart.is-down { stroke: #f4212e; }
        .otd-ticker-card.is-loading .otd-ticker-line::after { content: ""; width: 72px; height: 12px; margin-top: 3px; border-radius: 6px; background: currentColor; opacity: .12; }
        /* beside the square of media-layout.js, the card goes under it at full width */
        html.otd-media-thumb .otd-has-thumb > .otd-ticker-card { clear: right; }
    `);
})();
