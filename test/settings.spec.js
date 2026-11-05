const { test, expect } = require("@playwright/test");
const { ROOT, openPage, addTweetDeck, addScripts } = require("./helpers");

test.use({ locale: "ru-RU", viewport: { width: 1000, height: 760 } });

// TweetDeck's own settings dialog with otd-common.js and settings.js loaded
async function openSettings(page, { storage, dark = false } = {}) {
    await openPage(page, { storage });
    await page.evaluate(() => { document.documentElement.dataset.otdVersion = "5.1.0"; });
    await addTweetDeck(page, { css: true });
    await addScripts(page, "src/otd-common.js", "src/settings.js");
    await page.evaluate(dark => {
        if(dark) document.documentElement.classList.add("dark");
        document.body.insertAdjacentHTML("beforeend", '<div id="settings-modal" class="js-modal settings-modal ovl scroll-v"></div>');
        TD.storage.accountController.isEmpty = () => false;
        new TD.components.GlobalSettings();
    }, dark);
}
const tab = (page, title) => page.locator(".js-setting-list a.list-link").filter({ hasText: new RegExp(`^${title}$`) }).click();
const TABS = { appearance: "Внешний вид", translation: "Перевод", columns: "Колонки", tweets: "Твиты", media: "Медиа", compose: "Написание", other: "Прочее" };
// the tab of a feature's section
const tabOf = async (page, key) => tab(page, TABS[await page.evaluate(key => OTD.FEATURES.find(f => f.key === key).section, key)]);
const switches = page => page.evaluate(() => [...document.querySelectorAll("#otd-settings .otd-setting")].map(row => [row.dataset.feature, row.querySelector("i").classList.contains("icon-toggle-on")]));

test("TweeXDeck's tabs after TweetDeck's own, one for each section, a switch for every feature in them", async ({ page }) => {
    await openSettings(page, { storage: { OTDpasteImages: "0" } });
    expect(await page.$$eval(".js-setting-list a.list-link", links => links.map(a => a.textContent.trim()))).toEqual(["General", "Link Shortening", "Mute", "TweeXDeck", ...Object.values(TABS)]);
    // the heading opens nothing
    expect(await page.$eval('.js-setting-list a[data-action="otd-heading"]', a => getComputedStyle(a).pointerEvents)).toBe("none");

    await tab(page, "Внешний вид");
    expect(await page.$("#general_settings")).toBeNull();
    expect(await page.$eval(".js-setting-list li.selected", li => li.textContent.trim())).toBe("Внешний вид");
    // the tab's own section shows; the others are there for the search
    expect(await page.$$eval("#otd-settings .otd-settings-section", groups => groups.filter(g => g.getClientRects().length).map(g => g.dataset.section))).toEqual(["appearance"]);
    expect(await page.$$eval("#otd-settings .otd-settings-section > label", labels => labels.map(l => l.textContent))).toEqual(["Внешний вид", "Перевод", "Колонки", "Твиты", "Медиа", "Написание", "Прочее"]);
    expect(await switches(page)).toEqual([
        ["lightsOut", false], ["svgIcons", true], ["modernLook", true], ["grokTranslate", true], ["articlesTranslate", true], ["spacesTranslate", true], ["hideHomeReplies", true], ["groupNotifications", true],
        ["pauseOnHover", true], ["steadyColumns", true], ["fillGaps", true], ["selfThreads", true], ["threadsOldestFirst", true], ["skeletons", true], ["tabTitle", true], ["compactHeaders", true], ["loadAllReplies", true], ["instantReplies", true], ["articles", true], ["smartCashtags", true],
        ["cleanLinks", true], ["absoluteTime", false], ["redraft", true], ["muteFromMenu", true], ["rowMuteBlock", false],
        ["inlineVideo", true], ["downloadMedia", true], ["copyMediaLinks", true], ["pasteImages", false],
        ["emojiPicker", true], ["gifPicker", true], ["longPosts", true], ["blockServiceWorker", false], ["loadWatchdog", true],
    ]);
    expect(await page.textContent('#otd-settings [data-feature="groupNotifications"]')).toBe(" Группировать лайки, ретвиты и подписки в уведомлениях");
    // "what: how" is a title and a hint under it
    expect(await page.$$eval('#otd-settings [data-feature="selfThreads"] span', spans => spans.map(span => span.firstChild.textContent))).toEqual(["Треды автора", "Без «Replying to @автор», соседние твиты треда соединены линией"]);
    // "Appearance" has TweeXDeck's language first, TweetDeck's theme and column width, and density and font, with the
    // switches they go with
    expect(await page.$$eval('#otd-settings .otd-settings-section[data-section="appearance"] > div', rows => rows.map(row => row.dataset.feature || row.className.replace("otd-settings-select ", "")))).toEqual(
        ["otd-settings-ui-lang", "otd-settings-theme", "lightsOut", "otd-settings-width", "otd-settings-font-size", "otd-settings-density", "otd-settings-font", "svgIcons", "modernLook"]);
    expect(await page.textContent("#otd-settings .otd-settings-about")).toBe("TweeXDeck 5.1.0 · Релизы и обновления · Скопировать диагностику");
    expect(await page.getAttribute("#otd-settings .otd-settings-about a", "href")).toBe("https://github.com/Dezeter/TweeXDeck/releases");
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeHidden();
});

