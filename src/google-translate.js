// Translation for the page scripts (x-articles.js, spaces.js), in the background script: the endpoints send no CORS
// headers, and host_permissions let the extension call them anyway. Google's first, as Google's own pages ask it;
// where Google turns the address away (HTTP 429, as it does an address it finds "unusual traffic" from, as a VPN's,
// for days) or fails, Microsoft's, as Edge's own translation asks it, Google left alone for 15 minutes after a 429.
// What's asked is lines of text joined by \n; what comes back, as many lines, the language found, and by whom.
const GOOGLE_RESTS = 15 * 60 * 1000;
let googleRestsUntil = 0;
const failed = (message, status) => Object.assign(new Error(message), { status });

async function google(text, to) {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`);
    if(!res.ok) throw failed(`HTTP ${res.status}`, res.status);
    const data = await res.json();
    // [[[translated, original, ...], ...], null, detected language, ...]
    return { text: (data[0] || []).map(sentence => sentence[0] || "").join(""), lang: data[2] };
}

// Microsoft's: a token Edge gets for it, good for 10 minutes, kept for 8; a list of lines, each translated alone
let microsoftToken = "", microsoftTokenAt = 0;
const MICROSOFT_LANGS = { zh: "zh-Hans", no: "nb", sr: "sr-Cyrl" };
async function microsoftSignIn(again) {
    if(!again && microsoftToken && Date.now() - microsoftTokenAt < 8 * 60 * 1000) return microsoftToken;
    const res = await fetch("https://edge.microsoft.com/translate/auth");
    if(!res.ok) throw failed(`sign-in HTTP ${res.status}`, res.status);
    microsoftToken = (await res.text()).trim();
    microsoftTokenAt = Date.now();
    return microsoftToken;
}
async function microsoft(text, to) {
    const lines = text.split("\n");
    const asked = lines.map((line, i) => [i, line]).filter(([, line]) => line.trim());
    const ask = async again => fetch(`https://api-edge.cognitive.microsofttranslator.com/translate?from=&to=${MICROSOFT_LANGS[to] || to}&api-version=3.0`, {
        method: "POST",
        headers: { authorization: `Bearer ${await microsoftSignIn(again)}`, "content-type": "application/json" },
        body: JSON.stringify(asked.map(([, line]) => ({ Text: line }))),
    });
    let res = await ask(false);
    // the token gone stale before its time: a new one, once
    if(res.status === 401) res = await ask(true);
    if(!res.ok) throw failed(`HTTP ${res.status}`, res.status);
    const data = await res.json();
    const out = lines.map(() => "");
    asked.forEach(([i], n) => out[i] = data?.[n]?.translations?.[0]?.text ?? "");
    return { text: out.join("\n"), lang: data?.find?.(item => item?.detectedLanguage)?.detectedLanguage?.language };
}

async function googleTranslate(text, to) {
    if(typeof text !== "string" || !text || encodeURIComponent(text).length > 8000 || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(to)) {
        return { error: "bad request" };
    }
    let googleError = "turned the address away earlier";
    if(Date.now() >= googleRestsUntil) {
        try {
            return { ...await google(text, to), via: "Google" };
        } catch(e) {
            googleError = String(e?.message || e);
            if(e?.status === 429) googleRestsUntil = Date.now() + GOOGLE_RESTS;
        }
    }
    try {
        return { ...await microsoft(text, to), via: "Microsoft" };
    } catch(e) {
        return { error: `Google ${googleError}, Microsoft ${String(e?.message || e)}`.slice(0, 120) };
    }
}
