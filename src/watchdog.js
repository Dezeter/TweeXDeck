// Load watchdog: when TweetDeck hasn't started 20 s after the page opened, it reloads the page once, when that
// may help, and then a panel says what went wrong instead of the endless spinner and copies a report for an
// issue. When x.com's service worker answers the page, or the page's policy blocked the extension's scripts,
// which is its doing, it lets the worker go and loads the page again at once, once more when Firefox kept the
// policy the background script took off, and a last time half a minute after the first. Its loads, and the
// panel's button, are new loads of TweetDeck's address, not reloads of the tab's history entry: Firefox kept
// x.com's policy on an entry back from plain x.com, and on every reload of it.
// It hears what the page shows (scripts blocked by Content-Security-Policy, script errors) and what the other
// scripts tell it on "otd-diagnostic" events: the steps of injection.js and the extension files that
// didn't load, the transaction id solver, TweetDeck's own steps as it starts, the requests to X and X's answers.
// A content script that runs before injection.js, so it works when everything injection.js adds is blocked; in
// Firefox it's in the extension's own world and sees the page's through wrappedJSObject.
// The settings tab asks it for the report with an "otd-diagnostic-request" event.
// Switch "loadWatchdog" (the reload and the panel; the report is always there).
(() => {
    if(window.top !== window) return;

    const START = Date.now();
    const DEADLINE = 20000;
    // when the extension's scripts are blocked or missing, TweetDeck won't start, there's no need to wait long
    const DEADLINE_BROKEN = 5000;
    // one automatic reload (three when Firefox kept x.com's policy), and not again for a while if TweetDeck is stuck
    // after it too
    const RELOAD_AT = "OTDautoReloadAt";
    const RELOAD_FIRST = "OTDautoReloadFirst";
    const RELOAD_REPORT = "OTDautoReloadReport";
    const RELOAD_COUNT = "OTDautoReloads";
    const RELOAD_AGAIN_AFTER = 120000;
    // the last try with x.com's policy kept, after the first reload: a reload by hand that long after loaded TweetDeck
    const KEPT_RETRY_AFTER = 30000;
    // the watchdog's loads go to TweetDeck's address with this mark, so they're new loads and not the tab's history
    // entry again; it leaves the address as the page opens
    const LOAD_MARK = "otd-load";
    const MARKED = (() => {
        try {
            const url = new URL(location.href);
            if(!url.searchParams.has(LOAD_MARK)) return false;
            url.searchParams.delete(LOAD_MARK);
            history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
            return true;
        } catch(e) {
            return false;
        }
    })();
    const ISSUES = "https://github.com/Dezeter/TweeXDeck/issues";
    // the language picked in TweeXDeck's settings (OTDuiLang), the browser's without it
    const RU = (() => {
        let picked = "";
        try {
            picked = localStorage.OTDuiLang || "";
        } catch(e) {}
        return (["ru", "en"].includes(picked) ? picked : navigator.language || "en").toLowerCase().startsWith("ru");
    })();
    const T = RU ? {
        title: "TweetDeck не загрузился",
        noExtension: "Расширение не запустилось на странице: его скрипт не получил ответа. Перезагрузите страницу; если не поможет — перезапустите браузер или переустановите расширение.",
        files: list => `Не загрузились файлы расширения: ${list}. Переустановите расширение и не удаляйте его файлы после установки.`,
        csp: n => `x.com запретил скрипты расширения (Content-Security-Policy), заблокировано: ${n}. Расширение снимает этот запрет; он остаётся, когда страницу отдаёт service worker x.com из своего кэша, в Firefox — иногда после обычного x.com в этой вкладке, или его возвращает другое расширение.`,
        putBack: "Запрет x.com вернуло другое расширение: оно меняет заголовки страницы после TweeXDeck. Обычно так делает менеджер пользовательских скриптов, который правит Content-Security-Policy, или блокировщик. Выключите в нём правку CSP для x.com или выключите его на этой странице.",
        retryIn: n => `Через ${n} с страница перезагрузится ещё раз: обычно Firefox отпускает этот запрет примерно через полминуты.`,
        worker: url => `Страницу TweetDeck отдаёт service worker x.com (${url}), мимо расширения. Удалите его вручную и перезагрузите страницу: about:serviceworkers в Firefox, chrome://serviceworker-internals в Chrome, найдите x.com и нажмите «Unregister».`,
        solver: text => `Не вычисляется x-client-transaction-id, без него X отклоняет часть запросов: ${text}.`,
        auth: "X отвечает 401/403: похоже, вы не вошли в x.com в этом браузере или сессия истекла. Откройте x.com, войдите и перезагрузите эту страницу.",
        limit: "X отвечает 429: слишком много запросов. Подождите несколько минут.",
        responses: list => `X отвечает ошибками: ${list}.`,
        errors: (text, more) => `Ошибка в скриптах: ${text}${more ? ` (и ещё ${more})` : ""}.`,
        waiting: list => `X не отвечает на запросы TweetDeck: ${list}. Обычно помогает перезагрузка страницы.`,
        reloaded: "Страница уже перезагружалась сама, это не помогло.",
        oldPolicy: "Это политика другой загрузки, не та, что пришла сейчас: Firefox оставил её этой странице. Помогает новая загрузка адреса, а не перезагрузка, кнопка «Перезагрузить» ниже так и делает.",
        nothing: "Явных ошибок не видно: возможно, X отвечает медленно. Подождите или перезагрузите страницу.",
        privacy: "В диагностике нет cookies и токенов, её можно приложить к issue.",
        copy: "Скопировать диагностику", copied: "Скопировано", reload: "Перезагрузить", report: "Сообщить о проблеме", close: "Скрыть",
        notSent: "не отправлен", noAnswer: "нет ответа", waitingFor: n => `ждём ${n} с`,
    } : {
        title: "TweetDeck hasn't loaded",
        noExtension: "The extension didn't start on the page: its script got no answer. Reload the page; if that doesn't help, restart the browser or reinstall the extension.",
        files: list => `The extension's files didn't load: ${list}. Reinstall the extension and keep its files after installing.`,
        csp: n => `x.com blocked the extension's scripts (Content-Security-Policy), ${n} blocked. The extension takes this policy off; it stays when x.com's service worker answers the page from its cache, in Firefox sometimes after plain x.com in this tab, or when another extension puts it back.`,
        putBack: "Another extension put x.com's policy back: it changes the page's headers after TweeXDeck. That's usually a userscript manager that rewrites Content-Security-Policy, or a blocker. Switch its CSP changes off for x.com, or switch it off on this page.",
        retryIn: n => `The page reloads once more in ${n} s: Firefox usually lets go of this policy in about half a minute.`,
        worker: url => `x.com's service worker (${url}) answers TweetDeck's page, past the extension. Remove it by hand and reload the page: about:serviceworkers in Firefox, chrome://serviceworker-internals in Chrome, find x.com and press "Unregister".`,
        solver: text => `x-client-transaction-id can't be computed, and X refuses some requests without it: ${text}.`,
        auth: "X answers 401/403: you're probably not logged in to x.com in this browser or the session expired. Open x.com, log in and reload this page.",
        limit: "X answers 429: too many requests. Wait a few minutes.",
        responses: list => `X answers with errors: ${list}.`,
        errors: (text, more) => `A script error: ${text}${more ? ` (and ${more} more)` : ""}.`,
        waiting: list => `X doesn't answer TweetDeck's requests: ${list}. A reload usually helps.`,
        reloaded: "The page was reloaded automatically already, it didn't help.",
        oldPolicy: "The policy is another load's, not the one that came now: Firefox kept it for this page. A new load of the address helps, not a reload; the Reload button below does that.",
        nothing: "No errors in sight: X may be slow to answer. Wait or reload the page.",
        privacy: "The report has no cookies or tokens, it can go into an issue.",
        copy: "Copy diagnostics", copied: "Copied", reload: "Reload", report: "Report a problem", close: "Hide",
        notSent: "not sent", noAnswer: "no answer", waitingFor: n => `waiting ${n} s`,
    };

    const seconds = at => `${Math.round((at - START) / 1000)} s`;
    // addresses without queries; the extension's own files by their path
    function clean(url) {
        if(!url || !/^[a-z-]+:\/\//.test(url)) return url || "";
        try {
            const u = new URL(url);
            return /-extension:$/.test(u.protocol) ? u.pathname.slice(1) : `${u.host}${u.pathname}`;
        } catch(e) {
            return url.split("?")[0];
        }
    }
    // counts repeats of the same thing, remembers when it was first and last seen; at most 20 kinds
    function tally(map, key, value) {
        const known = map.get(key);
        if(known) {
            known.count++;
            known.last = Date.now();
        }
        else if(map.size < 20) map.set(key, { ...value, count: 1, at: Date.now() });
    }
    const times = v => `×${v.count}, first at ${seconds(v.at)}${v.last ? `, last at ${seconds(v.last)}` : ""}`;

    const steps = {};
    const files = [];
    const csp = new Map();
    const errors = new Map();
    const failed = new Map();
    // the addresses still asked at api.x.com that answered, X retires them one by one
    const oldApi = new Map();
    const moves = [];
    // the requests sent to X with no answer yet, and TweetDeck's steps as it starts
    const pending = new Map();
    const startup = [];
    // where the page came from: what the background script saw of it (undefined: no answer yet, null: didn't see
    // it), the policy that blocked scripts and its directive that did, nonces masked, how many policies blocked
    // anything (extensions' policies are merged with x.com's), and whether x.com's page had one in a <meta>
    let backgroundSaw;
    let policy = "";
    let blockedBy = "";
    const policies = new Set();
    // the nonces of the policy, and of x.com's own scripts in this response: a policy without the response's is
    // another load's, which Firefox kept
    const policyNonces = new Set();
    const pageNonces = new Set();
    let metaPolicy = false;
    let answered = 0;
    let solver = null;
    let theme = "";
    // the columns' requests for their new tweets, by kind of column (home, list, user): how many, the last one,
    // the last one that brought tweets, and how many went without a top cursor
    const polls = new Map();
    // the Spaces column's last check (spaces.js): how X answered each of its sources, and what it showed; how its
    // player goes
    let spaces = null;
    let spacesPlayer = null;
    let startedAt = 0;

    document.addEventListener("otd-diagnostic", e => {
        let entry;
        try {
            entry = JSON.parse(e.detail);
        } catch(err) {
            return;
        }
        if(entry.kind === "step") {
            steps[entry.step] ??= Date.now();
            if(steps.page) metaWatch.disconnect();
        }
        else if(entry.kind === "file") files.push(String(entry.path));
        else if(entry.kind === "moved") moves.push({ key: String(entry.key), moved: !!entry.moved, at: Date.now() });
        else if(entry.kind === "startup" && startup.length < 20) startup.push({ key: String(entry.key), at: Date.now() });
        else if(entry.kind === "request") pending.set(entry.id, { method: String(entry.method), url: clean(entry.url), at: Date.now() });
        else if(entry.kind === "solver") solver = { ok: !!entry.ok, text: String(entry.text || ""), at: Date.now() };
        else if(entry.kind === "theme") theme = String(entry.text || "");
        else if(entry.kind === "spaces-player") spacesPlayer = { state: String(entry.state || ""), error: String(entry.error || "").slice(0, 80), at: Date.now(),
            chat: String(entry.chat || "").slice(0, 80), captionsAsked: String(entry.captionsAsked || "").slice(0, 80), captions: Number(entry.captions) || 0,
            recovered: Array.isArray(entry.recovered) ? entry.recovered.slice(0, 3).map(r => String(r).slice(0, 100)) : [],
            // the stream's ID3 metadata by kind, and what X tells of one on stage: fields' names and kinds only
            metadata: Array.isArray(entry.metadata) ? entry.metadata.slice(0, 12).map(m => String(m).slice(0, 220)) : [],
            participant: String(entry.participant || "").slice(0, 600),
            // what proxsee's answers were made of, by method: fields' names and kinds only
            answers: entry.answers && typeof entry.answers === "object" ? Object.entries(entry.answers).slice(0, 5).map(([method, shape]) => `${String(method).slice(0, 40)} ${String(shape).slice(0, 400)}`) : [],
            messages: Array.isArray(entry.messages) ? entry.messages.slice(0, 12).map(m => String(m).slice(0, 120)) : [] };
        else if(entry.kind === "spaces") spaces = { fleetline: String(entry.fleetline || "—"), search: String(entry.search || "—"), details: String(entry.details || ""), live: Number(entry.live) || 0, coming: Number(entry.coming) || 0, at: Date.now() };
        else if(entry.kind === "poll") {
            const feed = String(entry.feed);
            const poll = polls.get(feed) || { count: 0, at: 0, tweets: 0, cursorless: 0 };
            if(!polls.has(feed) && polls.size >= 10) return;
            poll.count++;
            poll.at = Date.now();
            if(Number(entry.tweets) > 0) poll.tweets = Date.now();
            if(!entry.cursor) poll.cursorless++;
            polls.set(feed, poll);
        }
        else if(entry.kind === "response") {
            pending.delete(entry.id);
            const status = Number(entry.status);
            if(status >= 200 && status < 400) {
                answered++;
                const old = clean(entry.url).match(/^api\.(?:x|twitter)\.com(\/.*)/)?.[1];
                if(old) tally(oldApi, old.replace(/\d{5,}/g, "{id}"), {});
            }
            else tally(failed, `${entry.method} ${clean(entry.url)} ${status || entry.error || ""}`, { method: String(entry.method), url: clean(entry.url), status, error: entry.error ? String(entry.error) : "" });
        }
    });
    const mask = text => String(text || "").replace(/'(nonce|sha\d+)-[^']*'/g, "'$1-…'");
    // script-src-elem falls back on script-src, then default-src
    function directive(text, name) {
        const parts = String(text || "").split(";").map(part => part.trim());
        for(const tried of [name, name.replace(/-(elem|attr)$/, ""), "default-src"]) {
            const found = parts.find(part => part.split(/\s+/)[0].toLowerCase() === tried);
            if(found) return found;
        }
        return "";
    }
    document.addEventListener("securitypolicyviolation", e => {
        if(e.disposition !== "enforce") return;
        policy ||= mask(e.originalPolicy).slice(0, 600);
        blockedBy ||= mask(directive(e.originalPolicy, String(e.effectiveDirective || ""))).slice(0, 600);
        if(policies.size < 10) policies.add(String(e.originalPolicy || ""));
        for(const nonce of String(e.originalPolicy || "").matchAll(/'nonce-([^']+)'/g)) if(policyNonces.size < 10) policyNonces.add(nonce[1]);
        const where = e.sourceFile ? ` ${clean(e.sourceFile)}${e.lineNumber ? `:${e.lineNumber}` : ""}` : "";
        tally(csp, `${e.effectiveDirective} ${e.blockedURI}${where}`, { directive: e.effectiveDirective, blocked: clean(e.blockedURI) || "inline", where });
    }, true);
    // x.com's own page, until injection.js replaces it
    const metaWatch = new MutationObserver(() => {
        if(document.querySelector('meta[http-equiv="Content-Security-Policy" i]')) metaPolicy = true;
        for(const script of document.querySelectorAll("script")) if(script.nonce && pageNonces.size < 10) pageNonces.add(script.nonce);
    });
    metaWatch.observe(document, { childList: true, subtree: true });
    // content.js asks the background script
    window.addEventListener("message", e => {
        if(e.data && typeof e.data === "object" && "otdPage" in e.data) backgroundSaw = e.data.otdPage;
    });
    window.postMessage({ action: "otdPage" }, "*");

    // errors of x.com's own page before injection.js replaced it don't matter
    window.addEventListener("error", e => {
        if(!steps.page || !e.message) return;
        const where = e.filename ? ` (${clean(e.filename)}:${e.lineno})` : "";
        tally(errors, `${e.message}${where}`, { text: `${e.message}${where}` });
    }, true);
    window.addEventListener("unhandledrejection", e => {
        if(!steps.page) return;
        let text;
        try {
            const reason = e.reason;
            text = reason?.message !== undefined ? `${reason.name || "Error"}: ${reason.message}` : String(reason);
            // where it was thrown: the first frame of the stack, "at f (url:1:2)" in Chrome, "f@url:1:2" in Firefox
            const frame = String(reason?.stack || "").split("\n").map(line => line.match(/(\S+):(\d+):\d+\)?$/)).find(Boolean);
            if(frame) text += ` (${clean(frame[1].replace(/^.*[(@]/, ""))}:${frame[2]})`;
        } catch(err) {
            text = "?";
        }
        tally(errors, text, { text });
    });

    // interception.js keeps what it moved
    const movedApi = () => {
        try {
            return JSON.parse(localStorage.OTDmovedApi || "[]").map(String);
        } catch(e) {
            return [];
        }
    };

    // how the browser got the page
    function navigation() {
        try {
            const entry = (window.wrappedJSObject || window).performance.getEntriesByType("navigation")[0];
            if(!entry) return "unknown";
            const from = entry.workerStart > 0 ? "through a service worker" : entry.transferSize > 0 ? `from the network (${Math.round(entry.transferSize / 1024)} kB)` : "from the browser's cache";
            return `${entry.type}, ${from}`;
        } catch(e) {
            return "unknown";
        }
    }
    // x.com's own pages are cross-origin isolated (COOP and COEP), so is what its service worker answers
    const isolated = () => {
        try {
            return (window.wrappedJSObject || window).crossOriginIsolated ? ", cross-origin isolated" : "";
        } catch(e) {
            return "";
        }
    };
    // the background script's answer is about the tab's last response for TweetDeck's page: one from before this
    // page began loading wasn't its own
    function seen(at) {
        if(typeof at !== "number") return "";
        let began;
        try {
            began = pageWindow().performance.timeOrigin;
        } catch(e) {}
        if(typeof began !== "number") return "";
        const after = (at - began) / 1000;
        return after < 0 ? `, ${Math.round(-after)} s before this page began loading: not its load` : `, ${after.toFixed(1)} s into its load`;
    }
    function background() {
        if(backgroundSaw === undefined) return "no answer from the background script";
        if(backgroundSaw === null) return "the background script didn't see it";
        if(backgroundSaw.rules) return "Chrome's rules took its policies off";
        const stripped = Array.isArray(backgroundSaw.stripped) ? backgroundSaw.stripped.join(", ") : "";
        const left = !Array.isArray(backgroundSaw.left) ? "" : `; after every extension's changes ${backgroundSaw.left.length ? `it had ${backgroundSaw.left.join(", ")} again` : "it had none of them"}`;
        return `the background script took off ${stripped || "nothing"} (HTTP ${backgroundSaw.status}${backgroundSaw.fromCache ? ", from the cache" : ""}${seen(backgroundSaw.at)})${left}`;
    }
    const putBack = () => Array.isArray(backgroundSaw?.left) && backgroundSaw.left.includes("content-security-policy");
    // known only when both have nonces
    const otherLoadsPolicy = () => policyNonces.size > 0 && pageNonces.size > 0 && ![...pageNonces].some(nonce => policyNonces.has(nonce));
    const nonces = set => [...set].map(nonce => `${nonce.slice(0, 6)}…`).join(", ");

    const pageWindow = () => window.wrappedJSObject || window;
    const has = name => {
        try {
            return !!pageWindow()[name];
        } catch(e) {
            return false;
        }
    };
    // TweetDeck shows its app when logged in, its login form otherwise
    const started = () => {
        if(!startedAt && document.querySelector("#injected-body .js-app:not(.is-hidden), #injected-body .js-login-form")) startedAt = Date.now();
        return !!startedAt;
    };
    const scriptsBlocked = () => [...csp.values()].filter(v => v.directive.startsWith("script-src")).reduce((n, v) => n + v.count, 0);

    // what probably went wrong, most likely first
    function findings() {
        const list = [];
        if(!steps.extension) list.push(T.noExtension);
        if(files.length) list.push(T.files(files.join(", ")));
        const blocked = scriptsBlocked();
        if(blocked) list.push(T.csp(blocked));
        if(blocked && putBack()) list.push(T.putBack);
        if(blocked && otherLoadsPolicy()) list.push(T.oldPolicy);
        if(CONTROLLED_BY) list.push(T.worker(clean(CONTROLLED_BY)));
        if(solver && !solver.ok) list.push(T.solver(solver.text));
        const responses = [...failed.values()];
        if(responses.some(r => r.status === 401 || r.status === 403)) list.push(T.auth);
        if(responses.some(r => r.status === 429)) list.push(T.limit);
        const other = responses.filter(r => ![401, 403, 429].includes(r.status));
        if(other.length) list.push(T.responses(other.slice(0, 3).map(describe).join("; ")));
        const waiting = waitingFor(10000);
        if(waiting.length) list.push(T.waiting(waiting.slice(0, 3).map(r => `${r.method} ${r.url} (${T.waitingFor(r.seconds)})`).join("; ")));
        const errs = [...errors.values()];
        if(errs.length) list.push(T.errors(errs[0].text, errs.length - 1));
        if(!list.length) list.push(T.nothing);
        if(lastTryIn() > 0) list.push(T.retryIn(Math.ceil(lastTryIn() / 1000)));
        else if(reloadedRecently()) list.push(T.reloaded);
        return list;
    }
    const describe = r => `${r.method} ${r.url} — ${r.status || (r.error ? `${T.notSent} (${r.error})` : T.noAnswer)}`;
    // requests X hasn't answered for at least `ms`, the longest waiting first
    const waitingFor = ms => [...pending.values()].filter(r => Date.now() - r.at >= ms).sort((a, b) => a.at - b.at)
        .map(r => ({ ...r, seconds: Math.round((Date.now() - r.at) / 1000) }));

    const session = (key, value) => {
        try {
            if(value === undefined) return sessionStorage[key];
            sessionStorage[key] = value;
        } catch(e) {}
    };
    const reloadedRecently = () => Date.now() - Number(session(RELOAD_AT) || 0) < RELOAD_AGAIN_AFTER;
    const autoReloads = () => reloadedRecently() ? Number(session(RELOAD_COUNT)) || 1 : 0;
    // this page, opened by the watchdog's reload: how long after it asked (much longer: a reload by hand, probably)
    const ASKED_AT = reloadedRecently() ? Number(session(RELOAD_AT)) : 0;

    // x.com's service worker can answer TweetDeck's page from its cache, with the page policies the extension takes
    // off what comes from the network (it doesn't see what a service worker answers), and then gets every request
    // of the page. When it's in the way it's let go before the reload, which then comes from the network; x.com
    // registers it again when it's opened.
    const serviceWorkers = () => {
        try {
            return (window.wrappedJSObject || window).navigator.serviceWorker || null;
        } catch(e) {
            return null;
        }
    };
    const CONTROLLED_BY = (() => {
        try {
            return serviceWorkers()?.controller?.scriptURL || "";
        } catch(e) {
            return "";
        }
    })();
    let removedWorkers = 0;
    async function dropServiceWorkers() {
        try {
            const registrations = await serviceWorkers()?.getRegistrations();
            for(let i = 0; i < (registrations?.length || 0); i++) if(await registrations[i].unregister()) removedWorkers++;
        } catch(e) {}
    }
    // Settings "blockServiceWorker": the worker goes whenever TweetDeck opens, and the background script doesn't let
    // x.com load it again; told on every load, so switching it off lets it back
    const KEEP_WORKER_OFF = (() => {
        try {
            return localStorage.OTDblockServiceWorker === "1";
        } catch(e) {
            return false;
        }
    })();
    window.postMessage({ action: "otdServiceWorker", block: KEEP_WORKER_OFF }, "*");
    if(KEEP_WORKER_OFF) dropServiceWorkers();
    // after a while a reload may help, but not with missing scripts or being logged out
    const reloadMayHelp = () => !scriptsBlocked() && !files.length && ![...failed.values()].some(r => r.status === 401 || r.status === 403);
    // Firefox may keep x.com's policy on a page the background script took it off: when the reload moves the tab
    // out of the process of x.com's cross-origin isolated page (what its service worker answered, or x.com itself a
    // moment before), or another extension that changes the page's headers after the background script gives it back.
    // A reload by hand half a minute later had none so far.
    const policyKept = () => scriptsBlocked() && !metaPolicy && Array.isArray(backgroundSaw?.stripped) && backgroundSaw.stripped.includes("content-security-policy");
    // kept after two reloads: one more, a while after the first
    const lastTryIn = () => !dismissed && autoReloads() === 2 && policyKept() ? Number(session(RELOAD_FIRST) || 0) + KEPT_RETRY_AFTER - Date.now() : 0;

    function report() {
        let version = "";
        try {
            version = globalThis.browser?.runtime?.getManifest?.().version || globalThis.chrome?.runtime?.getManifest?.().version || "";
        } catch(e) {}
        version ||= document.documentElement.dataset.otdVersion || "?";
        const now = Date.now();
        const lines = [
            "TweeXDeck diagnostics",
            `Version: ${version}`,
            `Browser: ${navigator.userAgent}`,
            `Page: ${location.origin}${location.pathname}`,
            `Time: ${new Date(now).toISOString()}, ${seconds(now)} after the page opened`,
            `TweetDeck: ${started() ? `started at ${seconds(startedAt)}` : "not started"}`,
            `Steps: ${["extension", "page", "scripts"].map(step => `${step} ${steps[step] ? seconds(steps[step]) : "—"}`).join(", ")}; TD ${has("TD") ? "yes" : "no"}, OTD ${has("OTD") ? "yes" : "no"}`,
            `TweetDeck's steps: ${startup.map(s => `${s.key} ${seconds(s.at)}`).join(", ") || "none"}`,
            `Service worker: ${CONTROLLED_BY ? `controls the page (${clean(CONTROLLED_BY)})` : "none"}${removedWorkers ? `, ${removedWorkers} removed` : ""}`,
            `Loaded: ${navigation()}${isolated()}${MARKED ? ", the watchdog's new load" : ""}${ASKED_AT ? `, ${((START - ASKED_AT) / 1000).toFixed(1)} s after the automatic reload was asked` : ""}; ${background()}`,
            `Page policy: ${policy || "nothing blocked"}${metaPolicy ? "; x.com's page has one in a <meta>" : ""}${policies.size > 1 ? `; ${policies.size} policies blocked scripts` : ""}`,
            ...(blockedBy ? [`Blocked by: ${blockedBy}`] : []),
            ...(policyNonces.size ? [`Nonces: the policy's ${nonces(policyNonces)}; x.com's scripts' ${nonces(pageNonces) || "none"}${pageNonces.size ? (otherLoadsPolicy() ? ", none of them in the policy: another load's policy" : ", in the policy: this load's") : ""}`] : []),
            `Solver: ${solver ? `${solver.ok ? "ready" : "failed"} at ${seconds(solver.at)} (${solver.text})` : "no news"}`,
            `Dark theme: ${theme || "no news"}`,
            `Extension files not loaded: ${files.join(", ") || "none"}`,
            `Blocked by Content-Security-Policy: ${csp.size ? "" : "nothing"}`,
            ...[...csp.values()].map(v => `  ${v.directive} ${v.blocked}${v.where} ${times(v)}`),
            `X: ${answered} answered fine${failed.size ? ", errors:" : ""}`,
            ...[...failed.values()].map(r => `  ${describe(r)} ${times(r)}`),
            `Columns asking for new tweets: ${polls.size ? "" : "none yet"}`,
            ...[...polls].map(([feed, p]) => `  ${feed} ×${p.count} (${p.cursorless} without a top cursor), the last at ${seconds(p.at)}, the last with tweets ${p.tweets ? `at ${seconds(p.tweets)}` : "none"}`),
            `Spaces column: ${spaces ? `fleetline ${spaces.fleetline}, search ${spaces.search}, details ${spaces.details}; ${spaces.live} live, ${spaces.coming} to come, at ${seconds(spaces.at)}` : "no news"}${spacesPlayer ? `; player ${spacesPlayer.state}${spacesPlayer.error ? ` (${spacesPlayer.error})` : ""} at ${seconds(spacesPlayer.at)}${spacesPlayer.recovered.length ? `, going again after ${spacesPlayer.recovered.join("; ")}` : ""}${spacesPlayer.chat ? `, chat ${spacesPlayer.chat}${spacesPlayer.captionsAsked ? `, captions asked: ${spacesPlayer.captionsAsked}` : ""}, ${spacesPlayer.captions} captions${spacesPlayer.messages.length ? `, messages ${spacesPlayer.messages.join("; ")}` : ""}` : ""}` : ""}`,
            ...(spacesPlayer?.answers.length ? [`  Spaces chat's answers: ${spacesPlayer.answers.join("; ")}`] : []),
            ...(spacesPlayer?.metadata.length ? [`  Spaces stream's metadata: ${spacesPlayer.metadata.join("; ")}`] : []),
            ...(spacesPlayer?.participant ? [`  Spaces' one on stage: ${spacesPlayer.participant}`] : []),
            `Waiting for X: ${pending.size ? "" : "nothing"}`,
            ...waitingFor(0).map(r => `  ${r.method} ${r.url} for ${r.seconds} s`),
            `Still asked at api.x.com and answered: ${[...oldApi].map(([path, v]) => `${path} ×${v.count}`).join(", ") || "nothing"}`,
            `Moved to x.com/i/api: ${movedApi().join(", ") || "nothing"}`,
            ...moves.map(m => `  ${m.key} ${m.moved ? "moved" : "moved back"} at ${seconds(m.at)}`),
            `Script errors: ${errors.size ? "" : "none"}`,
            ...[...errors.values()].map(v => `  ${v.text} ${times(v)}`),
        ];
        const before = session(RELOAD_REPORT);
        if(before) lines.push("", `Before the automatic reload at ${new Date(Number(session(RELOAD_AT))).toISOString()}:`, before);
        return lines.join("\n");
    }
    document.addEventListener("otd-diagnostic-request", () => {
        document.dispatchEvent(new CustomEvent("otd-diagnostic-report", { detail: report() }));
    });

    async function copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch(e) {
            const area = document.createElement("textarea");
            area.value = text;
            area.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0;";
            document.documentElement.append(area);
            area.select();
            const done = document.execCommand("copy");
            area.remove();
            return done;
        }
    }

    // Styles go through the CSSOM: when the page's policy blocks scripts it may block inline styles too
    function el(tag, css, text) {
        const node = document.createElement(tag);
        if(css) node.style.cssText = css;
        if(text !== undefined) node.textContent = text;
        return node;
    }
    const BUTTON = "margin: 0 8px 8px 0; padding: 6px 12px; border: 1px solid #1da1f2; border-radius: 16px; background: #fff; color: #1da1f2; font: inherit; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block;";

    let host = null;
    let list = null;
    let dismissed = false;
    function show() {
        if(!host) {
            // in a shadow root, out of reach of TweetDeck's styles for buttons and lists
            host = el("div", "position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%); width: calc(100% - 32px); max-width: 560px;");
            host.id = "otd-watchdog";
            const panel = el("div", "box-sizing: border-box; max-height: calc(100vh - 48px); overflow-y: auto; padding: 16px 16px 8px; border-radius: 12px; background: #fff; color: #14171a; box-shadow: 0 4px 24px rgba(0, 0, 0, .35); font: 14px/1.4 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; text-align: left; position: relative;");
            panel.setAttribute("role", "alert");
            const close = el("button", "position: absolute; top: 8px; right: 10px; border: 0; padding: 0; background: none; color: #657786; font-size: 20px; line-height: 1; cursor: pointer;", "×");
            close.title = T.close;
            close.setAttribute("aria-label", T.close);
            close.addEventListener("click", () => {
                dismissed = true;
                host.remove();
            });
            list = el("ul", "margin: 8px 0; padding-left: 20px; list-style: disc;");
            list.className = "findings";
            const copyButton = el("button", BUTTON, T.copy);
            copyButton.className = "copy";
            copyButton.addEventListener("click", async () => {
                if(await copy(report())) copyButton.textContent = T.copied;
                setTimeout(() => { copyButton.textContent = T.copy; }, 2000);
            });
            const reload = el("button", BUTTON, T.reload);
            reload.addEventListener("click", newLoad);
            const issue = el("a", BUTTON, T.report);
            issue.href = ISSUES;
            issue.target = "_blank";
            issue.rel = "noopener noreferrer";
            panel.append(close, el("div", "font-size: 16px; font-weight: bold; padding-right: 24px;", T.title), list,
                el("div", "margin-bottom: 10px; color: #657786; font-size: 12px;", `TweeXDeck · ${T.privacy}`), copyButton, reload, issue);
            host.attachShadow({ mode: "open" }).append(panel);
        }
        list.replaceChildren(...findings().map(text => el("li", "margin-bottom: 4px;", text)));
        // injection.js replaces the page under it when the extension starts late
        if(!host.isConnected) document.documentElement.append(host);
    }

    const timer = setInterval(() => {
        if(started()) {
            clearInterval(timer);
            host?.remove();
            return;
        }
        if(dismissed || localStorage.OTDloadWatchdog === "0") return;
        const waited = Date.now() - START;
        if(!host && !reloadedRecently()) {
            // a service worker in the way, or the page's policy kept, which is its doing: at once
            if(CONTROLLED_BY || scriptsBlocked()) return reload();
            if(waited >= DEADLINE && reloadMayHelp()) return reload();
        }
        else if(!host && autoReloads() < 2 && policyKept()) return reload();
        else if(autoReloads() === 2 && policyKept() && lastTryIn() <= 0) return reload();
        if(waited >= DEADLINE || (waited >= DEADLINE_BROKEN && (scriptsBlocked() || files.length))) show();
    }, 1000);

    async function reload() {
        clearInterval(timer);
        await dropServiceWorkers();
        // the stuck page's report stays for the next one, with the one before it after a recent reload
        const count = autoReloads() + 1;
        session(RELOAD_REPORT, count > 1 ? report() : report().split("\n\nBefore the automatic reload")[0]);
        session(RELOAD_COUNT, String(count));
        if(count === 1) session(RELOAD_FIRST, String(Date.now()));
        session(RELOAD_AT, String(Date.now()));
        newLoad();
    }
    // a new load of TweetDeck's address: its own history entry and policy, past the browser's cache (a new address)
    // and the service worker let go
    function newLoad() {
        const url = new URL(location.href);
        url.searchParams.set(LOAD_MARK, Date.now().toString(36));
        location.replace(url.href);
    }
})();