test("switches write the keys the features read, and say a reload is needed", async ({ page }) => {
    await openSettings(page, { storage: { OTDpasteImages: "0" } });

    await tab(page, "Колонки");
    await page.click('#otd-settings [data-feature="groupNotifications"] span');
    await tab(page, "Написание");
    await page.click('#otd-settings [data-feature="pasteImages"] i');
    expect(await page.evaluate(() => [localStorage.OTDgroupNotifications, localStorage.OTDpasteImages ?? null])).toEqual(["0", null]);
    expect(Object.fromEntries(await switches(page))).toMatchObject({ groupNotifications: false, pasteImages: true });
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeVisible();
    expect(await page.textContent("#otd-settings .otd-settings-note")).toBe("Применится после перезагрузки. Перезагрузить");

    // every switch, both ways, on its tab
    const features = (await switches(page)).map(([key]) => key);
    for(const key of features) {
        await tabOf(page, key);
        await page.click(`#otd-settings [data-feature="${key}"]`);
        await page.click(`#otd-settings [data-feature="${key}"]`);
    }
    expect(Object.fromEntries(await switches(page))).toMatchObject({ groupNotifications: false, pasteImages: true, grokTranslate: true });
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("OTD")).sort())).toEqual(["OTDgroupNotifications"]);
});

test("the language select writes OTDgrokTranslateLang and keeps a code it doesn't list", async ({ page }) => {
    await openSettings(page, { storage: { OTDgrokTranslateLang: "eo" } });
    await tab(page, "Перевод");
    const select = page.locator("#otd-settings .otd-settings-lang select");
    await expect(select).toHaveValue("eo");
    expect(await select.locator("option").first().textContent()).toBe("русский (язык браузера)");
    expect(await select.locator('option[value="de"]').textContent()).toBe("немецкий (de)");

    await select.selectOption("de");
    expect(await page.evaluate(() => localStorage.OTDgrokTranslateLang)).toBe("de");
    await select.selectOption("");
    expect(await page.evaluate(() => localStorage.OTDgrokTranslateLang ?? null)).toBeNull();
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeVisible();
});

test("TweeXDeck's language, first in \"Appearance\": the browser's or one picked, in OTDuiLang, after a reload", async ({ page }) => {
    await openSettings(page);
    await tab(page, "Внешний вид");
    const select = page.locator("#otd-settings .otd-settings-ui-lang select");
    expect(await page.evaluate(() => document.querySelector("#otd-settings .otd-settings-section .otd-settings-select")?.classList.contains("otd-settings-ui-lang"))).toBe(true);
    await expect(select).toHaveValue("");
    expect(await select.locator("option").allTextContents()).toEqual(["русский (язык браузера)", "Русский", "English"]);
    await select.selectOption("en");
    expect(await page.evaluate(() => localStorage.OTDuiLang)).toBe("en");
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeVisible();

    // the next time the page loads, TweeXDeck's tabs are in English in a Russian browser
    await openSettings(page, { storage: { OTDuiLang: "en" } });
    await tab(page, "Appearance");
    expect(await page.$$eval("#otd-settings .otd-settings-section > label", labels => labels.map(l => l.textContent))).toEqual(["Appearance", "Translation", "Columns", "Tweets", "Media", "Composing", "Other"]);
    await expect(page.locator("#otd-settings .otd-settings-ui-lang select")).toHaveValue("en");
    expect(await page.locator("#otd-settings .otd-settings-ui-lang .otd-settings-select-title").textContent()).toBe("TweeXDeck's language");
    // back to the browser's: the key goes
    await page.locator("#otd-settings .otd-settings-ui-lang select").selectOption("");
    expect(await page.evaluate(() => localStorage.OTDuiLang ?? null)).toBeNull();
});

