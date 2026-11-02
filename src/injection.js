let extId;
let isFirefox = navigator.userAgent.indexOf('Firefox') > -1;
let cookie = null;

if(!window.chrome) window.chrome = {};
if(!window.chrome.runtime) window.chrome.runtime = {};
window.chrome.runtime.getURL = url => {
    if(!url.startsWith('/')) url = `/${url}`;
    return `${isFirefox ? 'moz-extension://' : 'chrome-extension://'}${extId}${url}`;   
}
window.addEventListener('message', e => {
    if(e.data.extensionId) {
        console.log("got extensionId", e.data.extensionId);
        extId = e.data.extensionId;
        main();
    } else if(e.data.cookie) {
        cookie = e.data.cookie;
    }
});
window.postMessage('extensionId', '*');
window.postMessage('cookie', '*');

async function main() {
    // for the load watchdog (watchdog.js): how far this got, and the extension's files that didn't load
    let otdDiagnostic = entry => document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify(entry) }));
    // scripts are named after their file, for errors and the browser's developer tools
    let load = path => fetch(chrome.runtime.getURL(path)).then(r => {
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
    }).then(text => path.endsWith(".js") ? `${text}\n//# sourceURL=${chrome.runtime.getURL(path)}` : text).catch(e => {
        otdDiagnostic({ kind: "file", path, error: String(e) });
        throw e;
    });
    otdDiagnostic({ kind: "step", step: "extension" });

    let html = await load('/files/index.html');
    document.documentElement.innerHTML = html;
    otdDiagnostic({ kind: "step", step: "page" });
    // for the settings tab, which runs in the page and can't read the manifest itself in Firefox
    let manifest = await fetch(chrome.runtime.getURL('/manifest.json')).then(r => r.json()).catch(() => null);
    if(manifest) document.documentElement.dataset.otdVersion = manifest.version;
    // for files the page loads when needed (files/emoji.json); in Firefox it can't build the address itself
    document.documentElement.dataset.otdBase = chrome.runtime.getURL('/');

    let [challenge_js, interception_js, vendor_js, bundle_js, bundle_css, twitter_text, ...local_js] =
        await Promise.allSettled([
            load("/src/challenge.js"),
            load("/src/interception.js"),
            load("/files/vendor.js"),
            load("/files/bundle.js"),
            load("/files/bundle.css"),
            load("/files/twitter-text.js"),
            // otd-common.js first: the others use window.OTD
            load("/src/otd-common.js"),
            load("/src/fonts.js"),
            load("/src/modern-look.js"),
            load("/src/layout.js"),
            load("/src/theme.js"),
            load("/src/icons.js"),
            load("/src/grok-translate.js"),
            load("/src/hide-home-replies.js"),
            load("/src/self-threads.js"),
            load("/src/compact-headers.js"),
            load("/src/conversation-replies.js"),
            load("/src/paste-images.js"),
            load("/src/x-articles.js"),
            load("/src/cashtags.js"),
            load("/src/instant-replies.js"),
            load("/src/settings.js"),
            load("/src/palette.js"),
            load("/src/group-notifications.js"),
            load("/src/clean-links.js"),
            load("/src/absolute-time.js"),
            load("/src/media-layout.js"),
            load("/src/inline-video.js"),
            load("/src/download-media.js"),
            load("/src/pause-on-hover.js"),
            load("/src/steady-columns.js"),
            load("/src/for-you.js"),
            load("/src/loading.js"),
            load("/src/tab-title.js"),
            load("/src/emoji-picker.js"),
            load("/src/gif-picker.js"),
            load("/src/long-posts.js"),
            load("/src/tweet-actions.js"),
        ]);

    let challenge_js_script = document.createElement("script");
    challenge_js_script.innerHTML = challenge_js.value;
    document.head.appendChild(challenge_js_script);

    let interception_js_script = document.createElement("script");
    interception_js_script.innerHTML = interception_js.value;
    document.head.appendChild(interception_js_script);

    let bundle_css_style = document.createElement("style");
    bundle_css_style.innerHTML = bundle_css.value;
    document.head.appendChild(bundle_css_style);

    let vendor_js_script = document.createElement("script");
    vendor_js_script.innerHTML = vendor_js.value;
    document.head.appendChild(vendor_js_script);

    let bundle_js_script = document.createElement("script");
    bundle_js_script.innerHTML = bundle_js.value;
    document.head.appendChild(bundle_js_script);

    let twitter_text_script = document.createElement("script");
    twitter_text_script.innerHTML = twitter_text.value;
    document.head.appendChild(twitter_text_script);

    for(let local_script_js of local_js) {
        if(local_script_js.status !== "fulfilled") continue;
        let local_script = document.createElement("script");
        local_script.innerHTML = local_script_js.value;
        document.head.appendChild(local_script);
    }
    otdDiagnostic({ kind: "step", step: "scripts" });

    let int = setTimeout(function() {
        let badBody = document.querySelector('body:not(#injected-body)');
        if (badBody) {
            let badHead = document.querySelector('head:not(#injected-head)');
            clearInterval(int);
            if(badHead) badHead.remove();
            badBody.remove(); 
        }
    }, 200);
    setTimeout(() => clearInterval(int), 10000);

    let injInt;
    function injectAccount() {
        if(!document.querySelector('a[data-title="Accounts"]')) return;
        clearInterval(injInt);

        let accountsBtn = document.querySelector('a[data-title="Accounts"]');
        accountsBtn.addEventListener("click", function() {
            console.log("setting account cookie");
            chrome.runtime.sendMessage({ action: "setcookie" }); 
        });
    }
    setInterval(injectAccount, 1000);
};