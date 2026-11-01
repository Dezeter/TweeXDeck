// Density, the theme that follows the system's, and Lights out; all of them apply without a reload
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addAccount, addScripts } = require("./helpers");

test.use({ viewport: { width: 1200, height: 700 } });

async function open(page, { storage, columns = 3, dark = false, before } = {}) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await addAccount(page);
    await page.evaluate(([columns, dark]) => {
        if(dark) document.documentElement.classList.add("dark");
        TD.settings.getColumnWidth = () => "medium";
        const user = { id_str: "10", screen_name: "alice", name: "alice", profile_image_url_https: "", entities: {} };
        const tweet = window.__client.processTweet({ id_str: "1", full_text: "hello", text: "hello", created_at: new Date().toUTCString(), source: "web", user, entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] } });
        const column = i => `<section class="js-column column" data-column="c${i}"><div class="column-panel"><div class="js-chirp-container chirp-container">${tweet.render({})}</div></div></section>`;
        document.body.insertAdjacentHTML("beforeend", `<div class="js-app-columns-container app-columns-container scroll-h"><div class="js-app-columns app-columns horizontal-flow-container">${Array.from({ length: columns }, (_, i) => column(i)).join("")}</div></div>`);
    }, [columns, dark]);
    // [function, argument] to run in the page before the scripts load
    if(before) await page.evaluate(...before);
    await addScripts(page, "src/otd-common.js", "src/layout.js", "src/theme.js");
}
test("comfortable density: more room around a tweet and text from 15px, larger font sizes kept", async ({ page }) => {
    await open(page);
    const look = () => page.evaluate(() => {
        const style = getComputedStyle(document.querySelector(".stream-item > .item-box"));
        return [style.padding, getComputedStyle(document.querySelector(".tweet-text")).fontSize];
    });
    const compact = await look();
    expect(compact[0]).toBe("8px 10px");
    await page.evaluate(() => OTD.setValue(OTD.DENSITY_STORAGE, "comfortable"));
    expect(await look()).toEqual(["12px 14px", "15px"]);
    expect(await page.evaluate(() => localStorage.OTDdensity)).toBe("comfortable");
    // TweetDeck's "Largest", 16px
    await page.evaluate(() => document.documentElement.classList.add("txt-size--16"));
    expect((await look())[1]).toBe("16px");
    await page.evaluate(() => {
        document.documentElement.classList.remove("txt-size--16");
        OTD.setValue(OTD.DENSITY_STORAGE, "");
    });
    expect(await look()).toEqual(compact);
});

// TweetDeck's theme setting as a stub: the theme it holds and what was set
const stubTheme = theme => [theme => {
    window.__theme = theme;
    window.__sets = [];
    TD.settings.getTheme = () => window.__theme;
    TD.settings.setTheme = value => {
        window.__theme = value;
        window.__sets.push(value);
    };
}, theme];
const ready = page => page.evaluate(() => {
    TD.ready = true;
    OTD.jQuery()(document).trigger("TD.ready.otd-theme");
});

test("\"System\" follows the system's theme once TweetDeck is ready, and as it changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, { storage: { OTDthemeSystem: "1" }, before: stubTheme("light") });
    // TweetDeck's settings aren't there yet
    expect(await page.evaluate(() => window.__sets)).toEqual([]);
    await ready(page);
    expect(await page.evaluate(() => window.__sets)).toEqual(["dark"]);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => page.evaluate(() => window.__sets)).toEqual(["dark", "light"]);

    // TweetDeck's own pick ends it, "system" starts it again
    await page.evaluate(() => TD.settings.setTheme("dark"));
    expect(await page.evaluate(() => localStorage.OTDthemeSystem ?? null)).toBeNull();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    expect(await page.evaluate(() => window.__sets)).toEqual(["dark", "light", "dark"]);
    // Firefox tells the page of the system's change a little later
    await expect.poll(() => page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(false);
    await page.evaluate(() => TD.settings.setTheme("system"));
    expect(await page.evaluate(() => [localStorage.OTDthemeSystem, window.__theme])).toEqual(["1", "light"]);
});

