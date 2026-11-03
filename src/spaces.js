// The Spaces column (for-you.js makes it, interception.js answers its requests for tweets empty): the Spaces of
// the people the user follows, the live ones first, then the ones to come.
// - Live: X's fleetline, which x.com asks for the Spaces over Home, has the live ones with people the user follows
//   in them, hosting, speaking or only listening;
// - To come: what people the user follows tweeted with a Space's link, from TweetDeck's own search (filter:follows
//   filter:spaces), every 5 minutes; live ones it finds too;
// - Each one's title, host, speakers, listeners and times from AudioSpaceById, by the id and features of x.com's
//   main.js when it has them, the ones known when this was written otherwise.
// "Listen" opens the Space on x.com. Live ones are asked for every minute while the page is in view; nothing is
// asked while there's no Spaces column. Loaded by injection.js after for-you.js.
(() => {
    const TD = window.TD;
    if(!TD?.controller?.columnManager) return;

    const LABELS = {
        ru: {
            live: "В эфире", coming: "Запланированы", liveBadge: "В эфире", comingBadge: "Запланирован",
            listen: "Слушать", open: "Открыть на x.com", untitled: "Спейс", refresh: "Обновить",
            searching: "Ищем спейсы…", searchingHint: "Спрашиваем X, кто из ваших подписок в эфире",
            none: "Сейчас никто не в эфире", noneHint: "Здесь появятся спейсы ваших подписок — идущие и запланированные. Колонка проверяет X раз в минуту, пока вкладка открыта.",
            noneLive: "Сейчас никто из ваших подписок не в эфире",
            failed: "X не ответил", failedHint: status => `Не удалось получить спейсы (${status}). Колонка попробует снова через минуту.`, retry: "Повторить",
            checked: time => `Проверено в ${time}`,
            liveFor: (h, m) => `идёт ${h ? `${h} ч ` : ""}${m} мин`,
            startsAt: when => `начнётся ${when}`, startsSoon: "вот-вот начнётся",
            today: time => `сегодня в ${time}`, tomorrow: time => `завтра в ${time}`,
            listeners: { one: "слушатель", few: "слушателя", many: "слушателей", other: "слушателя" },
            yours: "Из ваших подписок:",
            roles: { host: ["ведёт", "ведут"], speaker: ["выступает", "выступают"], listener: ["слушает", "слушают"] },
            more: n => `и ещё ${n}`,
            people: { one: "человек", few: "человека", many: "человек", other: "человека" },
        },
        en: {
            live: "Live", coming: "Coming up", liveBadge: "Live", comingBadge: "Scheduled",
            listen: "Listen", open: "Open on x.com", untitled: "Space", refresh: "Refresh",
            searching: "Looking for Spaces…", searchingHint: "Asking X who of the people you follow is live",
            none: "No one is live right now", noneHint: "The Spaces of people you follow, live and to come, show up here. The column checks X once a minute while the tab is open.",
            noneLive: "No one you follow is live right now",
            failed: "X didn't answer", failedHint: status => `Couldn't get the Spaces (${status}). The column tries again in a minute.`, retry: "Try again",
            checked: time => `Checked at ${time}`,
            liveFor: (h, m) => `live for ${h ? `${h} h ` : ""}${m} min`,
            startsAt: when => `starts ${when}`, startsSoon: "starting any moment",
            today: time => `today at ${time}`, tomorrow: time => `tomorrow at ${time}`,
            listeners: { one: "listener", other: "listeners" },
            yours: "People you follow:",
            roles: { host: ["hosts", "host"], speaker: ["speaks", "speak"], listener: ["listens", "listen"] },
            more: n => `and ${n} more`,
            people: { one: "person", other: "people" },
        },
    };
    const LANG = LABELS[OTD.UI_LANG] ? OTD.UI_LANG : "en";
    const T = LABELS[LANG];
    const plurals = new Intl.PluralRules(LANG);
    const clock = new Intl.DateTimeFormat(LANG, { hour: "2-digit", minute: "2-digit" });
    const dated = new Intl.DateTimeFormat(LANG, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const count = new Intl.NumberFormat(LANG);

    const LIVE_EVERY = 60 * 1000;
    const SEARCH_EVERY = 5 * 60 * 1000;
    // how long a Space's details are kept: a live one's listeners change, a scheduled one's time rarely, an ended one
    // stays ended
    const KEEP = { live: 2 * 60 * 1000, coming: 10 * 60 * 1000, gone: Infinity };
    // a scheduled one that hasn't started this long after its time is dropped
    const LATE = 60 * 60 * 1000;
    const SEARCH = "filter:follows filter:spaces";
    const ID_RE = /^[A-Za-z0-9]{8,24}$/;
    const LINK_RE = /(?:x|twitter)\.com\\?\/i\\?\/spaces\\?\/([A-Za-z0-9]{8,24})/g;
    // AudioSpaceById as x.com had it in October 2026
    const SPACE_QUERY = { id: "bpQedjCUnMgs3yXNi8fZlA", features: {"spaces_2022_h2_spaces_communities":true,"spaces_2022_h2_clipping":true,"creator_subscriptions_tweet_preview_api_enabled":true,"profile_label_improvements_pcf_label_in_post_enabled":true,"responsive_web_profile_redirect_enabled":true,"rweb_tipjar_consumption_enabled":false,"verified_phone_label_enabled":false,"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,"responsive_web_grok_analyze_post_followups_enabled":true,"rweb_cashtags_composer_attachment_enabled":true,"responsive_web_jetfuel_frame":true,"rweb_sports_post_context_enabled":true,"responsive_web_grok_share_attachment_enabled":true,"responsive_web_grok_annotations_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"content_disclosure_indicator_enabled":true,"content_disclosure_ai_generated_indicator_enabled":true,"responsive_web_grok_show_grok_translated_post":true,"responsive_web_grok_analysis_button_from_backend":true,"post_ctas_fetch_enabled":false,"rweb_cashtags_enabled":true,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":false,"responsive_web_nested_quote_preview_enabled":true,"responsive_web_grok_image_annotation_enabled":true,"responsive_web_grok_imagine_annotation_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_grok_community_note_auto_translation_is_enabled":true} };

    // --- the columns ------------------------------------------------------------------------------------------
    // the Spaces columns on the page, with the id of the account each is for ("" for the logged in one's)
    function columns() {
        const found = [];
        for(const section of document.querySelectorAll("section.js-column[data-column]")) {
            let column = null;
            try {
                column = TD.controller.columnManager.get(section.dataset.column);
            } catch(e) {}
            const feed = column?.getFeeds?.()?.find(feed => feed?.getMetadata?.()?.otdTimeline === "spaces");
            if(!feed) continue;
            let user = "";
            try {
                user = String(TD.storage.accountController.get(feed.getAccountKey())?.getUserID?.() || "");
            } catch(e) {}
            found.push({ section, key: section.dataset.column, user });
        }
        return found;
    }
    // the logged in account, as interception.js knows it
    function loggedIn() {
        try {
            return typeof getCurrentUserId === "function" ? String(getCurrentUserId() || "") : "";
        } catch(e) {
            return "";
        }
    }
    const actAs = user => user && user !== loggedIn() ? { "x-act-as-user-id": user } : {};

    // --- X ----------------------------------------------------------------------------------------------------
    const failure = (message, status) => Object.assign(new Error(message), { status });
    const describe = e => e?.status ? `HTTP ${e.status}` : String(e?.message || e).slice(0, 80);
    // X's ids of people are bigger than a JavaScript number keeps: they're read as strings
    const parse = text => JSON.parse(text.replace(/(":\s*)(\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
    async function getJSON(path, params, user) {
        const headers = await OTD.xHeaders(path, "GET", { "content-type": "application/json", ...actAs(user) });
        const res = await fetch(`https://${location.hostname}${path}?${params}`, { headers, credentials: "include" });
        if(!res.ok) throw failure(`HTTP ${res.status}`, res.status);
        const text = await res.text();
        if(!text) throw failure("empty answer", res.status);
        return parse(text);
    }

    // the live Spaces of the fleetline: id → ids of the people the user follows in it, the owners of the threads
    // it's in
    async function fleetline(user) {
        const data = await getJSON("/i/api/fleets/v1/fleetline", "only_spaces=true", user);
        const people = new Map();
        const walk = (node, owner) => {
            if(!node || typeof node !== "object") return;
            if(Array.isArray(node)) {
                for(const item of node) walk(item, owner);
                return;
            }
            const own = node.user_id_str ?? node.user_id;
            if((typeof own === "string" && /^\d+$/.test(own)) || Number.isSafeInteger(own)) owner = String(own);
            const id = node.broadcast_id;
            if(typeof id === "string" && ID_RE.test(id)) {
                if(!people.has(id)) people.set(id, new Set());
                if(owner) people.get(id).add(owner);
            }
            for(const value of Object.values(node)) walk(value, owner);
        };
        walk(data, "");
        return people;
    }

    // the Spaces linked in what the people the user follows tweeted lately, through TweetDeck's search as
    // interception.js answers it: id → ids of who tweeted it
    function search(user) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", `https://api.${location.hostname}/1.1/search/universal.json?q=${encodeURIComponent(SEARCH)}&count=20&modules=status&result_type=recent`);
            xhr.withCredentials = true;
            xhr.setRequestHeader("X-Csrf-Token", OTD.cookie("ct0"));
            xhr.setRequestHeader("X-Twitter-Auth-Type", "OAuth2Session");
            for(const [name, value] of Object.entries(actAs(user))) xhr.setRequestHeader(name, value);
            xhr.onload = () => {
                if(xhr.status !== 200) return reject(failure(`HTTP ${xhr.status}`, xhr.status));
                try {
                    const found = new Map();
                    for(const module of JSON.parse(xhr.responseText)?.modules || []) {
                        const tweet = module?.status?.data;
                        if(!tweet) continue;
                        for(const [, id] of JSON.stringify(tweet).matchAll(LINK_RE)) {
                            if(!found.has(id)) found.set(id, new Set());
                            if(tweet.user?.id_str) found.get(id).add(String(tweet.user.id_str));
                        }
                    }
                    resolve(found);
                } catch(e) {
                    reject(e);
                }
            };
            xhr.onerror = () => reject(failure("no answer"));
            xhr.send();
        });
    }

    // AudioSpaceById's id and features: x.com's main.js's (interception.js finds them and keeps them a day), then
    // the ones known when this was written. main.js not having them is asked again an hour later.
    let mainFailedAt = -Infinity;
    async function spaceQueries() {
        const queries = [];
        if(typeof graphqlQuery === "function" && Date.now() - mainFailedAt > 60 * 60 * 1000) {
            try {
                queries.push(await graphqlQuery("AudioSpaceById", "query", "OTDaudioSpaceQuery"));
            } catch(e) {
                mainFailedAt = Date.now();
            }
        }
        if(!queries.some(query => query.id === SPACE_QUERY.id)) queries.push(SPACE_QUERY);
        return queries;
    }
    async function details(id, user) {
        let last;
        for(const query of await spaceQueries()) {
            const params = new URLSearchParams({
                variables: JSON.stringify({ id, isMetatagsQuery: false, withReplays: true, withListeners: true }),
                features: JSON.stringify(query.features),
            });
            try {
                return readSpace(await getJSON(`/i/api/graphql/${query.id}/AudioSpaceById`, params, user), id);
            } catch(e) {
                last = e;
                // an id or features X doesn't take: the next ones
                if(![400, 404, 422].includes(e.status)) break;
            }
        }
        throw last;
    }

    const user = result => result?.result ?? result;
    function person(entry) {
        const result = user(entry?.user_results);
        return {
            id: String(entry?.user_results?.rest_id ?? result?.rest_id ?? ""),
            name: String(entry?.display_name ?? ""),
            screenName: String(entry?.twitter_screen_name ?? ""),
            avatar: String(entry?.avatar_url ?? ""),
        };
    }
    // a Space as the column shows it; one X doesn't have is gone
    function readSpace(data, id) {
        const space = data?.data?.audioSpace;
        const meta = space?.metadata;
        if(!meta) return { id, kind: "gone" };
        const now = Date.now();
        const scheduled = Number(meta.scheduled_start) || 0;
        const kind = meta.state === "Running" ? "live"
            : (meta.state === "NotStarted" || meta.state === "PrePublished") && scheduled > now - LATE ? "coming"
            : "gone";
        const participants = space.participants || {};
        const admins = (participants.admins || []).map(person);
        const creator = user(meta.creator_results);
        const host = creator?.rest_id ? {
            id: String(creator.rest_id),
            name: String(creator.core?.name ?? creator.legacy?.name ?? admins[0]?.name ?? ""),
            screenName: String(creator.core?.screen_name ?? creator.legacy?.screen_name ?? admins[0]?.screenName ?? ""),
            avatar: String(creator.avatar?.image_url ?? creator.legacy?.profile_image_url_https ?? admins[0]?.avatar ?? ""),
        } : admins[0] || null;
        return {
            id, kind,
            title: String(meta.title || ""),
            startedAt: Number(meta.started_at) || 0,
            scheduled,
            listening: Number(meta.total_live_listeners) || 0,
            host,
            admins,
            speakers: (participants.speakers || []).map(person),
            listeners: (participants.listeners || []).map(person),
        };
    }

    // --- what's known, by account -----------------------------------------------------------------------------
    const states = new Map();
    function stateOf(user) {
        if(!states.has(user)) states.set(user, {
            fleet: new Map(), found: new Map(), details: new Map(),
            fleetAt: 0, searchAt: 0, checkedAt: 0, fleetStatus: "", searchStatus: "", detailsStatus: "", busy: null,
        });
        return states.get(user);
    }
    function refresh(user, force = false) {
        const state = stateOf(user);
        if(state.busy) return state.busy;
        state.busy = (async () => {
            const now = Date.now();
            const asked = [];
            if(force || now - state.fleetAt >= LIVE_EVERY) {
                asked.push(fleetline(user).then(people => {
                    state.fleet = people;
                    state.fleetStatus = "ok";
                }, e => {
                    state.fleetStatus = describe(e);
                }).finally(() => state.fleetAt = Date.now()));
            }
            if(force || now - state.searchAt >= SEARCH_EVERY) {
                asked.push(search(user).then(found => {
                    state.found = found;
                    state.searchStatus = "ok";
                }, e => {
                    state.searchStatus = describe(e);
                }).finally(() => state.searchAt = Date.now()));
            }
            await Promise.all(asked);
            const ids = new Set([...state.fleet.keys(), ...state.found.keys()]);
            for(const id of state.details.keys()) if(!ids.has(id)) state.details.delete(id);
            let fine = 0, failed = 0;
            for(const id of ids) {
                const known = state.details.get(id);
                // one the fleetline has is live, whatever was known of it
                const kind = known?.space ? (state.fleet.has(id) && known.space.kind !== "live" ? "live" : known.space.kind) : "live";
                if(known && Date.now() - known.at < KEEP[kind]) continue;
                try {
                    state.details.set(id, { at: Date.now(), space: await details(id, user) });
                    fine++;
                } catch(e) {
                    state.details.set(id, { at: Date.now(), space: known?.space || null });
                    failed++;
                    state.detailsStatus = describe(e);
                }
            }
            // nothing was due
            if(!asked.length && !fine && !failed) return;
            state.checkedAt = Date.now();
            const { live, coming } = lists(state);
            document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({
                kind: "spaces", fleetline: state.fleetStatus, search: state.searchStatus,
                details: `${fine} fine, ${failed} failed${failed ? ` (${state.detailsStatus})` : ""}`, live: live.length, coming: coming.length,
            }) }));
        })().catch(e => console.error("[otd-spaces]", e)).finally(() => {
            state.busy = null;
            render();
        });
        return state.busy;
    }

    // the live ones, the ones the people the user follows host first, then speak in, then most listened to; the
    // ones to come, the soonest first
    const RANK = { host: 0, speaker: 1, listener: 2 };
    function lists(state) {
        const live = [], coming = [];
        for(const { space } of state.details.values()) {
            if(space?.kind === "live") live.push({ space, yours: yours(space, state.fleet.get(space.id)) });
            else if(space?.kind === "coming") coming.push({ space, yours: [] });
        }
        const best = item => Math.min(3, ...item.yours.map(y => RANK[y.role]));
        live.sort((a, b) => best(a) - best(b) || b.space.listening - a.space.listening);
        coming.sort((a, b) => a.space.scheduled - b.space.scheduled);
        return { live, coming };
    }
    // the people the user follows in a Space and what they do in it; one the Space's lists don't have listens
    function yours(space, people) {
        const found = [];
        for(const id of people || []) {
            const role = space.host?.id === id || space.admins.some(p => p.id === id) ? "host"
                : space.speakers.some(p => p.id === id) ? "speaker" : "listener";
            const known = [...space.admins, ...space.speakers, ...space.listeners].find(p => p.id === id);
            found.push({ id, role, name: known?.name || (space.host?.id === id ? space.host.name : "") });
        }
        return found;
    }

    // --- drawing ----------------------------------------------------------------------------------------------
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }
    const spaceUrl = id => `https://x.com/i/spaces/${id}`;
    function link(href, className, text) {
        const a = el("a", className, text);
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        return a;
    }
    function avatar(url, className) {
        const img = el("img", className);
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        // one that doesn't load leaves its place empty, not a broken image
        img.addEventListener("error", () => { img.style.visibility = "hidden"; });
        if(/^https:\/\//.test(url)) img.src = url;
        else img.style.visibility = "hidden";
        return img;
    }
    const plural = (n, forms) => forms[plurals.select(n)] ?? forms.other;
    function when(time) {
        const date = new Date(time), now = new Date();
        const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const days = Math.round((day(date) - day(now)) / 864e5);
        if(days === 0) return T.today(clock.format(date));
        if(days === 1) return T.tomorrow(clock.format(date));
        return dated.format(date);
    }
    // "Alice hosts · Bob, Carol speak · Dan and 2 more listen", the host left out: the card has them
    function yoursLine(items, host) {
        const parts = [];
        for(const role of ["host", "speaker", "listener"]) {
            const all = items.filter(item => item.role === role && item.id !== host?.id);
            if(!all.length) continue;
            const named = all.filter(item => item.name).slice(0, 3).map(item => item.name);
            const rest = all.length - named.length;
            const who = named.length ? `${named.join(", ")}${rest ? ` ${T.more(rest)}` : ""}` : `${rest} ${plural(rest, T.people)}`;
            parts.push(`${who} ${T.roles[role][all.length === 1 ? 0 : 1]}`);
        }
        return parts.join(" · ");
    }
    function card({ space, yours }) {
        const live = space.kind === "live";
        const item = el("article", `otd-space ${live ? "is-live" : "is-coming"}`);
        item.dataset.spaceId = space.id;

        const top = el("div", "otd-space-top");
        top.append(el("span", "otd-space-badge", live ? T.liveBadge : T.comingBadge));
        if(live && space.startedAt) {
            const minutes = Math.max(0, Math.floor((Date.now() - space.startedAt) / 60000));
            top.append(el("span", "otd-space-when", T.liveFor(Math.floor(minutes / 60), minutes % 60)));
        } else if(!live && space.scheduled) {
            top.append(el("span", "otd-space-when", space.scheduled <= Date.now() ? T.startsSoon : T.startsAt(when(space.scheduled))));
        }
        item.append(top);

        const title = space.title || `${T.untitled}${space.host?.name ? ` · ${space.host.name}` : ""}`;
        item.append(link(spaceUrl(space.id), "otd-space-title", title));

        if(space.host) {
            const host = el("div", "otd-space-host");
            host.append(avatar(space.host.avatar, "otd-space-avatar"), el("span", "otd-space-name", space.host.name));
            if(space.host.screenName) host.append(el("span", "otd-space-handle", `@${space.host.screenName}`));
            item.append(host);
        }

        const speakers = [...space.admins, ...space.speakers].filter(p => p.id !== space.host?.id && p.avatar);
        if(speakers.length || live) {
            const people = el("div", "otd-space-people");
            if(speakers.length) {
                const faces = el("span", "otd-space-faces");
                for(const p of speakers.slice(0, 5)) {
                    const face = avatar(p.avatar);
                    face.title = p.name;
                    faces.append(face);
                }
                people.append(faces);
            }
            if(live) people.append(el("span", "otd-space-count", `${count.format(space.listening)} ${plural(space.listening, T.listeners)}`));
            item.append(people);
        }

        const line = yoursLine(yours, space.host);
        if(line) item.append(el("p", "otd-space-yours", `${T.yours} ${line}`));

        const actions = el("div", "otd-space-actions");
        actions.append(link(spaceUrl(space.id), "otd-space-listen", live ? T.listen : T.open));
        item.append(actions);
        return item;
    }
    function message(title, hint, button, action) {
        const box = el("div", "otd-column-state otd-spaces-state");
        box.append(el("p", "otd-column-state-title", title));
        if(hint) box.append(el("p", "otd-column-state-hint", hint));
        if(button) {
            const go = el("button", "otd-column-state-action Button--primary", button);
            go.type = "button";
            go.addEventListener("click", action);
            box.append(go);
        }
        return box;
    }
    // the scheduled ones folded, by column, as the user leaves them
    const folded = new Map();
    function content(column) {
        const state = stateOf(column.user);
        const { live, coming } = lists(state);
        const nodes = [];
        if(!state.checkedAt) {
            nodes.push(message(T.searching, T.searchingHint));
        } else if(!live.length && !coming.length) {
            // nothing from either, or Spaces X didn't tell about
            const unknown = [...state.details.values()].some(known => !known.space);
            const failed = state.fleetStatus !== "ok" && state.searchStatus !== "ok" ? state.fleetStatus || state.searchStatus
                : unknown ? state.detailsStatus : "";
            nodes.push(failed
                ? message(T.failed, T.failedHint(failed), T.retry, () => refresh(column.user, true))
                : message(T.none, T.noneHint));
        } else {
            const section = el("div", "otd-spaces-section otd-spaces-live");
            section.append(el("div", "otd-spaces-heading", live.length ? `${T.live} · ${live.length}` : T.live));
            if(live.length) section.append(...live.map(card));
            else section.append(el("p", "otd-spaces-note", T.noneLive));
            nodes.push(section);
            if(coming.length) {
                const later = el("details", "otd-spaces-section otd-spaces-coming");
                later.open = !folded.get(column.key);
                later.addEventListener("toggle", () => folded.set(column.key, !later.open));
                later.append(el("summary", "otd-spaces-heading", `${T.coming} · ${coming.length}`), ...coming.map(card));
                nodes.push(later);
            }
        }
        if(state.checkedAt) {
            const checked = el("p", "otd-spaces-checked", `${T.checked(clock.format(new Date(state.checkedAt)))} · `);
            const again = el("button", "otd-spaces-refresh", T.refresh);
            again.type = "button";
            again.addEventListener("click", () => refresh(column.user, true));
            checked.append(again);
            nodes.push(checked);
        }
        return nodes;
    }
    // each column drawn again only when what it shows changed
    const drawn = new WeakMap();
    function render() {
        for(const column of columns()) {
            const box = mount(column);
            if(!box) continue;
            const nodes = content(column);
            const html = nodes.map(node => node.outerHTML).join("");
            if(drawn.get(box) === html) continue;
            drawn.set(box, html);
            box.replaceChildren(...nodes);
        }
    }
    function mount(column) {
        column.section.classList.add("otd-spaces-column");
        const scroller = column.section.querySelector(".js-column-scroller");
        if(!scroller) return null;
        let box = scroller.querySelector(":scope > .otd-spaces");
        if(!box) {
            box = el("div", "otd-spaces");
            scroller.prepend(box);
        }
        return box;
    }

    // every 10 s what's due, while the page is in view; a new column at once
    function tick() {
        if(document.hidden) return;
        const users = new Set(columns().map(column => column.user));
        for(const user of users) refresh(user);
        render();
    }
    OTD.watch(() => {
        const found = columns();
        if(!found.length) return;
        if(found.some(column => !column.section.querySelector(".js-column-scroller > .otd-spaces"))) tick();
    });
    setInterval(tick, 10 * 1000);
    document.addEventListener("visibilitychange", tick);

    OTD.addStyle(`
        section.otd-spaces-column .js-column-scroller > :not(.otd-spaces) { display: none !important; }
        .otd-spaces { --otd-live: #d0304f; padding: 6px 10px 16px; color: var(--otd-text, #14171a); font-size: 14px; line-height: 1.35; text-shadow: none; }
        html.dark .otd-spaces { --otd-live: #ff6b81; color: var(--otd-text, #fff); }
        .otd-spaces-section { margin: 0 0 6px; }
        .otd-spaces .otd-spaces-heading { display: block; margin: 8px 4px 8px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--otd-text-2, #657786); }
        .otd-spaces summary.otd-spaces-heading { cursor: pointer; list-style: none; }
        .otd-spaces summary.otd-spaces-heading::-webkit-details-marker { display: none; }
        .otd-spaces summary.otd-spaces-heading::before { content: "▸"; display: inline-block; width: 1em; transition: transform .15s; }
        .otd-spaces details[open] > summary.otd-spaces-heading::before { transform: rotate(90deg); }
        .otd-spaces .otd-spaces-note { margin: 0 4px 8px; color: var(--otd-text-2, #657786); }
        .otd-space { margin: 0 0 8px; padding: 12px; border-radius: 12px; background: var(--otd-raised, rgba(0, 0, 0, .035)); }
        .otd-space-top { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0 0 6px; font-size: 12px; color: var(--otd-text-2, #657786); }
        .otd-space-badge { font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--otd-accent, #1d9bf0); }
        .otd-space.is-live .otd-space-badge { color: var(--otd-live); }
        .otd-space.is-live .otd-space-badge::before { content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: currentColor; vertical-align: 1px; animation: otd-space-pulse 1.6s ease-in-out infinite; }
        @keyframes otd-space-pulse { 50% { opacity: .35; } }
        @media (prefers-reduced-motion: reduce) { .otd-space.is-live .otd-space-badge::before { animation: none; } }
        .otd-spaces a.otd-space-title { display: block; margin: 0 0 8px; font-size: 15px; font-weight: 700; line-height: 1.3; color: var(--otd-text, #14171a); text-decoration: none; overflow-wrap: anywhere; }
        html.dark .otd-spaces a.otd-space-title { color: var(--otd-text, #fff); }
        .otd-spaces a.otd-space-title:hover { text-decoration: underline; }
        .otd-space-host { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .otd-space-avatar { flex: none; width: 24px; height: 24px; border-radius: 50%; background: var(--otd-ghost, rgba(0, 0, 0, .05)); object-fit: cover; }
        .otd-space-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .otd-space-handle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--otd-text-3, #657786); }
        .otd-space-people { display: flex; align-items: center; gap: 8px; margin: 8px 0 0; font-size: 13px; color: var(--otd-text-2, #657786); }
        .otd-space-faces { display: flex; }
        .otd-space-faces > img { width: 20px; height: 20px; margin-left: -6px; border: 2px solid var(--otd-panel, #fff); border-radius: 50%; background: var(--otd-ghost, rgba(0, 0, 0, .05)); object-fit: cover; }
        .otd-space-faces > img:first-child { margin-left: 0; }
        .otd-spaces .otd-space-yours { margin: 8px 0 0; font-size: 13px; color: var(--otd-text-2, #657786); }
        .otd-space-actions { margin: 10px 0 0; }
        .otd-spaces a.otd-space-listen { display: inline-block; padding: 6px 14px; border-radius: 999px; background: var(--otd-accent-fill, #1d9bf0); color: #fff; font-size: 13px; font-weight: 700; line-height: 1.2; text-decoration: none; }
        .otd-spaces a.otd-space-listen:hover { filter: brightness(1.1); text-decoration: none; }
        .otd-spaces .is-coming a.otd-space-listen { background: var(--otd-ghost, rgba(0, 0, 0, .05)); color: var(--otd-text, #14171a); }
        html.dark .otd-spaces .is-coming a.otd-space-listen { color: var(--otd-text, #fff); }
        .otd-spaces .otd-spaces-checked { margin: 10px 4px 0; font-size: 12px; color: var(--otd-text-3, #657786); }
        .otd-spaces .otd-spaces-refresh { padding: 0; border: 0; background: none; color: var(--otd-accent, #1d9bf0); font: inherit; cursor: pointer; }
        .otd-spaces .otd-spaces-refresh:hover { text-decoration: underline; }
    `);
})();