test("the font select lists the fonts, writes OTDfont, and goes back to TweetDeck's own without the key", async ({ page }) => {
    await openSettings(page, { storage: { OTDfont: "gone" } });
    await tab(page, "Внешний вид");
    const select = page.locator("#otd-settings .otd-settings-font select");
    // a font that isn't there any more is the system one
    await expect(select).toHaveValue("");
    expect(await select.locator("option").allTextContents()).toEqual(["системный, как в TweetDeck", "Golos Text", "Onest", "Inter", "Manrope"]);

    await select.selectOption("onest");
    expect(await page.evaluate(() => localStorage.OTDfont)).toBe("onest");
    // fonts.js isn't loaded here, nothing would draw it before a reload
    await expect(page.locator("#otd-settings .otd-settings-note")).toBeVisible();
    await select.selectOption("");
    expect(await page.evaluate(() => localStorage.OTDfont ?? null)).toBeNull();
});

test("the search on a tab finds rows of every tab, in either language; a section's title finds all of it", async ({ page }) => {
    await openSettings(page);
    await tab(page, "Внешний вид");
    const shown = () => page.evaluate(() => [...document.querySelectorAll("#otd-settings [data-search]:not(.otd-settings-section)")].filter(row => row.getClientRects().length).map(row => row.dataset.feature || row.className.split(" ").pop()));
    const sections = () => page.evaluate(() => [...document.querySelectorAll("#otd-settings .otd-settings-section")].filter(group => group.getClientRects().length).map(group => group.dataset.section));
    const dividers = () => page.evaluate(() => [...document.querySelectorAll("#otd-settings .divider-bar")].filter(bar => bar.getClientRects().length).length);
    const search = page.locator("#otd-settings .otd-settings-search");
    await expect(search).toHaveAttribute("placeholder", "Поиск по настройкам");

    await search.fill("ТРЕД");
    expect(await shown()).toEqual(["selfThreads", "threadsOldestFirst"]);
    expect(await sections()).toEqual(["columns"]);
    expect(await dividers()).toBe(0);
    await search.fill("thread");
    expect(await shown()).toEqual(["selfThreads", "threadsOldestFirst"]);
    await search.fill("шрифт");
    // the icons replace TweetDeck's icon font, their hint says so
    expect(await shown()).toEqual(["otd-settings-font", "svgIcons"]);
    await search.fill("медиа");
    expect(await sections()).toEqual(["media"]);
    expect(await shown()).toEqual(["otd-settings-media", "inlineVideo", "downloadMedia", "copyMediaLinks"]);
    // the media select by its values too
    await search.fill("полос");
    expect(await shown()).toEqual(["otd-settings-media"]);
    await search.fill("перевод");
    expect(await sections()).toEqual(["translation"]);
    expect(await shown()).toEqual(["grokTranslate", "articlesTranslate", "spacesTranslate", "otd-settings-lang"]);
    await search.fill("плотн");
    expect(await sections()).toEqual(["appearance"]);
    await search.fill("ничего такого");
    expect(await sections()).toEqual([]);
    await expect(page.locator("#otd-settings .otd-settings-nothing")).toHaveText("Ничего не нашлось");
    await search.fill("");
    expect(await sections()).toEqual(["appearance"]);
    expect(await dividers()).toBe(0);
    await expect(page.locator("#otd-settings .otd-settings-nothing")).toBeHidden();
    // two sections found, a line between them
    await search.fill("шрифт");
    await search.fill("медиа");
    await search.fill("ссылк");
    expect((await sections()).length).toBeGreaterThan(1);
    expect(await dividers()).toBe((await sections()).length - 1);
});

