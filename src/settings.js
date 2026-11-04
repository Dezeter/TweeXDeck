// TweeXDeck's tabs in TweetDeck's settings, under a "TweeXDeck" heading after TweetDeck's own: one for each section
// of OTD.FEATURES, a switch for every feature in it, the language to translate to under "Translation", and under
// "Appearance" TweeXDeck's own language first, then all of the look: TweetDeck's theme, column width and font size
// with ours, Lights out, density, font, icons and readability. TweetDeck's General tab keeps its other settings and points to "Appearance" for those.
// A search field on each tab finds a setting in any of them. A label "What: how" shows as a title with a hint
// under it. Switches write the localStorage keys the features read; what a script listens to (OTD.onChange)
// applies at once, the rest after a reload, and the tab says so. The dialog is larger than TweetDeck's, up to the
// window. Loaded by injection.js after otd-common.js.
(() => {
    const GlobalSettings = window.TD?.components?.GlobalSettings;
    if(!GlobalSettings) return;

    // a section's tab is "otd-<section>"; the heading over them is a tab that opens nothing
    const TAB = "otd-";
    const HEADING = "otd-heading";
    const SECTIONS = [...new Set(OTD.FEATURES.map(f => f.section))];
    const RELEASES = "https://github.com/Dezeter/TweeXDeck/releases";
    const LABELS = {
        ru: { lang: "Переводить на", browser: "язык браузера", uiLang: "Язык TweeXDeck", uiLangSearch: "язык интерфейса", font: "Шрифт", systemFont: "системный, как в TweetDeck", reload: "Применится после перезагрузки.", reloadNow: "Перезагрузить", releases: "Релизы и обновления",
            diagnostics: "Скопировать диагностику", copied: "Скопировано", search: "Поиск по настройкам", nothing: "Ничего не нашлось",
            theme: "Тема", themes: { light: "светлая", dark: "тёмная", system: "как в системе" },
            columnWidth: "Ширина колонок", widths: { narrow: "узкие", medium: "средние", wide: "широкие", superwide: "очень широкие", flex: "по ширине окна (flex)" },
            fontSize: "Размер текста", fontSizes: { smallest: "самый мелкий", small: "мелкий", medium: "средний", large: "крупный", largest: "самый крупный" },
            general: ["Тема, ширина колонок, размер текста и остальной вид — во вкладке ", "«Внешний вид»", "."],
            density: "Плотность", densities: { "": "компактно, как в TweetDeck", comfortable: "свободно: больше воздуха, текст от 15 px" },
            media: "Фото в превью Medium и Large", medias: { "": "полосой, как в TweetDeck", whole: "целиком" },
            sections: { appearance: "Внешний вид", translation: "Перевод", columns: "Колонки", tweets: "Твиты", media: "Медиа", compose: "Написание", other: "Прочее" } },
        en: { lang: "Translate to", browser: "browser language", uiLang: "TweeXDeck's language", uiLangSearch: "interface language", font: "Font", systemFont: "system, as in TweetDeck", reload: "Applies after a reload.", reloadNow: "Reload now", releases: "Releases and updates",
            diagnostics: "Copy diagnostics", copied: "Copied", search: "Search settings", nothing: "Nothing found",
            theme: "Theme", themes: { light: "light", dark: "dark", system: "as the system" },
            columnWidth: "Column width", widths: { narrow: "narrow", medium: "medium", wide: "wide", superwide: "super wide", flex: "fit the window (flex)" },
            fontSize: "Text size", fontSizes: { smallest: "smallest", small: "small", medium: "medium", large: "large", largest: "largest" },
            general: ["The theme, column width, text size and the rest of the look are in the ", "\"Appearance\"", " tab."],
            density: "Density", densities: { "": "compact, as in TweetDeck", comfortable: "comfortable: more room, text from 15px" },
            media: "Photos in Medium and Large previews", medias: { "": "a strip, as in TweetDeck", whole: "whole" },
            sections: { appearance: "Appearance", translation: "Translation", columns: "Columns", tweets: "Tweets", media: "Media", compose: "Composing", other: "Other" } },
    };
    const LABEL = OTD.label(LABELS);
    const LANGUAGES = ["ru", "en", "uk", "be", "kk", "de", "fr", "es", "it", "pt", "pl", "cs", "nl", "sv", "fi", "tr", "ar", "fa", "he", "hi", "id", "vi", "th", "ja", "ko", "zh"];

    let names;
    try {
        names = new Intl.DisplayNames([OTD.UI_LANG], { type: "language" });
    } catch(e) {
        names = { of: code => code };
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }

    // "What: how" as the title and a hint under it, the hint from a capital letter
    function labelParts(text) {
        const at = text.indexOf(": ");
        if(at < 0) return [text, ""];
        const hint = text.slice(at + 2);
        return [text.slice(0, at), hint[0].toUpperCase() + hint.slice(1)];
    }
    // what the search finds a row by: its labels in every language
    const searchText = (...texts) => texts.join(" ").toLowerCase();

    // TweetDeck's switch: an icon and a label, the whole row toggles
    function toggleRow(feature, changed) {
        const row = el("div", "otd-setting");
        row.dataset.feature = feature.key;
        row.dataset.search = searchText(...Object.values(feature.label));
        const icon = el("i", "icon icon-small color-twitter-blue is-actionable align-top");
        const show = () => {
            icon.classList.toggle("icon-toggle-on", OTD.isOn(feature.key));
            icon.classList.toggle("icon-toggle-off", !OTD.isOn(feature.key));
        };
        show();
        const [title, hint] = labelParts(OTD.label(feature.label));
        const text = el("span", "margin-l--4", title);
        if(hint) text.append(el("span", "otd-setting-hint txt-mute", hint));
        // TweetDeck's template has a space between the switch and its label
        row.append(icon, " ", text);
        row.addEventListener("click", () => {
            OTD.setOn(feature.key, !OTD.isOn(feature.key));
            show();
            changed(feature.storage);
        });
        return row;
    }

    // a select with its label; options are [value, text], set(value) writes it, storage is the key it changes
    function selectRow(className, label, options, value, set, search, changed, storage) {
        const row = el("div", `otd-settings-select ${className}`);
        row.dataset.search = searchText(label, ...search);
        const labelEl = el("label");
        const select = document.createElement("select");
        select.append(...options.map(([value, text]) => new Option(text, value)));
        select.value = value;
        select.addEventListener("change", () => {
            set(select.value);
            changed(storage);
        });
        labelEl.append(el("span", "otd-settings-select-title", label), select);
        row.append(labelEl);
        return row;
    }

    // the translations read it when the page loads
    function languageRow(changed) {
        const browserLang = (navigator.language || "en").split("-")[0].toLowerCase();
        const options = [["", `${names.of(browserLang) || browserLang} (${LABEL.browser})`], ...LANGUAGES.map(code => [code, `${names.of(code) || code} (${code})`])];
        const current = localStorage[OTD.LANG_STORAGE] || "";
        // a code typed into the console that isn't in the list
        if(current && !LANGUAGES.includes(current)) options.push([current, current]);
        return selectRow("otd-settings-lang", LABEL.lang, options, current, value => OTD.setValue(OTD.LANG_STORAGE, value),
            [LABELS.ru.lang, LABELS.en.lang], changed, OTD.LANG_STORAGE);
    }

    // the language of TweeXDeck's own texts, read as the page loads (otd-common.js): the browser's without the key;
    // each language by its own name
    const UI_LANG_NAMES = { ru: "Русский", en: "English" };
    const uiLangRow = changed => selectRow("otd-settings-ui-lang", LABEL.uiLang,
        [["", `${names.of(OTD.BROWSER_LANG) || OTD.BROWSER_LANG} (${LABEL.browser})`], ...OTD.UI_LANGS.map(code => [code, UI_LANG_NAMES[code] || code])],
        OTD.UI_LANGS.includes(localStorage[OTD.UI_LANG_STORAGE]) ? localStorage[OTD.UI_LANG_STORAGE] : "",
        value => OTD.setValue(OTD.UI_LANG_STORAGE, value),
        [LABELS.ru.uiLang, LABELS.en.uiLang, LABELS.ru.uiLangSearch, LABELS.en.uiLangSearch, ...Object.values(UI_LANG_NAMES)], changed, OTD.UI_LANG_STORAGE);

    // fonts.js draws the one picked here; TweetDeck's own without the key
    const fontRow = changed => selectRow("otd-settings-font", LABEL.font, [["", LABEL.systemFont], ...OTD.FONTS.map(font => [font.key, font.name])],
        OTD.FONTS.some(font => font.key === localStorage[OTD.FONT_STORAGE]) ? localStorage[OTD.FONT_STORAGE] : "",
        value => OTD.setValue(OTD.FONT_STORAGE, value), [LABELS.ru.font, LABELS.en.font], changed, OTD.FONT_STORAGE);

    // TweetDeck's own settings, which it applies at once; "system" is theme.js's
    const themeRow = changed => selectRow("otd-settings-theme", LABEL.theme, ["light", "dark", "system"].map(theme => [theme, LABEL.themes[theme]]),
        localStorage[OTD.THEME_SYSTEM_STORAGE] === "1" ? "system" : TD.settings.getTheme(), value => TD.settings.setTheme(value),
        [LABELS.ru.theme, LABELS.en.theme, "dark", "light", "system"], changed, null);
    const widthRow = changed => selectRow("otd-settings-width", LABEL.columnWidth, (TD.settings.COLUMN_WIDTH_VALUES || ["narrow", "medium", "wide"]).map(width => [width, LABEL.widths[width] || width]),
        TD.settings.getColumnWidth(), value => TD.settings.setColumnWidth(value), [LABELS.ru.columnWidth, LABELS.en.columnWidth], changed, null);
    const fontSizeRow = changed => selectRow("otd-settings-font-size", LABEL.fontSize, ["smallest", "small", "medium", "large", "largest"].map(size => [size, LABEL.fontSizes[size]]),
        TD.settings.getFontSize?.() || "medium", value => TD.settings.setFontSize(value), [LABELS.ru.fontSize, LABELS.en.fontSize], changed, null);
    // layout.js
    const densityRow = changed => selectRow("otd-settings-density", LABEL.density, ["", "comfortable"].map(density => [density, LABEL.densities[density]]),
        localStorage[OTD.DENSITY_STORAGE] === "comfortable" ? "comfortable" : "", value => OTD.setValue(OTD.DENSITY_STORAGE, value),
        [LABELS.ru.density, LABELS.en.density], changed, OTD.DENSITY_STORAGE);

    // media-layout.js
    const mediaRow = changed => selectRow("otd-settings-media", LABEL.media, ["", "whole"].map(media => [media, LABEL.medias[media]]),
        localStorage[OTD.MEDIA_STORAGE] === "whole" ? "whole" : "", value => OTD.setValue(OTD.MEDIA_STORAGE, value),
        [LABELS.ru.media, LABELS.en.media, ...Object.values(LABELS.ru.medias), ...Object.values(LABELS.en.medias)], changed, OTD.MEDIA_STORAGE);

    // the rows of a section: its features' switches, and under "Appearance" the selects before the switch they go with
    function sectionRows(section, changed) {
        const rows = [];
        const before = {
            appearance: { lightsOut: [uiLangRow, themeRow], svgIcons: [widthRow, fontSizeRow, densityRow, fontRow] },
            media: { inlineVideo: [mediaRow] },
        }[section] || {};
        for(const feature of OTD.FEATURES.filter(f => f.section === section)) {
            for(const row of before[feature.key] || []) rows.push(row(changed));
            rows.push(toggleRow(feature, changed));
        }
        // the reader's translate button uses the language too, so it stays with translation off
        if(section === "translation") rows.push(languageRow(changed));
        return rows;
    }

    // hides the rows the query isn't in, and the sections left empty; a section's title finds all its rows. Without a
    // query the tab's own section shows, with one every section it finds
    function filter(fieldset, query) {
        query = query.trim().toLowerCase();
        fieldset.classList.toggle("is-searching", !!query);
        let first = true;
        let found = false;
        for(const group of fieldset.querySelectorAll(".otd-settings-section")) {
            const all = !query || group.dataset.search.includes(query);
            let any = false;
            for(const row of group.querySelectorAll("[data-search]")) {
                row.hidden = !all && !row.dataset.search.includes(query);
                any ||= !row.hidden;
            }
            group.hidden = !any || (!query && group.dataset.section !== fieldset.dataset.section);
            const divider = group.previousElementSibling;
            if(divider?.classList.contains("divider-bar")) divider.hidden = group.hidden || first;
            if(any) first = false;
            found ||= any;
        }
        fieldset.querySelector(".otd-settings-nothing").hidden = found;
    }

    function build(tab) {
        const fieldset = el("fieldset");
        fieldset.id = "otd-settings";
        fieldset.dataset.section = tab;
        fieldset.append(el("legend", null, "TweeXDeck"));

        const search = el("input", "otd-settings-search");
        search.type = "search";
        search.placeholder = LABEL.search;
        search.setAttribute("aria-label", LABEL.search);
        search.addEventListener("input", () => filter(fieldset, search.value));
        fieldset.append(search);

        const note = el("div", "otd-settings-note txt-mute is-hidden", `${LABEL.reload} `);
        const reload = el("a", null, LABEL.reloadNow);
        reload.href = "#";
        reload.addEventListener("click", e => {
            e.preventDefault();
            location.reload();
        });
        note.append(reload);
        // TweetDeck's own settings (no key) and what a script listens to apply without a reload
        const changed = storage => {
            if(storage && !OTD.isLive(storage)) note.classList.remove("is-hidden");
        };

        SECTIONS.forEach((section, i) => {
            if(i) fieldset.append(el("div", "divider-bar"));
            const group = el("div", "control-group otd-settings-section");
            group.dataset.section = section;
            group.dataset.search = searchText(LABELS.ru.sections[section], LABELS.en.sections[section]);
            const title = el("label", "txt-uppercase touch-larger-label");
            title.append(el("b", null, LABEL.sections[section]));
            group.append(title, ...sectionRows(section, changed));
            fieldset.append(group);
        });
        const nothing = el("div", "otd-settings-nothing txt-mute", LABEL.nothing);
        fieldset.append(nothing);
        filter(fieldset, "");

        const about = el("div", "otd-settings-about txt-mute", `TweeXDeck${OTD.VERSION ? ` ${OTD.VERSION}` : ""} · `);
        const releases = el("a", null, LABEL.releases);
        releases.href = RELEASES;
        releases.target = "_blank";
        releases.rel = "noopener noreferrer";
        about.append(releases);
        // the load watchdog's report (watchdog.js), for an issue about something that doesn't work
        const diagnostics = el("a", "otd-settings-diagnostics", LABEL.diagnostics);
        diagnostics.href = "#";
        diagnostics.addEventListener("click", async e => {
            e.preventDefault();
            let report = "";
            const take = e => { report = e.detail; };
            document.addEventListener("otd-diagnostic-report", take);
            document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
            document.removeEventListener("otd-diagnostic-report", take);
            if(!report) return;
            try {
                await navigator.clipboard.writeText(report);
            } catch(err) {
                return;
            }
            diagnostics.textContent = LABEL.copied;
            setTimeout(() => { diagnostics.textContent = LABEL.diagnostics; }, 2000);
        });
        about.append(" · ", diagnostics);
        fieldset.append(note, about);
        return fieldset;
    }

    // in General, where its theme, column width and font size were: the way to "Appearance"
    function pointToAppearance(settings) {
        const general = document.getElementById("general_settings");
        if(!general || general.querySelector(".otd-general-note")) return;
        const [before, link, after] = LABEL.general;
        const note = el("div", "otd-general-note txt-mute", before);
        const open = el("a", null, link);
        open.href = "#";
        open.addEventListener("click", e => {
            e.preventDefault();
            settings.switchTab(`${TAB}appearance`);
        });
        note.append(open, after);
        (general.querySelector(".control-group") || general).append(note);
    }

    const proto = GlobalSettings.prototype;
    const getInfo = proto.getInfo;
    proto.getInfo = function() {
        const info = getInfo.apply(this, arguments);
        info.tabs.push({ title: "TweeXDeck", action: HEADING }, ...SECTIONS.map(section => ({ title: LABEL.sections[section], action: `${TAB}${section}` })));
        return info;
    };
    // TweetDeck's switchTab renders its own tabs into the form; ours are drawn after it switched
    const switchTab = proto.switchTab;
    proto.switchTab = function(tab) {
        if(tab === HEADING) return;
        // "oldtweetdeck", the one tab before 5.15.4
        if(tab === "oldtweetdeck") tab = `${TAB}appearance`;
        const form = document.getElementById("global-settings");
        const ours = name => typeof name === "string" && name.startsWith(TAB);
        if(ours(this.currentTabName) && tab !== this.currentTabName) form?.replaceChildren();
        switchTab.call(this, tab, ...[...arguments].slice(1));
        document.getElementById("settings-modal")?.classList.add("otd-settings-modal");
        if(ours(tab) && form && form.querySelector("#otd-settings")?.dataset.section !== tab.slice(TAB.length)) {
            // its teardown event belongs to the tab it already tore down
            this.teardownEvent = null;
            form.replaceChildren(build(tab.slice(TAB.length)));
        }
        if(tab === "general") pointToAppearance(this);
    };

    OTD.addStyle(`
        /* the dialog up to 1000 by 760, in the window; the tabs' list and the tab beside it fill it */
        #settings-modal.otd-settings-modal > .mdl { width: min(1000px, calc(100vw - 32px)); height: min(760px, calc(100vh - 32px)); }
        /* under the header to the bottom: the tabs, the tab, the "Done" button */
        #settings-modal.otd-settings-modal > .mdl > .mdl-inner { display: flex; flex-direction: column; bottom: 0; }
        #settings-modal.otd-settings-modal .mdl-content { display: flex; flex: 1; min-height: 0; height: auto; }
        #settings-modal.otd-settings-modal .mdl-column-sml { flex: none; width: 220px; height: auto; }
        #settings-modal.otd-settings-modal .mdl-column-lrg { flex: 1; width: auto; min-width: 0; height: auto; }
        #settings-modal.otd-settings-modal .mdl-content .l-column-scrollv { height: 100%; }
        #settings-modal.otd-settings-modal .mdl-col-settings > form { max-width: 640px; }
        /* "TweeXDeck" over its tabs */
        #settings-modal .js-setting-list a[data-action="${HEADING}"] { pointer-events: none; padding-top: 18px; padding-bottom: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; opacity: .65; }
        #settings-modal .js-setting-list a[data-action="${HEADING}"] .chev-right { display: none; }
        /* TweetDeck's theme, column width and font size are under "Appearance" */
        #general_settings .divider-bar, #general_settings .js-theme, #general_settings .js-column-size, #general_settings .js-font-size { display: none; }
        #general_settings .otd-general-note { margin-top: 14px; font-size: 13px; }
        #general_settings .otd-general-note a { color: var(--otd-accent, #1da1f2); }
        /* a tab's own section, or every section the search finds */
        #otd-settings:not(.is-searching) .divider-bar { display: none; }
        #otd-settings .otd-settings-section > label { display: block; margin-bottom: 4px; }
        /* a long label wraps next to its switch, not under it */
        #otd-settings .otd-setting { display: flex; align-items: flex-start; margin-bottom: 6px; cursor: pointer; }
        /* in a flex row the space after the switch is gone, the margin stands in for it */
        #otd-settings .otd-setting > i { flex: none; margin-right: 4px; }
        #otd-settings .otd-setting > span { flex: 1; }
        #otd-settings .otd-setting-hint { display: block; margin-top: 1px; font-size: 12px; line-height: 1.35; }
        #otd-settings [hidden] { display: none !important; }
        #otd-settings a { color: var(--otd-accent, #1da1f2); }
        #otd-settings .otd-settings-search { box-sizing: border-box; width: 100%; margin: 0 0 14px; }
        #otd-settings .otd-settings-select { margin: 0 0 8px; }
        #otd-settings .otd-settings-lang { margin: 6px 0 0 30px; }
        #otd-settings .otd-settings-select-title { display: inline-block; min-width: 128px; }
        #otd-settings .otd-settings-lang .otd-settings-select-title { min-width: 98px; }
        #otd-settings .otd-settings-select select { max-width: 260px; }
        #otd-settings .otd-settings-nothing { margin: 4px 0 10px; }
        #otd-settings .otd-settings-note, #otd-settings .otd-settings-about { margin-top: 10px; font-size: 12px; }
    `);
})();