test("without \"System\" the theme stays TweetDeck's", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, { before: stubTheme("light") });
    await ready(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await page.evaluate(() => window.__sets)).toEqual([]);
});

const colors = page => page.evaluate(() => ({
    column: getComputedStyle(document.querySelector(".column")).backgroundColor,
    item: getComputedStyle(document.querySelector(".stream-item")).backgroundColor,
    border: getComputedStyle(document.querySelector(".stream-item")).borderBottomColor,
    app: getComputedStyle(document.querySelector(".app-columns-container")).backgroundColor,
    mute: getComputedStyle(document.querySelector(".tweet-timestamp")).color,
}));

const CALM = { column: "rgb(19, 20, 22)", item: "rgb(19, 20, 22)", border: "rgba(255, 255, 255, 0.06)", app: "rgb(8, 9, 10)", mute: "rgb(128, 132, 140)" };
test("the dark theme is calm: TweetDeck's blues are neutral greys, a column a shade lighter than the app, a hairline between tweets", async ({ page }) => {
    await open(page, { dark: true });
    expect(await colors(page)).toEqual(CALM);
    // TweetDeck's blue: the soft one for links, lines and icons; under white text a deeper one, 4.8:1
    expect(await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", '<a class="otd-test-link" href="#">link</a><button class="Button Button--primary otd-test-button">Tweet</button><i class="icon icon-follow-color otd-test-follow"></i>');
        const style = selector => getComputedStyle(document.querySelector(selector));
        return [style(".otd-test-link").color, style(".otd-test-button").backgroundColor, style(".otd-test-follow").color];
    })).toEqual(["rgb(124, 156, 255)", "rgb(68, 102, 238)", "rgb(124, 156, 255)"]);
    // the tweet picked with the keys keeps its mark
    expect(await page.evaluate(() => {
        const item = document.querySelector(".stream-item");
        item.classList.add("is-selected-tweet");
        const picked = getComputedStyle(item).backgroundColor;
        item.classList.remove("is-selected-tweet");
        return picked;
    })).toBe("rgb(28, 29, 31)");
    // every rule of TweetDeck's dark theme with its blue has a twin
    expect(await page.evaluate(() => {
        const twins = new Set([...document.getElementById("otd-calm").sheet.cssRules].map(rule => rule.selectorText));
        const blue = [...document.styleSheets].filter(sheet => sheet.ownerNode.id !== "otd-calm").flatMap(sheet => [...sheet.cssRules])
            .filter(rule => rule.selectorText?.includes("html.dark") && rule.style.cssText.includes("rgb(29, 161, 242)"));
        return [blue.length > 50, blue.filter(rule => !twins.has(rule.selectorText)).map(rule => rule.selectorText)];
    })).toEqual([true, []]);
    // the calm light theme, as the page switches to it
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    expect(await colors(page)).toEqual(LIGHT);
});