test("what applies at once doesn't ask for a reload: TweetDeck's theme, column width and font size, and what a script listens to", async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => {
        window.__set = [];
        TD.settings.getTheme = () => "dark";
        TD.settings.getColumnWidth = () => "wide";
        TD.settings.setTheme = value => window.__set.push(`theme ${value}`);
        TD.settings.setColumnWidth = value => window.__set.push(`width ${value}`);
        TD.settings.getFontSize = () => "large";
        TD.settings.setFontSize = value => window.__set.push(`font size ${value}`);
        // as layout.js does
        OTD.onChange("OTDdensity", () => window.__set.push(`density ${localStorage.OTDdensity}`));
    });
    await tab(page, "Внешний вид");
    const note = page.locator("#otd-settings .otd-settings-note");
    const theme = page.locator("#otd-settings .otd-settings-theme select");
    await expect(theme).toHaveValue("dark");
    expect(await theme.locator("option").allTextContents()).toEqual(["светлая", "тёмная", "как в системе"]);
    await theme.selectOption("system");
    const width = page.locator("#otd-settings .otd-settings-width select");
    await expect(width).toHaveValue("wide");
    expect(await width.locator("option").allTextContents()).toEqual(["узкие", "средние", "широкие", "очень широкие", "по ширине окна (flex)"]);
    await width.selectOption("flex");
    const size = page.locator("#otd-settings .otd-settings-font-size select");
    await expect(size).toHaveValue("large");
    expect(await size.locator("option").allTextContents()).toEqual(["самый мелкий", "мелкий", "средний", "крупный", "самый крупный"]);
    await size.selectOption("small");
    const density = page.locator("#otd-settings .otd-settings-density select");
    await density.selectOption("comfortable");
    expect(await page.evaluate(() => window.__set)).toEqual(["theme system", "width flex", "font size small", "density comfortable"]);
    await expect(note).toBeHidden();

    // nothing listens to the switch here
    await page.click('#otd-settings [data-feature="lightsOut"]');
    await expect(note).toBeVisible();
});

test("a change in another tab reaches who listens", async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => {
        window.__changes = [];
        OTD.onChange("OTDdensity", () => window.__changes.push(localStorage.OTDdensity ?? null));
        window.dispatchEvent(new StorageEvent("storage", { key: "OTDdensity" }));
        localStorage.OTDdensity = "comfortable";
        window.dispatchEvent(new StorageEvent("storage", { key: "OTDdensity" }));
        window.dispatchEvent(new StorageEvent("storage", { key: "OTDfont" }));
    });
    expect(await page.evaluate(() => window.__changes)).toEqual([null, "comfortable"]);
});

test("the media select: Medium and Large photos in TweetDeck's strip or whole, in OTDmedia; the square is a column's Small", async ({ page }) => {
    await openSettings(page, { storage: { OTDmedia: "bogus" } });
    await tab(page, "Медиа");
    const select = page.locator('#otd-settings .otd-settings-section[data-section="media"] .otd-settings-media select');
    await expect(select).toHaveValue("");
    expect(await select.locator("option").allTextContents()).toEqual(["полосой, как в TweetDeck", "целиком"]);
    await select.selectOption("whole");
    expect(await page.evaluate(() => localStorage.OTDmedia)).toBe("whole");
    await select.selectOption("");
    expect(await page.evaluate(() => localStorage.OTDmedia ?? null)).toBeNull();
});

test("TweetDeck's General tab keeps its own settings, its theme, column width and font size are a link to \"Appearance\"", async ({ page }) => {
    await openSettings(page);
    await tab(page, "General");
    expect(await page.$$eval("#general_settings :is(.js-theme, .js-column-size, .js-font-size)", groups => groups.map(g => g.getClientRects().length))).toEqual([0, 0, 0]);
    await expect(page.locator("#general_settings .otd-general-note")).toHaveText("Тема, ширина колонок, размер текста и остальной вид — во вкладке «Внешний вид».");
    await page.click("#general_settings .otd-general-note a");
    expect(await page.$eval(".js-setting-list li.selected", li => li.textContent.trim())).toBe("Внешний вид");
    expect(await page.$eval("#otd-settings", fieldset => fieldset.dataset.section)).toBe("appearance");
    // its streaming and media switches stay
    await tab(page, "General");
    await expect(page.locator("#general_settings #streaming-updates")).toBeVisible();
});

