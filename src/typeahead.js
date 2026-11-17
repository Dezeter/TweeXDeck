// Suggestions as an @name or a #hashtag is typed in the tweet box, and in the search box: X's own search as x.com
// asks it, x.com/i/api/1.1/search/typeahead.json, the people in it with their pictures, names and checks in
// TweetDeck's own lists, in X's order, the ones being searched for first. TweetDeck asked api.x.com's of before with
// its own parameters, and for the lists it kept of the people it knew it asked a prefetch X has no more: the lists
// stayed empty and nothing came up. Switch "typeahead".
// Loaded by injection.js after otd-common.js.
(() => {
    const Client = window.TD?.services?.TwitterClient;
    if(!Client?.prototype?.typeaheadSearch || !OTD.isOn("typeahead")) return;

    const PATH = "/i/api/1.1/search/typeahead.json";
    const KINDS = ["users", "topics", "lists", "events"];
    const stats = { asked: 0, failed: 0, last: "", at: 0 };
    const report = () => document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({
        kind: "typeahead", text: `${stats.asked} asked${stats.failed ? `, ${stats.failed} failed` : ""}, the last ${stats.last}`,
    }) }));

    // the words TweetDeck's lists match what's typed against: the name's, the handle with and without its @, and
    // what was asked, as X found them by it
    const tokens = (name, handle, query) => {
        const separator = TD.constants?.regexps?.tokenSeparator || /\s+/;
        return [...new Set([...String(name || "").toLowerCase().split(separator), handle, `@${handle}`, query].filter(Boolean).map(token => token.toLowerCase()))];
    };
    // X's answer as TweetDeck's lists take it: ids as strings, X's checks as TweetDeck's one, X's order kept over the
    // ones the lists had from before (TweetDeck orders them by a score of X's it has no more)
    function readAnswer(data, query) {
        const now = Date.now();
        const plain = query.replace(/^[@#]/, "");
        const users = (Array.isArray(data?.users) ? data.users : []).filter(user => user?.screen_name).map((user, i) => {
            const id = String(user.id_str || user.id);
            return { ...user, id, id_str: id, name: String(user.name || user.screen_name),
                verified: !!(user.verified || user.ext_is_blue_verified || user.ext_verified_type || user.verified_type),
                profile_image_url_https: String(user.profile_image_url_https || user.profile_image_url || ""),
                tokens: tokens(user.name, String(user.screen_name).toLowerCase(), plain), rounded_graph_weight: 0, rounded_score: now - i };
        });
        const topics = (Array.isArray(data?.topics) ? data.topics : []).filter(topic => topic?.topic).map((topic, i) => ({ ...topic, tokens: [], rounded_score: now - i }));
        return { ...data, users, topics, lists: Array.isArray(data?.lists) ? data.lists : [] };
    }

    async function search(request) {
        const query = String(request.query || "").trim();
        const asked = (request.datasources || []).filter(kind => KINDS.includes(kind));
        // the tweet box's own lists ask for one kind: an @name, as x.com's box asks with its @, or a #hashtag
        const compose = asked.length === 1 && /^autocomplete/.test(String(request.dropdownId || ""));
        const params = new URLSearchParams({
            include_ext_is_blue_verified: 1, include_ext_verified_type: 1, include_ext_profile_image_shape: 1,
            q: compose && asked[0] === "users" && !query.startsWith("@") ? `@${query}` : query,
            src: compose ? "compose" : "search_box",
            result_type: (asked.length ? asked : ["users"]).join(","),
        });
        const headers = await OTD.xHeaders(PATH, "GET");
        const res = await fetch(`https://${location.hostname}${PATH}?${params}`, { headers, credentials: "include" });
        if(!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        return readAnswer(await res.json(), query);
    }

    const original = Client.prototype.typeaheadSearch;
    Client.prototype.typeaheadSearch = function(request, done, failed) {
        if(!OTD.isOn("typeahead") || !request) return original.apply(this, arguments);
        // the lists made ahead: X has none to give; answered at once, so TweetDeck's own of the people it came to
        // know isn't held up waiting for it
        if(request.prefetch) {
            setTimeout(() => done?.({ users: [], topics: [], lists: [] }, request));
            return;
        }
        if(!request.query) return original.apply(this, arguments);
        stats.asked++;
        search(request).then(data => {
            stats.last = `ok (${data.users.length} people, ${data.topics.length} topics)`;
            stats.at = Date.now();
            report();
            done?.(data, request);
        }, e => {
            stats.failed++;
            stats.last = `failed (${e?.status ? `HTTP ${e.status}` : String(e?.message || e).slice(0, 60)})`;
            report();
            failed?.(e);
        });
    };
})();