const LIGHT = { column: "rgb(255, 255, 255)", item: "rgb(255, 255, 255)", border: "rgba(0, 0, 0, 0.07)", app: "rgb(241, 242, 244)", mute: "rgb(108, 112, 120)" };
test("the light theme is the calm one in light: white columns on a light grey, neutral greys, a hairline between tweets, a deeper soft blue", async ({ page }) => {
    await open(page);
    expect(await colors(page)).toEqual(LIGHT);
    // TweetDeck's blue: a deeper one of the soft blue for links and icons on white, 5.6:1; under white text the
    // dark theme's, 4.8:1
    expect(await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", '<a class="otd-test-link" href="#">link</a><button class="Button Button--primary otd-test-button">Tweet</button><i class="icon icon-follow-color otd-test-follow"></i>');
        const style = selector => getComputedStyle(document.querySelector(selector));
        return [style(".otd-test-link").color, style(".otd-test-button").backgroundColor, style(".otd-test-follow").color];
    })).toEqual(["rgb(58, 92, 224)", "rgb(68, 102, 238)", "rgb(58, 92, 224)"]);
    // the left bar the app's grey, not TweetDeck's dark blue: its text dark, the compose button without the blue
    expect(await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", `<div class="js-app application" style="position:absolute;left:0;top:0;bottom:0;width:200px">${TD.ui.template.render("topbar/app_header", {})}</div>`);
        const style = selector => getComputedStyle(document.querySelector(selector));
        return [style(".app-header").backgroundColor, style(".app-nav-link-text").color, style(".js-show-drawer").color, style(".js-show-drawer").backgroundColor];
    })).toEqual(["rgb(241, 242, 244)", "rgb(27, 28, 31)", "rgb(27, 28, 31)", "rgba(0, 0, 0, 0.05)"]);
    // every rule of TweetDeck's light theme with its blue has a twin only light pages match
    expect(await page.evaluate(() => {
        const twins = new Set([...document.getElementById("otd-light").sheet.cssRules].map(rule => rule.selectorText));
        const lightOnly = selector => selector.split(", ").map(one => one.startsWith("html") ? `html:where(:not(.dark))${one.slice(4)}` : `:where(html:not(.dark)) ${one}`).join(", ");
        const blue = [...document.styleSheets].filter(sheet => !sheet.ownerNode.id?.startsWith("otd-")).flatMap(sheet => [...sheet.cssRules])
            .filter(rule => rule.selectorText && !rule.selectorText.includes("html.dark") && rule.style.cssText.includes("rgb(29, 161, 242)"));
        return [blue.length > 50, blue.filter(rule => !twins.has(lightOnly(rule.selectorText))).map(rule => rule.selectorText)];
    })).toEqual([true, []]);
    // and dark as the page switches to it: the calm dark theme, the light twins out of its way
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    expect(await colors(page)).toEqual(CALM);
});

test("Lights out: the calm dark theme in black, with a hairline round a column; off, the calm one again", async ({ page }) => {
    await open(page, { dark: true, storage: { OTDlightsOut: "1" } });
    expect(await colors(page)).toEqual({ column: "rgb(0, 0, 0)", item: "rgb(0, 0, 0)", border: "rgba(255, 255, 255, 0.1)", app: "rgb(0, 0, 0)", mute: "rgb(128, 132, 140)" });
    // over the column's tweets: on the panel itself its scroller, drawn over it, hid the hairline by them
    expect(await page.$eval(".column-panel", el => [getComputedStyle(el, "::after").boxShadow, getComputedStyle(el, "::after").zIndex])).toEqual(["rgba(255, 255, 255, 0.1) 0px 0px 0px 1px inset", "2"]);
    // a rule with !important keeps it
    expect(await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", '<div class="accounts-drawer"></div>');
        return getComputedStyle(document.querySelector(".accounts-drawer")).backgroundColor;
    })).toBe("rgb(0, 0, 0)");

    await page.evaluate(() => OTD.setOn("lightsOut", false));
    expect(await colors(page)).toEqual(CALM);
    await page.evaluate(() => OTD.setOn("lightsOut", true));
    expect((await colors(page)).column).toBe("rgb(0, 0, 0)");
    expect(await page.$$("#otd-lights-out")).toHaveLength(1);
});