test("TweetDeck's own column width and theme radios, under it, still take \"Super wide\", \"Flex\" and \"System\"", async ({ page }) => {
    await openSettings(page, { storage: { OTDthemeSystem: "1" } });
    await page.evaluate(() => {
        window.__set = [];
        TD.settings.getTheme = () => "dark";
        TD.settings.setColumnWidth = value => window.__set.push(value);
        TD.settings.setTheme = value => window.__set.push(value);
    });
    await tab(page, "General");
    expect(await page.$$eval('.js-column-size input[name="column-size"]', inputs => inputs.map(input => `${input.value}:${input.parentElement.textContent.trim()}`))).toEqual(["narrow:Narrow", "medium:Medium", "wide:Wide", "superwide:Super wide", "flex:Flex"]);
    expect(await page.$$eval('.js-theme input[name="theme"]', inputs => inputs.map(input => `${input.value}:${input.checked}`))).toEqual(["dark:false", "light:false", "system:true"]);
    await page.evaluate(() => ['.js-column-size input[value="superwide"]', '.js-column-size input[value="flex"]', '.js-theme input[value="light"]', '.js-theme input[value="system"]'].forEach(selector => document.querySelector(selector).click()));
    expect(await page.evaluate(() => window.__set)).toEqual(["superwide", "flex", "light", "system"]);
});

test("switching tabs leaves nothing of the other tab behind", async ({ page }) => {
    await openSettings(page);
    await tab(page, "Внешний вид");
    await tab(page, "General");
    expect(await page.$("#otd-settings")).toBeNull();
    expect(await page.$("#general_settings")).not.toBeNull();
    await tab(page, "Mute");
    await tab(page, "Колонки");
    await tab(page, "Колонки");
    await tab(page, "Твиты");
    expect(await page.$$eval("#otd-settings", sets => sets.map(set => set.dataset.section))).toEqual(["tweets"]);
    expect(await page.$("#global-settings > :not(#otd-settings)")).toBeNull();
});

test("the palette's \"TweeXDeck settings\" and the tab before 5.15.4 open \"Appearance\"; the dialog fits the window", async ({ page }) => {
    await openSettings(page);
    await page.evaluate(() => document.querySelector(".js-dismiss")?.click());
    await page.evaluate(() => new TD.components.GlobalSettings().switchTab("oldtweetdeck"));
    expect(await page.$eval("#otd-settings", fieldset => fieldset.dataset.section)).toBe("appearance");
    const box = await page.$eval("#settings-modal > .mdl", mdl => { const r = mdl.getBoundingClientRect(); return [r.left >= 0, r.top >= 0, r.right <= innerWidth, r.bottom <= innerHeight, Math.round(r.width), Math.round(r.height)]; });
    expect(box).toEqual([true, true, true, true, 968, 728]);
});

test("\"Copy diagnostics\" copies the load watchdog's report", async ({ page }) => {
    await page.addInitScript({ path: require("path").join(ROOT, "src/watchdog.js") });
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__copied = text; } } });
    });
    await openSettings(page);
    await tab(page, "Прочее");
    const link = page.locator("#otd-settings .otd-settings-diagnostics");
    await link.click();
    await expect(link).toHaveText("Скопировано");
    expect(await page.evaluate(() => window.__copied)).toMatch(/^TweeXDeck diagnostics\nVersion: 5\.1\.0\n/);
    await expect(link).toHaveText("Скопировать диагностику", { timeout: 5000 });
});

test.describe("in English", () => {
    test.use({ locale: "en-US" });
    test("labels follow the browser language", async ({ page }) => {
        await openSettings(page, { dark: true });
        await tab(page, "Appearance");
        expect(await page.$$eval("#otd-settings .otd-settings-section > label", labels => labels.map(l => l.textContent))).toEqual(["Appearance", "Translation", "Columns", "Tweets", "Media", "Composing", "Other"]);
        expect(await page.textContent('#otd-settings [data-feature="pasteImages"]')).toBe(" Paste images with Ctrl+V");
        expect(await page.locator("#otd-settings .otd-settings-lang select option").first().textContent()).toBe("English (browser language)");
    });
});
