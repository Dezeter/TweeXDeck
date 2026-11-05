// The Spaces column (for-you.js makes it, interception.js answers its requests for tweets empty): the Spaces of
// the people the user follows, the live ones first, then the ones to come.
// - Live: X's fleetline, which x.com asks for the Spaces over Home, has the live ones with people the user follows
//   in them, hosting, speaking or only listening;
// - To come: what people the user follows tweeted with a Space's link, from TweetDeck's own search (filter:follows
//   filter:spaces), every 5 minutes; live ones it finds too;
// - Each one's title, host, speakers, listeners and times from AudioSpaceById, by the id and features of x.com's
//   main.js when it has them, the ones known when this was written otherwise.
// "Listen" plays a live one right here, one at a time, in a player on top of the column it was started from: its
// stream from live_video_stream/status, played with hls.js (files/hls/, Apache 2.0) or the browser's own HLS. The
// player shows who's on stage and who speaks, from what X's stream itself carries in its chunks (ID3 tags), and
// captions from the Space's chat where it has one. Live
// ones are asked for every minute while the page is in view; nothing is asked while there's no Spaces column.
// Loaded by injection.js after for-you.js.
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
            pause: "Пауза", play: "Слушать", close: "Закрыть", volume: "Громкость", again: "Ещё раз",
            connecting: "Подключаемся…", playing: "В эфире", paused: "На паузе", ended: "Спейс закончился",
            cantPlay: status => `Не удалось подключиться (${status})`, noBrowser: "браузер не играет такой поток",
            speaking: name => `Говорит ${name}`, captions: "Субтитры", stage: "На сцене", wide: "Субтитры во всю ширину колонки",
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
            pause: "Pause", play: "Listen", close: "Close", volume: "Volume", again: "Try again",
            connecting: "Connecting…", playing: "Live", paused: "Paused", ended: "The Space has ended",
            cantPlay: status => `Couldn't connect (${status})`, noBrowser: "the browser doesn't play this stream",
            speaking: name => `${name} is speaking`, captions: "Captions", stage: "On stage", wide: "Captions across the column",
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
        // what X tells of one on stage, for the diagnostics: its fields' names only
        const onStage = participants.speakers?.[0] || participants.admins?.[0];
        if(onStage) participantShape = shape(onStage);
        // and of the whole of it, but its people
        spaceShape = shape({ ...space, participants: undefined });
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
            mediaKey: String(meta.media_key || ""),
            startedAt: Number(meta.started_at) || 0,
            scheduled,
            listening: Number(meta.total_live_listeners) || 0,
            host,
            admins,
            speakers: (participants.speakers || []).map(person),
            listeners: (participants.listeners || []).map(person),
        };
    }

    let participantShape = "", spaceShape = "";

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
            if(player.space && player.user === user) heard(state.details.get(player.space.id)?.space);
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
    function card({ space, yours }, column) {
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
        if(live && space.mediaKey) {
            // the one playing pauses, the one paused goes on
            const current = player.space?.id === space.id;
            const playing = current && (player.state === "playing" || player.state === "connecting");
            const button = el("button", `otd-space-listen${current ? " is-current" : ""}`, playing ? T.pause : T.listen);
            button.type = "button";
            button.addEventListener("click", () => current && player.state !== "ended" && player.state !== "failed" ? toggle() : listen(space, column));
            actions.append(button);
        } else {
            actions.append(link(spaceUrl(space.id), "otd-space-listen", live ? T.listen : T.open));
        }
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
            if(live.length) section.append(...live.map(item => card(item, column)));
            else section.append(el("p", "otd-spaces-note", T.noneLive));
            nodes.push(section);
            if(coming.length) {
                const later = el("details", "otd-spaces-section otd-spaces-coming");
                later.open = !folded.get(column.key);
                later.addEventListener("toggle", () => folded.set(column.key, !later.open));
                later.append(el("summary", "otd-spaces-heading", `${T.coming} · ${coming.length}`), ...coming.map(item => card(item, column)));
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
        drawPlayer();
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

    // --- listening --------------------------------------------------------------------------------------------
    // the Space playing, the column it was started from and its account, and how it goes: connecting, playing,
    // paused, ended, failed
    // recovered: the media errors hls.js got the media going again after; recoveries: how many in a row
    const player = { space: null, column: "", user: "", state: "", error: "", chatToken: "", audio: null, hls: null, token: null, pausedAt: 0, recovered: [], recoveredAt: -Infinity, recoveries: 0 };
    const VOLUME_STORAGE = "OTDspacesVolume";
    const volume = () => {
        const value = Number(localStorage[VOLUME_STORAGE]);
        return localStorage[VOLUME_STORAGE] !== undefined && value >= 0 && value <= 1 ? value : 1;
    };

    // hls.js, the first time a Space is played: a global of the page, not a module of an AMD loader the page has
    let hlsLoad = null;
    function loadHls() {
        if(window.Hls) return Promise.resolve(window.Hls);
        hlsLoad ??= fetch(`${OTD.BASE_URL}files/hls/hls.light.min.js`).then(res => {
            if(!res.ok) throw failure(`hls.js: HTTP ${res.status}`, res.status);
            return res.text();
        }).then(code => {
            const amd = typeof window.define === "function" && window.define.amd ? window.define : null;
            if(amd) window.define = undefined;
            try {
                const script = document.createElement("script");
                script.textContent = code;
                (document.getElementById("injected-head") || document.head).appendChild(script);
            } finally {
                if(amd) window.define = amd;
            }
            if(!window.Hls) throw new Error("hls.js didn't load");
            return window.Hls;
        }).catch(e => {
            hlsLoad = null;
            throw e;
        });
        return hlsLoad;
    }

    // where a live Space's audio is: live_video_stream/status by its media key; the chat's token for its captions
    async function streamOf(space, user) {
        const data = await getJSON(`/i/api/1.1/live_video_stream/status/${encodeURIComponent(space.mediaKey)}`, `client=web&use_syndication_guest_id=false&cookie_set_host=${location.hostname}`, user);
        const url = data?.source?.noRedirectLocation || data?.source?.location;
        if(!/^https:\/\//.test(url || "")) throw failure("no stream");
        return { url, chatToken: String(data.chatToken || "") };
    }

    // one of its own for each Space played: what the one before still says once it's let go of isn't heard
    function audioElement() {
        const audio = player.audio = new Audio();
        audio.preload = "auto";
        const set = state => () => {
            if(player.audio !== audio || !player.space || player.state === "ended" || player.state === "failed") return;
            if(player.state !== state) {
                player.state = state;
                changed();
            }
        };
        audio.addEventListener("playing", set("playing"));
        audio.addEventListener("waiting", set("connecting"));
        audio.addEventListener("pause", () => {
            if(player.audio === audio) player.pausedAt = Date.now();
            set("paused")();
        });
        audio.addEventListener("ended", () => {
            if(player.audio === audio && player.space) end();
        });
        return audio;
    }

    async function listen(space, column) {
        stop(false);
        const audio = audioElement();
        audio.volume = volume();
        const token = {};
        Object.assign(player, { space, column: column.key, user: column.user, state: "connecting", error: "", chatToken: "", token, recovered: [], recoveredAt: -Infinity, recoveries: 0 });
        metadata.clear();
        resetHydra();
        changed();
        try {
            const stream = await streamOf(space, column.user);
            if(player.token !== token) return;
            player.chatToken = stream.chatToken;
            openChat(stream.chatToken, token);
            let Hls = null;
            try {
                Hls = await loadHls();
            } catch(e) {
                console.warn("[otd-spaces] hls.js", e);
            }
            if(player.token !== token) return;
            if(Hls?.isSupported()) {
                const hls = player.hls = new Hls({ liveDurationInfinity: true });
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if(!data?.fatal || player.token !== token) return;
                    // what hls.js says, and the audio element's own error that's often behind it: a chunk it couldn't
                    // append as the browser had given up on the media
                    const media = audio.error ? ` [media ${audio.error.code}${audio.error.message ? ` ${audio.error.message}` : ""}]` : "";
                    const what = `${data.details || data.type}${media}${data.error?.message ? `: ${data.error.message}` : ""}`.slice(0, 160);
                    // the media choking now and then, as hls.js's own docs have it: it gets the media going again, three
                    // times in a row; a fourth, before half a minute has gone without one, and the player says so
                    const now = performance.now();
                    if(now - player.recoveredAt > 30000) player.recoveries = 0;
                    if(data.type === Hls.ErrorTypes.MEDIA_ERROR && player.recoveries < 3) {
                        player.recoveries++;
                        player.recoveredAt = now;
                        player.recovered.push(what);
                        report();
                        // the media taken back pauses the audio without a word, as a browser loading it does: unless the
                        // listener paused it, it plays on once hls.js has it again
                        if(player.state !== "paused") hls.once(Hls.Events.MEDIA_ATTACHED, () => {
                            if(player.token === token && player.audio === audio) audio.play().catch(e => console.warn("[otd-spaces]", e));
                        });
                        hls.recoverMediaError();
                        return;
                    }
                    fail(data.response?.code ? `HTTP ${data.response.code}` : what);
                });
                // the stream's own timed metadata, ID3 in its chunks: what kinds come, for the diagnostics
                hls.on(Hls.Events.FRAG_PARSING_METADATA, (event, data) => {
                    if(player.token === token) heardMetadata(data?.samples);
                });
                hls.loadSource(stream.url);
                hls.attachMedia(audio);
            } else if(audio.canPlayType("application/vnd.apple.mpegurl")) {
                audio.src = stream.url;
            } else {
                throw failure(T.noBrowser);
            }
            try {
                await audio.play();
            } catch(e) {
                // the browser wants a click of its own: the player's ▶
                if(player.token === token && e?.name === "NotAllowedError") {
                    player.state = "paused";
                    changed();
                // the media choked before it began, taken back by hls.js, which plays it then
                } else if(!(player.token === token && e?.name === "AbortError" && player.recovered.length)) throw e;
            }
        } catch(e) {
            if(player.token === token) fail(describe(e));
        }
    }
    function fail(error) {
        release();
        player.state = "failed";
        player.error = error;
        changed();
    }
    function end() {
        release();
        player.state = "ended";
        changed();
    }
    // the stream let go of, the player kept to say what happened
    function release() {
        player.token = null;
        closeChat();
        clearInterval(hydra.timer);
        hydra.timer = 0;
        player.hls?.destroy();
        player.hls = null;
        if(player.audio) {
            player.audio.pause();
            player.audio.removeAttribute("src");
            player.audio.load();
        }
    }
    // the player gone too; drawn again unless it's for another one
    function stop(draw = true) {
        const was = player.space;
        release();
        Object.assign(player, { space: null, column: "", user: "", state: "", error: "", chatToken: "" });
        if(was && draw) changed();
    }
    function toggle() {
        const audio = player.audio;
        if(!audio || !player.space) return;
        if(!audio.paused) {
            audio.pause();
            return;
        }
        // back at the live edge after a pause of more than a few seconds
        const edge = player.hls?.liveSyncPosition;
        if(edge && Date.now() - player.pausedAt > 5000) audio.currentTime = edge;
        audio.play().catch(e => fail(describe(e)));
    }
    // what a refresh brought of the Space playing: ended, or what it is now
    function heard(space) {
        if(!space || !player.space || space.id !== player.space.id) return;
        if(space.kind !== "live") {
            if(player.state !== "ended" && player.state !== "failed") end();
            return;
        }
        player.space = space;
    }
    // the cards' buttons, the player, and what the system's media controls show
    function changed() {
        render();
        mediaSession();
        report();
    }
    // for the load watchdog: how the player goes, and its chat: whether it's open, how many captions came, and the
    // kinds of messages it had, by their fields' names, without what's in them
    function report() {
        document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({
            kind: "spaces-player", state: player.state || "stopped", error: player.error, recovered: player.recovered.slice(-3),
            chat: chat.liveFailed ? `live chat ${chat.liveFailed}; ${chat.status}` : chat.via === "X's live chat" ? `live chat ${chat.status}` : chat.status, captionsAsked: chat.asked, captions: chat.captions, messages: [...chat.shapes.keys()], answers: chat.answers,
            metadata: [...metadata].map(([kind, n]) => `${kind} ×${n}`), participant: participantShape, space: spaceShape, hydra: hydraStats(),
        }) }));
    }

    // --- the stream's metadata ---------------------------------------------------------------------------------
    // ID3 tags hls.js finds in the stream's chunks, by the kind of each frame in them: its id, the description or
    // owner it has, and what its value is made of, a JSON one by its fields; counted. Nothing of what's in them.
    const metadata = new Map();
    function heardMetadata(samples) {
        let heard = false;
        for(const sample of samples || []) {
            for(const frame of id3Frames(sample?.data)) {
                if(frame.id === "TXXX" && HYDRA.includes(frame.label)) heardHydra(frame.label, json(frame.raw), Number(sample.pts));
                if(frame.id === "TXXX" && frame.label === "JSONMetadata") heardClock(json(frame.raw), Number(sample.pts));
                const kind = `${frame.id}${frame.label ? `(${frame.label.slice(0, 60)})` : ""}:${frame.value}`.slice(0, 200);
                if(!metadata.has(kind) && metadata.size >= 12) continue;
                metadata.set(kind, (metadata.get(kind) || 0) + 1);
                heard = true;
            }
        }
        // once for a chunk's, a few seconds apart
        if(heard) report();
    }
    // the frames of an ID3v2 tag: id, the description (TXXX, WXXX) or owner (PRIV, GEOB) before its value, the value's
    // make
    function id3Frames(bytes) {
        const frames = [];
        if(!(bytes instanceof Uint8Array) || bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return frames;
        const version = bytes[3];
        const syncsafe = at => ((bytes[at] & 0x7f) << 21) | ((bytes[at + 1] & 0x7f) << 14) | ((bytes[at + 2] & 0x7f) << 7) | (bytes[at + 3] & 0x7f);
        const end = Math.min(bytes.length, 10 + syncsafe(6));
        let at = 10;
        while(at + 10 <= end && frames.length < 20) {
            const id = String.fromCharCode(...bytes.subarray(at, at + 4));
            if(!/^[A-Z0-9]{4}$/.test(id)) break;
            const size = version >= 4 ? syncsafe(at + 4) : (bytes[at + 4] << 24 | bytes[at + 5] << 16 | bytes[at + 6] << 8 | bytes[at + 7]) >>> 0;
            const body = bytes.subarray(at + 10, Math.min(end, at + 10 + size));
            frames.push(id3Frame(id, body));
            at += 10 + size;
        }
        return frames;
    }
    function id3Frame(id, body) {
        const text = (part, encoding) => {
            try {
                return new TextDecoder(encoding === 1 ? "utf-16" : encoding === 2 ? "utf-16be" : encoding === 3 ? "utf-8" : "latin1").decode(part).replace(/\0+$/, "");
            } catch(e) {
                return "";
            }
        };
        const valueOf = string => {
            const parsed = json(string);
            return parsed && typeof parsed === "object" ? shape(parsed) : string ? `text(${string.length})` : "empty";
        };
        if(id === "PRIV" || id === "GEOB") {
            const zero = body.indexOf(0);
            return { id, label: text(body.subarray(0, zero < 0 ? body.length : zero), 0), value: `bytes(${zero < 0 ? 0 : body.length - zero - 1})` };
        }
        if(id === "TXXX" || id === "WXXX") {
            const encoding = body[0], wide = encoding === 1 || encoding === 2;
            let zero = 1;
            while(zero < body.length && !(body[zero] === 0 && (!wide || body[zero + 1] === 0))) zero += wide ? 2 : 1;
            const raw = text(body.subarray(zero + (wide ? 2 : 1)), id === "WXXX" ? 0 : encoding);
            return { id, label: text(body.subarray(1, zero), encoding), value: valueOf(raw), raw };
        }
        if(id[0] === "T") return { id, label: "", value: valueOf(text(body.subarray(1), body[0])) };
        return { id, label: "", value: `bytes(${body.length})` };
    }

    // --- who's on stage and who speaks, from the stream ----------------------------------------------------------
    // X's stream carries them in its chunks' ID3 tags, as x.com shows them: TXXX "HydraParticipants", the ones on
    // stage with the host, [{ ParticipantIndex, UserName, UserId, ProfileUrl }], with each chunk, and TXXX
    // "HydraAudioLevel", how loud each is, a few times a second: the host's first, then theirs in the list's order,
    // where the host isn't in it, as X's is. Each has its time in the stream (hls.js's pts), so it's applied as the
    // audio gets there. Someone speaks while they're loud next to the loudest of the last seconds, and a moment after.
    const HYDRA = ["HydraParticipants", "HydraAudioLevel"];
    // the stream's clock: TXXX "JSONMetadata" { HydraVersion, ntp } in its chunks, the time of day of that place in
    // the stream, for what's heard to be told the time of day it was said at; { pts, ms }
    const streamClock = [];
    function heardClock(value, pts) {
        const ms = wallClock(Number(value?.ntp));
        if(!Number.isFinite(ms) || !Number.isFinite(pts)) return;
        streamClock.push({ pts, ms });
        if(streamClock.length > 1 && streamClock[streamClock.length - 2].pts > pts) streamClock.sort((a, b) => a.pts - b.pts);
        if(streamClock.length > 60) streamClock.splice(0, streamClock.length - 60);
    }
    // a time of day in whatever X counts it in, milliseconds, seconds, NTP's seconds from 1900 or its fixed point, as
    // milliseconds; the one that's about now
    function wallClock(ntp) {
        if(!Number.isFinite(ntp) || ntp <= 0) return NaN;
        const now = Date.now();
        return [ntp, ntp * 1000, (ntp - 2208988800) * 1000, ntp / 1000, ntp / 1e6, (ntp / 2 ** 32 - 2208988800) * 1000]
            .find(ms => Math.abs(ms - now) < 10 * 60 * 1000) ?? NaN;
    }
    // the time of day what's heard now was said at; NaN where the stream doesn't tell, -Infinity where its clock is
    // all ahead of what's heard
    function heardAt() {
        const at = player.audio?.currentTime;
        if(!streamClock.length || !Number.isFinite(at)) return NaN;
        let mark = null;
        for(const tick of streamClock) if(tick.pts <= at + 0.05) mark = tick;
        return mark ? mark.ms + (at - mark.pts) * 1000 : -Infinity;
    }
    const SPOKE_FOR = 700;
    const hydra = { queue: [], participants: [], spoke: new Map(), loudest: null, peak: 0, peakAt: 0, timer: 0, stats: null };
    function resetHydra() {
        clearInterval(hydra.timer);
        streamClock.length = 0;
        Object.assign(hydra, { queue: [], participants: [], spoke: new Map(), loudest: null, peak: 0, peakAt: 0, timer: 0,
            stats: { levels: 0, lengths: new Set(), ways: new Set(), min: Infinity, max: -Infinity, offClock: false } });
    }
    resetHydra();
    function heardHydra(kind, value, pts) {
        if(!Array.isArray(value) || !Number.isFinite(pts)) return;
        // in the order of their times in the stream, whatever order they came in: one far ahead holds up none after it
        const queue = hydra.queue;
        queue.push({ kind, value, pts });
        if(queue.length > 1 && queue[queue.length - 2].pts > pts) queue.sort((a, b) => a.pts - b.pts);
        if(queue.length > 400) queue.splice(0, queue.length - 400);
        if(!hydra.timer) hydra.timer = setInterval(hydraTick, 150);
    }
    // what the audio has got to; what's far behind it dropped, what's far ahead of it, on another clock, taken as
    // it comes
    function hydraTick() {
        const audio = player.audio;
        if(!audio || !player.space) return;
        const at = audio.currentTime;
        let applied = false;
        while(hydra.queue.length) {
            const ahead = hydra.queue[0].pts - at;
            if(ahead > 0.05 && ahead < 30) break;
            const item = hydra.queue.shift();
            if(ahead < -5) continue;
            if(ahead >= 30) hydra.stats.offClock = true;
            applyHydra(item);
            applied = true;
        }
        if(applied || hydra.spoke.size) drawSpeaking();
    }
    function applyHydra({ kind, value }) {
        if(kind === "HydraParticipants") {
            // in the list's order, which the levels are in; ParticipantIndex is a number of X's, as big as 2142652186
            hydra.participants = value.filter(p => p && typeof p === "object" && p.UserName).map(p => ({
                index: Number(p.ParticipantIndex), screenName: String(p.UserName), id: String(p.UserId || ""), avatar: String(p.ProfileUrl || ""),
            }));
            newcomers();
            return;
        }
        const levels = value.map(Number);
        const stats = hydra.stats;
        stats.levels++;
        if(stats.lengths.size < 6) stats.lengths.add(levels.length);
        for(const level of levels) if(Number.isFinite(level)) {
            stats.min = Math.min(stats.min, level);
            stats.max = Math.max(stats.max, level);
        }
        const people = hydra.participants;
        if(!people.length) return;
        // one level for each of them: by place in the list; one more, the host not in it: the host's first, then
        // theirs; else by their indexes, where they're small enough; decibels as power
        const host = hydraHost();
        const way = levels.length === people.length ? "by place" : levels.length === people.length + 1 ? (host ? "the host's first" : "the first one no one's")
            : people.every(p => p.index >= 0 && p.index < levels.length) ? "by index" : "unmatched";
        if(stats.ways.size < 4) stats.ways.add(way);
        const power = level => !Number.isFinite(level) ? 0 : level < 0 ? 10 ** (level / 20) : level;
        const loud = people.map((person, i) => ({ person,
            level: power(way === "by place" ? levels[i] : way === "by index" ? levels[person.index] : way === "unmatched" ? NaN : levels[i + 1]) }));
        if(way === "the host's first") loud.unshift({ person: host, level: power(levels[0]) });
        const now = performance.now();
        const top = Math.max(0, ...loud.map(l => l.level));
        if(top > hydra.peak || now - hydra.peakAt > 8000) {
            hydra.peak = Math.max(top, hydra.peak * 0.5);
            hydra.peakAt = now;
        }
        let loudest = null;
        for(const { person, level } of loud) {
            if(!(level > 0 && level >= 0.3 * hydra.peak)) continue;
            hydra.spoke.set(person.screenName.toLowerCase(), now);
            if(!loudest || level > loudest.level) loudest = { person, level };
        }
        if(loudest) hydra.loudest = { username: loudest.person.screenName.toLowerCase(), at: now };
    }
    const spokeNow = username => performance.now() - (hydra.spoke.get(username) ?? -Infinity) < SPOKE_FOR;
    // the one speaking by the stream: the loudest of late, named as AudioSpaceById has them
    function hydraSpeaker() {
        const loudest = hydra.loudest;
        if(!loudest || !spokeNow(loudest.username)) return null;
        const known = known_(loudest.username);
        return { username: loudest.username, name: known?.name || `@${hydra.participants.find(p => p.screenName.toLowerCase() === loudest.username)?.screenName || loudest.username}` };
    }
    // someone on stage AudioSpaceById hasn't told of yet: asked again for their name, as x.com does when someone
    // comes up, once in 15 s at most
    let newcomersAt = -Infinity;
    function newcomers(unknown = false) {
        const space = player.space, token = player.token;
        if(!space || !token || performance.now() - newcomersAt < 15000) return;
        if(!unknown && hydra.participants.every(p => known_(p.screenName.toLowerCase()))) return;
        newcomersAt = performance.now();
        details(space.id, player.user).then(fresh => {
            if(player.token !== token) return;
            heard(fresh);
            drawSpeaking();
        }).catch(e => console.warn("[otd-spaces] AudioSpaceById", e));
    }
    // the Space's host, as AudioSpaceById has them, where the stream's list of the ones on stage doesn't have them
    function hydraHost() {
        const host = player.space?.host;
        if(!host?.screenName) return null;
        const name = host.screenName.toLowerCase();
        return hydra.participants.some(p => p.screenName.toLowerCase() === name || (host.id && p.id === host.id)) ? null
            : { index: -1, screenName: host.screenName, id: host.id || "", avatar: host.avatar || "" };
    }
    const known_ = username => {
        const space = player.space;
        return space && [space.host, ...space.admins, ...space.speakers, ...space.listeners].filter(Boolean).find(p => p.screenName && p.screenName.toLowerCase() === username);
    };
    // who's on stage: as the stream has them, its order, their names as AudioSpaceById has them; as AudioSpaceById has
    // them where the stream doesn't tell
    function liveStage() {
        if(!hydra.participants.length) return stage();
        const host = hydraHost();
        return [...host ? [host] : [], ...hydra.participants].map(p => {
            const known = known_(p.screenName.toLowerCase());
            return { id: p.id || known?.id || p.screenName, screenName: p.screenName, name: known?.name || `@${p.screenName}`, avatar: p.avatar || known?.avatar || "" };
        });
    }
    // for the diagnostics: how many on stage and their indexes, how many levels came, how long each was, from what to what
    function hydraStats() {
        const stats = hydra.stats;
        if(!hydra.participants.length && !stats.levels) return "";
        const range = stats.levels ? `, ${+stats.min.toFixed(3)}…${+stats.max.toFixed(3)}` : "";
        return `${hydra.participants.length} on stage (indexes ${hydra.participants.map(p => p.index).join(",")})${hydraHost() ? " and the host" : ""}, levels ×${stats.levels} of ${[...stats.lengths].join("/") || "—"} each${range}${stats.ways.size ? `, ${[...stats.ways].join("/")}` : ""}${stats.offClock ? ", on another clock" : ""}`;
    }

    // --- the Space's chat: who speaks, what they say -----------------------------------------------------------
    // As x.com's listeners have it: the stream's chat token for the chat's address and a token of its own, a
    // WebSocket there (chatapi/v1/chatnow) told that token and the room. The address comes from proxsee.pscp.tv's
    // accessChatPublic, as a guest's does; where that one has none, as a signed in listener's: X's
    // AuthenticatePeriscope for a Periscope login (loginTwitterToken), kept for the page's while, then accessChat with
    // it. While the Space has captions on, they come in the chat with who says them: { body, username, final }, once
    // the listener asks for them, as x.com does: enableSpacesCaption with the Space's id and the Periscope login.
    const CAPTIONS_STORAGE = "OTDspacesCaptions";
    // "1" while the captions are across the whole column, with what was said before
    const WIDE_STORAGE = "OTDspacesCaptionsWide";
    const captionsWide = () => localStorage[WIDE_STORAGE] === "1";
    // someone speaks as long as their captions come, and a little after; a caption stays a while after the last
    const SPEAKING_FOR = 3000, CAPTION_FOR = 8000;
    // lines: what was said, by whom, the last one as it's said
    // via: how its address came, as a guest or signed in
    // asked: how asking for its captions went
    // answers: what proxsee's answers were made of, by method, for the diagnostics
    // live: X's live chat being read; pending: its captions waiting for the audio to get to them; seen: theirs by id,
    // whether final
    const chat = { socket: null, live: null, token: null, status: "", liveFailed: "", via: "", asked: "", askedFor: null, answers: {}, captions: 0, shapes: new Map(), speaker: null, caption: null, lines: [], pending: [], seen: new Map(), timer: 0, liveTimer: 0, retries: 0 };
    const captionsOn = () => localStorage[CAPTIONS_STORAGE] !== "0";
    const json = text => {
        if(typeof text !== "string") return text && typeof text === "object" ? text : null;
        try {
            return JSON.parse(text);
        } catch(e) {
            return null;
        }
    };
    async function openChat(chatToken, token) {
        closeChat();
        Object.assign(chat, { token, status: "connecting", liveFailed: "", via: "", asked: "", answers: {}, captions: 0, shapes: new Map(), speaker: null, caption: null, lines: [], pending: [], seen: new Map(), retries: 0 });
        report();
        // x.com's own: X's live chat; the Periscope chat it had before where that doesn't answer
        if(await liveChat(token)) {
            if(chat.token === token) askCaptions(token);
            return;
        }
        if(chat.token !== token) return;
        if(!chatToken) {
            chat.status = "no chat token";
            report();
            return askCaptions(token);
        }
        const user = player.user;
        try {
            let access = await proxsee("accessChatPublic", { chat_token: chatToken }).catch(() => null);
            if(chat.token !== token) return;
            chat.answers.accessChatPublic = shape(access);
            chat.via = "as a guest";
            if(!chatAddress(access)) {
                chat.via = "signed in";
                access = await signedIn(user, cookie => proxsee("accessChat", { chat_token: chatToken, cookie }));
                if(chat.token !== token) return;
                chat.answers.accessChat = shape(access);
            }
            const address = chatAddress(access);
            if(!address) throw failure("no chat address");
            connect(address, String(access.access_token), String(access.room_id || player.space?.id || ""), token);
        } catch(e) {
            if(chat.token !== token) return;
            // which of its steps it was, with X's status
            chat.status = String(e?.message || e).slice(0, 80);
            report();
        }
        // the captions asked for whether or not the chat opened, as x.com, which opens none, does
        if(chat.token === token) askCaptions(token);
    }
    // what an answer of X's is made of, for the diagnostics: its fields' names and the kinds of their values, of an
    // address its host only, nothing of what's in it
    function shape(value, depth = 0) {
        if(Array.isArray(value)) return `[${value.length ? shape(value[0], depth + 1) : ""}]`;
        if(value && typeof value === "object") {
            if(depth > 2) return "{…}";
            return `{${Object.entries(value).slice(0, 80).map(([key, v]) => `${key.slice(0, 40)}:${shape(v, depth + 1)}`).join(",")}}`;
        }
        if(typeof value === "string") {
            const address = value.match(/^(https?|wss?):\/\/([\w.-]+)/);
            return address ? `${address[1]}://${address[2]}` : value ? "text" : "empty";
        }
        return value === null ? "null" : typeof value;
    }
    // the captions asked for, once for each Space played; how it went for the diagnostics
    async function askCaptions(token) {
        const space = player.space, user = player.user;
        if(!space || chat.askedFor === token) return;
        chat.askedFor = token;
        let asked = "ok";
        try {
            const answer = await signedIn(user, cookie => proxsee("enableSpacesCaption", { broadcast_id: space.id, cookie }));
            if(chat.token === token) chat.answers.enableSpacesCaption = shape(answer);
        } catch(e) {
            asked = String(e?.message || e).slice(0, 80);
        }
        if(chat.token !== token) return;
        chat.asked = asked;
        report();
    }
    // the chat's WebSocket address in an answer that has its token, or null
    function chatAddress(access) {
        try {
            const endpoint = new URL(access?.endpoint);
            return endpoint.protocol === "https:" && access.access_token ? `wss://${endpoint.host}/chatapi/v1/chatnow` : null;
        } catch(e) {
            return null;
        }
    }
    // proxsee.pscp.tv's API, with the headers x.com sends it
    async function proxsee(method, body) {
        const res = await fetch(`https://proxsee.pscp.tv/api/v2/${method}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-periscope-user-agent": "Twitter/m5", "x-idempotence": String(Date.now()), "x-attempt": "1" },
            body: JSON.stringify(body),
        });
        if(!res.ok) throw failure(`${method}: HTTP ${res.status}`, res.status);
        return res.json();
    }
    // a Periscope login for the account, by user: X's JWT for it (AuthenticatePeriscope) for proxsee's cookie; what
    // asks with it again with a new one when proxsee no longer takes the one kept
    const AUTHENTICATE_PERISCOPE = "r7VUmxbfqNkx7uwjgONSNw";
    const periscope = new Map();
    async function signedIn(user, ask) {
        for(let fresh = false; ; fresh = true) {
            if(fresh || !periscope.has(user)) periscope.set(user, login(user));
            let cookie;
            try {
                cookie = await periscope.get(user);
            } catch(e) {
                periscope.delete(user);
                throw e;
            }
            try {
                return await ask(cookie);
            } catch(e) {
                if(fresh || ![401, 403].includes(e.status)) throw e;
            }
        }
    }
    async function login(user) {
        const data = await getJSON(`/i/api/graphql/${AUTHENTICATE_PERISCOPE}/AuthenticatePeriscope`, new URLSearchParams({ variables: "{}", features: "{}" }), user);
        const jwt = data?.data?.authenticate_periscope;
        if(!jwt) throw failure("no Periscope token");
        const answer = await proxsee("loginTwitterToken", { jwt, vendor_id: "m5-proxsee-login-a2011357b73e", create_user: true });
        if(!answer?.cookie) throw failure("no Periscope login");
        return String(answer.cookie);
    }
    function connect(url, accessToken, room, token) {
        const socket = chat.socket = new WebSocket(url);
        socket.addEventListener("open", () => {
            if(chat.socket !== socket) return;
            socket.send(JSON.stringify({ payload: JSON.stringify({ access_token: accessToken }), kind: 3 }));
            socket.send(JSON.stringify({ payload: JSON.stringify({ body: JSON.stringify({ room }), kind: 1 }), kind: 2 }));
            chat.status = `open, ${chat.via}`;
            chat.retries = 0;
            report();
        });
        socket.addEventListener("message", e => {
            if(chat.socket === socket) heardChat(e.data);
        });
        socket.addEventListener("close", () => {
            if(chat.socket !== socket || chat.token !== token) return;
            chat.socket = null;
            // a few more tries while the Space plays, as a dropped connection comes back
            if(chat.retries++ < 5) {
                chat.status = "reconnecting";
                setTimeout(() => chat.token === token && !chat.socket && connect(url, accessToken, room, token), 5000 * chat.retries);
            } else {
                chat.status = "closed";
            }
            report();
        });
        if(!chat.timer) chat.timer = setInterval(speakingNow, 1000);
    }
    function closeChat() {
        const socket = chat.socket, live = chat.live;
        Object.assign(chat, { socket: null, live: null, token: null, speaker: null, caption: null, lines: [], pending: [], seen: new Map() });
        if(chat.status && chat.status !== "no chat token") chat.status = "closed";
        try {
            socket?.close();
        } catch(e) {}
        live?.abort();
        clearInterval(chat.timer);
        clearInterval(chat.liveTimer);
        chat.timer = chat.liveTimer = 0;
    }

    // --- X's live chat: the captions ---------------------------------------------------------------------------
    // As x.com has them now: api.x.com/live-chat?broadcastId=…&sessionId=…, an answer that goes on, a line of JSON
    // for each thing that happens, { ts (in ns), chatType, userId, … }, what came before first (isBackfill). Kind 45 is
    // a caption, { message, final, legacyUuid }; 2 a reaction in the chat; 40 a control, 17 and 16 a mic on and off.
    // Captions come as they're said and the audio is behind: they're shown as it gets to them, by the stream's clock.
    const LIVE_CAPTION = 45;
    const API = `https://api.${location.hostname.replace(/^(www|mobile)\./, "")}`;
    async function liveChat(token) {
        const space = player.space, user = player.user;
        if(!space || chat.token !== token) return false;
        const controller = new AbortController();
        chat.live = controller;
        const path = "/live-chat";
        try {
            const headers = await OTD.xHeaders(path, "GET", actAs(user));
            if(chat.token !== token) return false;
            // a number of the listener's own, as x.com makes one
            const params = new URLSearchParams({ broadcastId: space.id, sessionId: String(1 + Math.floor(Math.random() * 2 ** 31)) });
            const res = await fetch(`${API}${path}?${params}`, { headers, credentials: "include", signal: controller.signal });
            if(!res.ok || !res.body) throw failure(`HTTP ${res.status}`, res.status);
            if(chat.token !== token) return false;
            Object.assign(chat, { status: "open", via: "X's live chat", liveFailed: "" });
            if(!chat.liveTimer) chat.liveTimer = setInterval(releaseCaptions, 250);
            if(!chat.timer) chat.timer = setInterval(speakingNow, 1000);
            report();
            readLive(res.body, token, controller);
            return true;
        } catch(e) {
            if(chat.token === token && chat.live === controller) {
                chat.live = null;
                chat.liveFailed = describe(e);
            }
            return false;
        }
    }
    async function readLive(body, token, controller) {
        const reader = body.getReader(), decoder = new TextDecoder();
        let rest = "";
        try {
            for(;;) {
                const { value, done } = await reader.read();
                if(chat.live !== controller) return reader.cancel().catch(() => {});
                rest += decoder.decode(value || new Uint8Array(), { stream: !done });
                const lines = rest.split("\n");
                rest = done ? "" : lines.pop();
                for(const line of lines) if(line.trim()) heardLive(json(line.trim()));
                if(done) break;
            }
        } catch(e) {}
        if(chat.live !== controller || chat.token !== token) return;
        // it ended: again a few times while the Space plays, what was said before it coming again, kept once
        chat.live = null;
        if(chat.retries++ < 5) {
            chat.status = "reconnecting";
            setTimeout(async () => {
                if(chat.token !== token || chat.live) return;
                if(!await liveChat(token) && chat.token === token) {
                    chat.status = `closed (${chat.liveFailed})`;
                    report();
                }
            }, 3000 * chat.retries);
        } else {
            chat.status = "closed";
        }
        report();
    }
    function heardLive(line) {
        if(!line || typeof line !== "object") return;
        // what kinds come, for the diagnostics: the kind, a control's kind, the fields' names
        const shape = `live ${line.chatType ?? "?"}${line.controlType != null ? `/${line.controlType}` : ""}:${Object.keys(line).sort().join(",")}`.slice(0, 120);
        if(!chat.shapes.has(shape) && chat.shapes.size < 12) {
            chat.shapes.set(shape, true);
            report();
        }
        if(line.chatType !== LIVE_CAPTION || typeof line.message !== "string") return;
        const id = String(line.legacyUuid || "");
        if(id && chat.seen.get(id)) return;
        const final = line.final !== false;
        if(id) chat.seen.set(id, final);
        if(chat.seen.size > 500) chat.seen.delete(chat.seen.keys().next().value);
        const caption = { id, userId: String(line.userId || ""), text: line.message.trim(), final, at: Number(line.ts) / 1e6, came: performance.now() };
        if(!caption.text) return;
        chat.captions++;
        // what was said before the listener came: kept to scroll back to, not said now
        if(line.isBackfill) {
            addLine(caption);
            return drawSpeaking();
        }
        chat.pending.push(caption);
        releaseCaptions();
    }
    // the captions the audio has got to: all of them where the stream has no clock, or after a minute whatever it says
    function releaseCaptions() {
        if(!chat.pending.length) return;
        const heard = heardAt(), now = performance.now();
        const due = chat.pending.filter(c => !Number.isFinite(c.at) || Number.isNaN(heard) || c.at <= heard || now - c.came > 60000);
        if(!due.length) return;
        chat.pending = chat.pending.filter(c => !due.includes(c));
        for(const caption of due) {
            const line = addLine(caption);
            chat.caption = { text: line.text, name: line.name, at: now };
            // who speaks by the captions only where the stream doesn't tell
            if(!hydra.participants.length) chat.speaker = { username: line.username, name: line.name, at: now };
        }
        drawSpeaking();
    }
    // a caption into what was said: the same one again as it's said, the whole of it so far, till it's final
    function addLine(caption) {
        const who = personById(caption.userId);
        const line = { id: caption.id, userId: caption.userId, username: who.username, name: who.name, text: caption.text, final: caption.final };
        const same = caption.id ? chat.lines.find(l => l.id === caption.id) : null;
        const last = chat.lines.at(-1);
        if(same) Object.assign(same, line);
        else if(!caption.id && last && last.username === line.username && !last.final) Object.assign(last, line);
        else chat.lines.push(line);
        if(chat.lines.length > 60) chat.lines.splice(0, chat.lines.length - 60);
        if(!who.name) newcomers(true);
        return same || line;
    }
    // someone by their X id: as AudioSpaceById has them, else as the stream's stage has them
    function personById(id) {
        const space = player.space;
        const known = id && space ? [space.host, ...space.admins, ...space.speakers, ...space.listeners].find(p => p?.id === id) : null;
        if(known) return { username: known.screenName.toLowerCase(), name: known.name || `@${known.screenName}` };
        const on = id ? hydra.participants.find(p => p.id === id) : null;
        if(on) return { username: on.screenName.toLowerCase(), name: known_(on.screenName.toLowerCase())?.name || `@${on.screenName}` };
        return { username: id ? `id:${id}` : "", name: "" };
    }
    function heardChat(data) {
        const message = json(data);
        const payload = json(message?.payload);
        const body = json(payload?.body);
        // what kinds of messages come, for the diagnostics: the kind, the body's type and its fields' names
        const shape = `${message?.kind ?? "?"}:${body?.type ?? "-"}:${Object.keys(body || payload || {}).sort().join(",")}`.slice(0, 120);
        if(!chat.shapes.has(shape) && chat.shapes.size < 12) {
            chat.shapes.set(shape, true);
            report();
        }
        if(message?.kind !== 1 || !body || typeof body.body !== "string" || typeof body.final !== "boolean" || !body.username) return;
        chat.captions++;
        const username = String(body.username);
        const known = stage().find(p => p.screenName && p.screenName.toLowerCase() === username.toLowerCase());
        const name = known?.name || String(body.display_name || body.displayName || payload?.sender?.display_name || username);
        const now = performance.now();
        const text = body.body.trim();
        chat.speaker = { username: username.toLowerCase(), name, at: now };
        if(!text) return drawSpeaking();
        chat.caption = { text, name, at: now };
        // a caption comes again and again as it's said, the whole of it so far, the last time final
        const last = chat.lines.at(-1);
        if(last && last.username === chat.speaker.username && !last.final) Object.assign(last, { name, text, final: body.final });
        else chat.lines.push({ username: chat.speaker.username, name, text, final: body.final });
        if(chat.lines.length > 60) chat.lines.splice(0, chat.lines.length - 60);
        drawSpeaking();
    }
    // the speaker and the caption, gone when they're old
    function speakingNow() {
        const now = performance.now();
        let gone = false;
        if(chat.speaker && now - chat.speaker.at > SPEAKING_FOR) {
            chat.speaker = null;
            gone = true;
        }
        if(chat.caption && now - chat.caption.at > CAPTION_FOR) {
            chat.caption = null;
            gone = true;
        }
        if(gone) drawSpeaking();
    }
    // who's on stage: the host, the co-hosts, the speakers, as AudioSpaceById had them last
    function stage() {
        const space = player.space;
        if(!space) return [];
        const all = [space.host, ...space.admins, ...space.speakers].filter(Boolean);
        return all.filter((p, i) => p.id && all.findIndex(q => q.id === p.id) === i);
    }
    function mediaSession() {
        const session = navigator.mediaSession;
        if(!session) return;
        try {
            if(!player.space) {
                session.metadata = null;
                return;
            }
            if(typeof MediaMetadata === "function") {
                const avatar = player.space.host?.avatar;
                session.metadata = new MediaMetadata({
                    title: player.space.title || T.untitled,
                    artist: player.space.host?.name || "",
                    album: "X Spaces",
                    artwork: /^https:\/\//.test(avatar || "") ? [{ src: avatar.replace(/_normal(\.\w+)$/, "_400x400$1"), sizes: "400x400" }] : [],
                });
            }
            session.setActionHandler("play", () => player.audio?.paused && toggle());
            session.setActionHandler("pause", () => player.audio && !player.audio.paused && toggle());
            session.setActionHandler("stop", () => stop());
        } catch(e) {}
    }

    const ICONS = {
        play: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.7 4.5a.8.8 0 0 0-1.2.7z" fill="currentColor"/></svg>',
        pause: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/></svg>',
        close: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        wide: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        volume: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    };
    function iconButton(className, label, icon) {
        const button = el("button", className);
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.title = label;
        // the icons are this file's own markup, nothing of X's
        button.innerHTML = icon;
        return button;
    }
    // the player on top of the column it was started from, while there's one; gone with the column, the music too
    function drawPlayer() {
        const found = player.space ? columns().find(column => column.key === player.column) : null;
        for(const old of document.querySelectorAll(".otd-space-player")) {
            if(!found || !found.section.contains(old)) old.remove();
        }
        if(!player.space) return;
        if(!found) {
            stop();
            return;
        }
        const scroller = found.section.querySelector(".js-column-scroller");
        if(!scroller) return;
        let box = scroller.querySelector(":scope > .otd-space-player");
        if(!box) {
            box = el("div", "otd-space-player");
            box.setAttribute("role", "region");
            const top = el("div", "otd-space-player-row");
            const toggleButton = iconButton("otd-space-player-toggle", T.pause, ICONS.pause);
            toggleButton.addEventListener("click", () => player.state === "ended" || player.state === "failed" ? listen(player.space, found) : toggle());
            const text = el("div", "otd-space-player-text");
            text.append(el("div", "otd-space-player-title"), el("div", "otd-space-player-state"));
            const closeButton = iconButton("otd-space-player-close", T.close, ICONS.close);
            closeButton.addEventListener("click", () => stop());
            top.append(toggleButton, text, closeButton);
            const people = el("div", "otd-space-player-stage");
            people.setAttribute("aria-label", T.stage);
            const said = el("div", "otd-space-player-caption");
            said.setAttribute("aria-live", "polite");
            said.addEventListener("click", () => wideCaptions());
            const bottom = el("div", "otd-space-player-row otd-space-player-bottom");
            const volumeIcon = el("span", "otd-space-player-volume-icon");
            volumeIcon.innerHTML = ICONS.volume;
            const range = el("input", "otd-space-player-volume");
            Object.assign(range, { type: "range", min: "0", max: "1", step: "0.05", value: String(volume()) });
            range.setAttribute("aria-label", T.volume);
            // how much of the track is filled, for Chrome's; Firefox fills its own
            const fill = () => range.style.setProperty("--otd-volume", `${Number(range.value) * 100}%`);
            fill();
            range.addEventListener("input", () => {
                OTD.setValue(VOLUME_STORAGE, range.value === "1" ? "" : range.value);
                if(player.audio) player.audio.volume = Number(range.value);
                fill();
            });
            const cc = el("button", "otd-space-player-cc", "CC");
            cc.type = "button";
            cc.title = T.captions;
            cc.setAttribute("aria-label", T.captions);
            cc.addEventListener("click", () => {
                OTD.setValue(CAPTIONS_STORAGE, captionsOn() ? "0" : "");
                drawSpeaking();
            });
            const wide = iconButton("otd-space-player-wide", T.wide, ICONS.wide);
            wide.addEventListener("click", () => wideCaptions());
            bottom.append(volumeIcon, range, cc, wide, link("", "otd-space-player-open", T.open));
            box.append(top, people, said, bottom);
            scroller.prepend(box);
        }
        const space = player.space, state = player.state;
        box.dataset.spaceId = space.id;
        box.dataset.state = state;
        box.setAttribute("aria-label", space.title || T.untitled);
        box.querySelector(".otd-space-player-title").textContent = space.title || `${T.untitled}${space.host?.name ? ` · ${space.host.name}` : ""}`;
        drawSpeaking(box);
        const toggleButton = box.querySelector(".otd-space-player-toggle");
        const again = state === "ended" || state === "failed";
        const playing = state === "playing" || state === "connecting";
        const label = again ? T.again : playing ? T.pause : T.play;
        if(toggleButton.title !== label) {
            toggleButton.title = label;
            toggleButton.setAttribute("aria-label", label);
            toggleButton.innerHTML = playing && !again ? ICONS.pause : ICONS.play;
        }
        // a Space that ended isn't there to listen to again
        toggleButton.hidden = state === "ended";
        box.querySelector(".otd-space-player-open").href = spaceUrl(space.id);
    }
    // what changes as people speak: the state's line, the faces on stage, the caption
    function drawSpeaking(box = document.querySelector(".otd-space-player")) {
        if(!box || !player.space) return;
        const space = player.space, state = player.state, speaker = state === "playing" ? chat.speaker || hydraSpeaker() : null;
        const said = state === "failed" ? T.cantPlay(player.error) : state === "ended" ? T.ended : state === "paused" ? T.paused
            : state === "connecting" ? T.connecting : speaker ? T.speaking(speaker.name) : space.host?.name ? `${T.playing} · ${space.host.name}` : T.playing;
        const line = box.querySelector(".otd-space-player-state");
        if(line.textContent !== said) line.textContent = said;
        box.classList.toggle("is-speaking", !!speaker);

        // the faces: drawn again when who's on stage changes, the one speaking marked
        const people = box.querySelector(".otd-space-player-stage");
        const onStage = state === "ended" ? [] : liveStage();
        const who = onStage.map(p => `${p.id}:${p.avatar}:${p.name}`).join("|");
        if(people.dataset.who !== who) {
            people.dataset.who = who;
            people.replaceChildren(...onStage.slice(0, 10).map(p => {
                const face = el("span", "otd-space-player-face");
                face.dataset.username = p.screenName.toLowerCase();
                face.title = p.screenName && !p.name.startsWith("@") ? `${p.name} @${p.screenName}` : p.name;
                face.append(avatar(p.avatar));
                return face;
            }));
            if(onStage.length > 10) people.append(el("span", "otd-space-player-more", `+${onStage.length - 10}`));
        }
        people.hidden = !onStage.length;
        for(const face of people.querySelectorAll(".otd-space-player-face")) {
            face.classList.toggle("is-speaking", state === "playing" && (spokeNow(face.dataset.username) || face.dataset.username === chat.speaker?.username));
        }

        // the captions: the last one under the faces, its end when it's long, for a while after it's said; or
        // across the column, what was said before over it, kept to scroll back in
        const caption = box.querySelector(".otd-space-player-caption");
        const wide = captionsWide();
        box.classList.toggle("is-wide", wide);
        const lines = !captionsOn() || (state !== "playing" && !(wide && state === "paused")) ? []
            : wide ? chat.lines.slice(-40) : chat.caption && chat.lines.length ? chat.lines.slice(-1) : [];
        const shownLines = lines.map(line => ({ name: (line.userId && personById(line.userId).name) || line.name || "…", text: wide || line.text.length <= 160 ? line.text : `…${line.text.slice(-160)}` }));
        const drawnNow = JSON.stringify([wide, shownLines]);
        if(caption.otdDrawn !== drawnNow) {
            caption.otdDrawn = drawnNow;
            // kept at its end as new ones come, unless scrolled back
            const atEnd = caption.scrollTop + caption.clientHeight >= caption.scrollHeight - 4;
            caption.replaceChildren(...shownLines.map(line => {
                const p = el("p", "otd-space-player-line");
                p.append(el("b", "", `${line.name}:`), document.createTextNode(` ${line.text}`));
                return p;
            }));
            if(atEnd || !wide) caption.scrollTop = caption.scrollHeight;
        }
        caption.hidden = !lines.length;
        caption.title = wide ? "" : T.wide;
        const cc = box.querySelector(".otd-space-player-cc");
        cc.setAttribute("aria-pressed", String(captionsOn()));
        const wideButton = box.querySelector(".otd-space-player-wide");
        wideButton.setAttribute("aria-pressed", String(wide));
        // the buttons only once the Space has had captions
        cc.hidden = !chat.captions;
        wideButton.hidden = !chat.captions || !captionsOn();
    }
    function wideCaptions() {
        OTD.setValue(WIDE_STORAGE, captionsWide() ? "" : "1");
        drawSpeaking();
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
        // TweetDeck drawing the column again took the player with it
        else if(player.space && !document.querySelector(".otd-space-player")) drawPlayer();
    });
    setInterval(tick, 10 * 1000);
    document.addEventListener("visibilitychange", tick);

    OTD.addStyle(`
        section.otd-spaces-column .js-column-scroller > :not(.otd-spaces):not(.otd-space-player) { display: none !important; }
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
        /* the buttons here over TweetDeck's own of every button, its dark theme's light blue as the pointer's over
           one and its ring as it's pressed or has the focus: :root to come first in every state */
        :root .otd-spaces .otd-space-listen { display: inline-block; height: auto; margin: 0; padding: 6px 14px; border: 0 !important; box-shadow: none !important; border-radius: 999px; background: var(--otd-accent-fill, #1d9bf0); color: #fff; font-family: inherit; font-size: 13px; font-weight: 700; line-height: 1.2; text-decoration: none; cursor: pointer; }
        :root .otd-spaces .otd-space-listen:hover { filter: brightness(1.1); text-decoration: none; }
        :root .otd-spaces .is-coming .otd-space-listen, :root .otd-spaces .otd-space-listen.is-current { background: var(--otd-ghost, rgba(0, 0, 0, .05)); color: var(--otd-text, #14171a); }
        :root.dark .otd-spaces .is-coming .otd-space-listen, :root.dark .otd-spaces .otd-space-listen.is-current { color: var(--otd-text, #fff); }
        .otd-spaces .otd-spaces-checked { margin: 10px 4px 0; font-size: 12px; color: var(--otd-text-3, #657786); }
        :root .otd-spaces .otd-spaces-refresh { height: auto; padding: 0; border: 0 !important; box-shadow: none !important; background: none; color: var(--otd-accent, #1d9bf0); font: inherit; cursor: pointer; }
        :root .otd-spaces .otd-spaces-refresh:hover { text-decoration: underline; }

        .otd-space-player { --otd-live: #d0304f; position: sticky; top: 0; z-index: 2; margin: 0; padding: 10px 12px; border-bottom: 1px solid var(--otd-line, rgba(0, 0, 0, .07));
            background: var(--otd-raised-solid, #f3f4f5); color: var(--otd-text, #14171a); font-size: 13px; line-height: 1.3; text-shadow: none; }
        html.dark .otd-space-player { --otd-live: #ff6b81; color: var(--otd-text, #fff); }
        .otd-space-player-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .otd-space-player-bottom { gap: 6px; margin: 8px 0 0; }
        .otd-space-player-text { flex: 1; min-width: 0; }
        .otd-space-player-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 700; }
        .otd-space-player-state { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--otd-text-2, #657786); }
        .otd-space-player[data-state="playing"] .otd-space-player-state { color: var(--otd-live); }
        .otd-space-player[data-state="failed"] .otd-space-player-state { color: var(--otd-live); }
        /* TweetDeck's own button frames, dark ones its accent's, aren't these */
        :root .otd-space-player button { display: inline-flex; flex: none; align-items: center; justify-content: center; padding: 0; border: 0 !important; border-radius: 50%; box-shadow: none !important; cursor: pointer; }
        .otd-space-player button::-moz-focus-inner { padding: 0; border: 0; }
        :root .otd-space-player button[hidden] { display: none; }
        .otd-space-player svg { display: block; flex: none; }
        :root .otd-space-player .otd-space-player-toggle { width: 38px; height: 38px; margin: 0; background: var(--otd-accent-fill, #1d9bf0); color: #fff; line-height: 0; }
        :root .otd-space-player .otd-space-player-toggle:hover { filter: brightness(1.1); }
        :root .otd-space-player .otd-space-player-close { width: 30px; height: 30px; margin: 0; background: transparent; color: var(--otd-text-2, #657786); }
        :root .otd-space-player .otd-space-player-close:hover { background: var(--otd-ghost-hover, rgba(0, 0, 0, .08)); color: var(--otd-text, #14171a); }
        :root.dark .otd-space-player .otd-space-player-close:hover { color: var(--otd-text, #fff); }
        .otd-space-player-volume-icon { display: inline-flex; flex: none; color: var(--otd-text-2, #657786); }
        /* the volume's track and handle drawn here, the same in Chrome and Firefox */
        .otd-space-player input.otd-space-player-volume { --otd-volume: 100%; flex: 1; min-width: 40px; max-width: 140px; height: 16px; margin: 0; padding: 0; border: 0; background: transparent; -webkit-appearance: none; appearance: none; cursor: pointer; }
        .otd-space-player input.otd-space-player-volume::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--otd-accent-fill, #1d9bf0) var(--otd-volume), var(--otd-ghost-hover, rgba(0, 0, 0, .12)) var(--otd-volume)); }
        .otd-space-player input.otd-space-player-volume::-webkit-slider-thumb { width: 12px; height: 12px; margin-top: -4px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, .2); -webkit-appearance: none; appearance: none; }
        .otd-space-player input.otd-space-player-volume::-moz-range-track { height: 4px; border: 0; border-radius: 2px; background: var(--otd-ghost-hover, rgba(0, 0, 0, .12)); }
        .otd-space-player input.otd-space-player-volume::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--otd-accent-fill, #1d9bf0); }
        .otd-space-player input.otd-space-player-volume::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, .2); }
        :root .otd-space-player .otd-space-player-cc { height: 18px; margin: 0; padding: 0 5px; border-radius: 4px; background: transparent; color: var(--otd-text-2, #657786); font-family: inherit; font-size: 10px; font-weight: 700; line-height: 18px; letter-spacing: .04em; box-shadow: inset 0 0 0 1.5px currentColor !important; }
        :root .otd-space-player .otd-space-player-cc[aria-pressed="true"] { color: var(--otd-text, #14171a); }
        :root.dark .otd-space-player .otd-space-player-cc[aria-pressed="true"] { color: var(--otd-text, #fff); }
        .otd-space-player-stage { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 8px 0 0 48px; }
        .otd-space-player-stage[hidden], .otd-space-player-caption[hidden] { display: none; }
        .otd-space-player-face { position: relative; display: inline-flex; width: 26px; height: 26px; border-radius: 50%; box-shadow: 0 0 0 2px transparent; transition: box-shadow .15s; }
        .otd-space-player-face > img { width: 26px; height: 26px; border-radius: 50%; background: var(--otd-ghost, rgba(0, 0, 0, .05)); object-fit: cover; }
        .otd-space-player-face.is-speaking { box-shadow: 0 0 0 2px var(--otd-raised-solid, #f3f4f5), 0 0 0 4px var(--otd-accent-fill, #1d9bf0); }
        .otd-space-player-more { color: var(--otd-text-2, #657786); font-size: 12px; }
        .otd-space-player.is-speaking .otd-space-player-state { color: var(--otd-accent, #1d9bf0); }
        .otd-space-player-caption { margin: 8px 0 0 48px; overflow-wrap: anywhere; color: var(--otd-text, #14171a); font-size: 13px; line-height: 1.35; cursor: zoom-in; }
        html.dark .otd-space-player-caption { color: var(--otd-text, #fff); }
        .otd-space-player-caption > p.otd-space-player-line { margin: 0; }
        .otd-space-player-line > b { margin-right: 2px; font-weight: 700; }
        /* across the column, edge to edge, what was said before over the last one */
        .otd-space-player.is-wide .otd-space-player-caption { max-height: min(45vh, 360px); margin: 10px -12px 0; padding: 8px 12px; overflow-y: auto; border-top: 1px solid var(--otd-line, rgba(0, 0, 0, .07)); border-bottom: 1px solid var(--otd-line, rgba(0, 0, 0, .07)); background: var(--otd-panel, #fff); font-size: 14px; cursor: zoom-out; overscroll-behavior: contain; }
        .otd-space-player.is-wide .otd-space-player-line + .otd-space-player-line { margin-top: 6px; }
        :root .otd-space-player .otd-space-player-wide { width: 24px; height: 24px; margin: 0; border-radius: 4px; background: transparent; color: var(--otd-text-2, #657786); }
        :root .otd-space-player .otd-space-player-wide:hover { background: var(--otd-ghost-hover, rgba(0, 0, 0, .08)); }
        :root .otd-space-player .otd-space-player-wide[aria-pressed="true"] { color: var(--otd-accent, #1d9bf0); }
        .otd-space-player a.otd-space-player-open { margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--otd-accent, #1d9bf0); font-size: 12px; text-decoration: none; }
        .otd-space-player a.otd-space-player-open:hover { text-decoration: underline; }
    `);
})();