// Firefox: injection.js is a content script there, and the <style> it puts TweetDeck's CSS in is closed to the page
const closeTweetDecksSheet = () => {
    const sheet = [...document.styleSheets].sort((a, b) => b.cssRules.length - a.cssRules.length)[0];
    Object.defineProperty(sheet, "cssRules", { get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
};
// what theme.js tells the load watchdog
const listen = () => {
    window.__theme = [];
    document.addEventListener("otd-diagnostic", e => JSON.parse(e.detail).kind === "theme" && window.__theme.push(JSON.parse(e.detail).text));
};
test("TweetDeck's CSS closed to the page, as in Firefox: the calm theme and Lights out from its text", async ({ page }) => {
    await open(page, { dark: true, before: [`(${listen})(); (${closeTweetDecksSheet})();`] });
    expect(await colors(page)).toEqual(CALM);
    await page.evaluate(() => OTD.setOn("lightsOut", true));
    expect(await colors(page)).toMatchObject({ column: "rgb(0, 0, 0)", item: "rgb(0, 0, 0)", app: "rgb(0, 0, 0)" });
    expect(await page.evaluate(() => window.__theme)).toEqual([
        expect.stringMatching(/^[1-9]\d{2} twins of TweetDeck's dark rules, [1-9]\d{2} of its light ones, its CSS read from its text$/),
        expect.stringMatching(/^[1-9]\d{2} twins of TweetDeck's dark rules, [1-9]\d{2} of its light ones, [1-9]\d+ for Lights out, its CSS read from its text$/),
    ]);
});

test("TweetDeck's CSS after theme.js: the twins once TweetDeck is ready, after it", async ({ page }) => {
    // TweetDeck's sheet out until TD.ready
    const takeOut = () => {
        window.__tdStyle = [...document.styleSheets].sort((a, b) => b.cssRules.length - a.cssRules.length)[0].ownerNode;
        window.__tdStyle.remove();
    };
    await open(page, { dark: true, before: [`(${listen})(); (${takeOut})();`] });
    // the light ones of the extension's own rules
    expect((await page.evaluate(() => window.__theme))[0]).toMatch(/^0 twins of TweetDeck's dark rules, \d of its light ones$/);
    await page.evaluate(() => {
        document.head.append(window.__tdStyle);
        OTD.jQuery()(document).trigger("TD.ready.otd-twins");
    });
    // the pointer off the tweets: the page's change has it over one, at 0, 0
    await page.mouse.move(5, 700);
    expect(await colors(page)).toEqual(CALM);
    expect((await page.evaluate(() => window.__theme))[1]).toMatch(/^[1-9]\d{2} twins of TweetDeck's dark rules, [1-9]\d{2} of its light ones$/);
});

test("Lights out leaves the light theme alone", async ({ page }) => {
    await open(page, { storage: { OTDlightsOut: "1" } });
    expect(await colors(page)).toEqual(LIGHT);
});

test("TweetDeck's blue panels in the light theme, the composer's drawer and a reply in a column: a light grey, their text dark", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => {
        // TweetDeck's own markup of them, its mustache tags out
        const req = window.__require;
        const template = text => String(req(Object.keys(req.m).find(id => req.m[id].toString().includes(text))).default).replace(/\{\{[^}]*\}\}/g, "");
        document.body.insertAdjacentHTML("beforeend", `<div style="width:300px">${template("js-docked-compose compose txt-size--14")}</div>`);
        document.querySelector("article .js-stream-item-content").insertAdjacentHTML("beforeend", template("js-inline-reply inline-reply item-box-full-bleed").replace("is-inline-inactive ", ""));
        const style = selector => getComputedStyle(document.querySelector(selector));
        return {
            drawer: [style(".compose").backgroundColor, style(".compose-title-text").color, style(".compose .btn-on-blue").backgroundColor, style(".compose .btn-on-blue .label").color],
            reply: [style(".inline-reply").backgroundColor, style(".inline-reply label").color, style(".inline-reply .icon-close").color],
        };
    })).toEqual({
        drawer: ["rgb(241, 242, 244)", "rgb(27, 28, 31)", "rgba(0, 0, 0, 0.05)", "rgb(27, 28, 31)"],
        reply: ["rgb(243, 244, 245)", "rgb(27, 28, 31)", "rgb(91, 95, 103)"],
    });
});
