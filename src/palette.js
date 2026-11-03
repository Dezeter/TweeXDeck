// A command palette on Ctrl+K (⌘K on a Mac) and on TweetDeck's own ";": one field to go to a column, write a
// tweet, add a column, search, open the settings, and switch the theme, column width, density, font and icons.
// The commands are TweetDeck's (window.cmd, the store of its own palette, which only X's staff ever got) with
// ours added to them; the field finds them by the letters typed, in order, as TweetDeck's does.
// Loaded by injection.js after otd-common.js.
(() => {
    const store = window.cmd;
    const $ = OTD.jQuery();
    if(!store?.query || !$) return;

    const L = OTD.label({
        ru: { placeholder: "Команда или колонка…", nothing: "Ничего не нашлось", title: "Палитра команд",
            tweet: "Новый твит", addColumn: "Добавить колонку", search: "Поиск", settings: "Настройки", ours: "Настройки TweeXDeck",
            shortcuts: "Горячие клавиши", reload: "Перезагрузить TweetDeck", diagnostics: "Скопировать диагностику",
            theme: "Тема", themes: { light: "светлая", dark: "тёмная", system: "как в системе" },
            width: "Ширина колонок", widths: { narrow: "узкие", medium: "средние", wide: "широкие", superwide: "очень широкие", flex: "по ширине окна (flex)" },
            density: "Плотность", densities: { "": "компактно", comfortable: "свободно" },
            font: "Шрифт", systemFont: "системный",
            media: "Фото в превью", medias: { "": "полосой", whole: "целиком" },
            on: "включить", off: "выключить" },
        en: { placeholder: "A command or column…", nothing: "Nothing found", title: "Command palette",
            tweet: "New tweet", addColumn: "Add column", search: "Search", settings: "Settings", ours: "TweeXDeck settings",
            shortcuts: "Keyboard shortcuts", reload: "Reload TweetDeck", diagnostics: "Copy diagnostics",
            theme: "Theme", themes: { light: "light", dark: "dark", system: "as the system" },
            width: "Column width", widths: { narrow: "narrow", medium: "medium", wide: "wide", superwide: "super wide", flex: "fit the window (flex)" },
            density: "Density", densities: { "": "compact", comfortable: "comfortable" },
            font: "Font", systemFont: "system",
            media: "Photos in previews", medias: { "": "strip", whole: "whole" },
            on: "turn on", off: "turn off" },
    });
    // TweetDeck's that ours stand in for, and its help page, long gone
    const HIDDEN = ["Show help", "Use dark theme", "Use light theme"];

    const trigger = event => $(document).trigger(event);
    const settings = () => window.TD?.settings;
    const theme = () => localStorage[OTD.THEME_SYSTEM_STORAGE] === "1" ? "system" : settings()?.getTheme?.();
    const title = feature => OTD.label(OTD.FEATURES.find(f => f.key === feature).label).split(": ")[0];
    // a switch of the TweeXDeck tab, both ways; only the way it isn't is offered
    const toggle = feature => [true, false].map(on => ({
        label: `${title(feature)}: ${on ? L.on : L.off}`,
        canApply: () => OTD.isOn(feature) !== on,
        apply: () => OTD.setOn(feature, on),
    }));
    const choice = (label, values, names, current, set) => values.map(value => ({
        label: `${label}: ${names[value] ?? value}`,
        canApply: () => current() !== value,
        apply: () => set(value),
    }));

    const OURS = new Set([
        { label: L.tweet, shortcut: { key: "N" }, apply: () => trigger("uiComposeTweet") },
        { label: L.addColumn, shortcut: { key: "A" }, apply: () => trigger("uiShowAddColumn") },
        { label: L.search, shortcut: { key: "S" }, apply: () => trigger("uiAppSearchFocus") },
        { label: L.settings, apply: () => new TD.components.GlobalSettings() },
        { label: L.ours, apply: () => new TD.components.GlobalSettings().switchTab("otd-appearance") },
        { label: L.shortcuts, shortcut: { key: "?" }, apply: () => trigger("uiShowKeyboardShortcutList") },
        ...choice(L.theme, ["light", "dark", "system"], L.themes, theme, value => settings().setTheme(value)),
        ...toggle("lightsOut"),
        ...choice(L.width, settings()?.COLUMN_WIDTH_VALUES || ["narrow", "medium", "wide"], L.widths, () => settings()?.getColumnWidth?.(), value => settings().setColumnWidth(value)),
        ...choice(L.density, ["", "comfortable"], L.densities, () => localStorage[OTD.DENSITY_STORAGE] || "", value => OTD.setValue(OTD.DENSITY_STORAGE, value)),
        ...choice(L.font, ["", ...OTD.FONTS.map(f => f.key)], { "": L.systemFont, ...Object.fromEntries(OTD.FONTS.map(f => [f.key, f.name])) },
            () => localStorage[OTD.FONT_STORAGE] || "", value => OTD.setValue(OTD.FONT_STORAGE, value)),
        ...choice(L.media, ["", "whole"], L.medias, () => localStorage[OTD.MEDIA_STORAGE] === "whole" ? "whole" : "",
            value => OTD.setValue(OTD.MEDIA_STORAGE, value)),
        ...toggle("svgIcons"),
        ...toggle("modernLook"),
        { label: L.diagnostics, apply: copyDiagnostics },
        { label: L.reload, apply: () => location.reload() },
    ]);
    store.makeCommandBag().add([...OURS]);

    // the load watchdog's report (watchdog.js), as the settings tab copies it
    function copyDiagnostics() {
        let report = "";
        const take = e => { report = e.detail; };
        document.addEventListener("otd-diagnostic-report", take);
        document.dispatchEvent(new CustomEvent("otd-diagnostic-request"));
        document.removeEventListener("otd-diagnostic-report", take);
        if(report) navigator.clipboard?.writeText(report).then(() => OTD.notify(L.diagnostics), () => {});
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text !== undefined) node.textContent = text;
        return node;
    }

    let palette = null;
    function open() {
        if(palette) return palette.input.focus();
        const back = document.activeElement;
        const overlay = el("div", "otd-palette-overlay");
        // the id puts its styles over TweetDeck's html.dark ones for lists and fields
        overlay.id = "otd-palette";
        const dialog = el("div", "otd-palette");
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", L.title);
        const input = el("input", "otd-palette-input");
        Object.assign(input, { type: "text", placeholder: L.placeholder, spellcheck: false, autocomplete: "off" });
        input.setAttribute("role", "combobox");
        input.setAttribute("aria-expanded", "true");
        input.setAttribute("aria-controls", "otd-palette-list");
        input.setAttribute("aria-autocomplete", "list");
        const list = el("ul", "otd-palette-list");
        list.id = "otd-palette-list";
        list.setAttribute("role", "listbox");
        dialog.append(input, list);
        overlay.append(dialog);
        document.body.append(overlay);
        palette = { overlay, input, list, back, results: [], selection: 0 };

        const show = () => {
            // what has the typed text as it is comes first, then the rest of the letters-in-order matches
            const query = input.value.trim().toLowerCase();
            // and ours before TweetDeck's, which are in English
            const rank = result => {
                const label = result.original.label.toLowerCase();
                return (label.startsWith(query) ? 0 : label.includes(query) ? 2 : 4) + (OURS.has(result.original) ? 0 : 1);
            };
            palette.results = store.query(input.value.trim()).filter(result => !HIDDEN.includes(result.original.label))
                .map((result, i) => [rank(result), i, result]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , result]) => result);
            draw();
            select(0);
        };
        input.addEventListener("input", show);
        input.addEventListener("keydown", e => {
            const move = { ArrowDown: 1, ArrowUp: -1 }[e.key];
            if(move && palette.results.length) {
                select((palette.selection + move + palette.results.length) % palette.results.length);
            } else if(e.key === "Enter") {
                run(palette.selection);
            } else if(e.key === "Escape") {
                close(true);
            } else if(e.key !== "Tab") {
                return;
            }
            e.preventDefault();
        });
        // TweetDeck's own keys (n, a, s, j, k...) aren't for it while it's typed in
        for(const type of ["keydown", "keypress", "keyup"]) overlay.addEventListener(type, e => e.stopPropagation());
        overlay.addEventListener("mousedown", e => {
            if(e.target === overlay) close(true);
        });
        list.addEventListener("mousemove", e => {
            const item = e.target.closest("[data-index]");
            if(item && Number(item.dataset.index) !== palette.selection) select(Number(item.dataset.index), false);
        });
        list.addEventListener("click", e => {
            const item = e.target.closest("[data-index]");
            if(item) run(Number(item.dataset.index));
        });
        show();
        input.focus();
    }

    function draw() {
        const { list, results } = palette;
        list.replaceChildren(...results.map((result, i) => {
            const item = el("li", "otd-palette-item");
            item.id = `otd-palette-${i}`;
            item.dataset.index = i;
            item.setAttribute("role", "option");
            const text = el("span", "otd-palette-label");
            // the letters typed come between TweetDeck's delimiters
            result.string.split(store.MATCH_DELIMITER).forEach((part, j) => text.append(j % 2 ? el("b", null, part) : part));
            item.append(text);
            const shortcut = result.original.shortcut;
            if(shortcut) item.append(el("kbd", "otd-palette-key", [shortcut.modifier, shortcut.key].filter(Boolean).join(" ")));
            return item;
        }));
        if(!results.length) list.append(el("li", "otd-palette-nothing", L.nothing));
    }
    // the pointer selects too, without scrolling the list under it
    function select(index, scroll = true) {
        const { list, input, results } = palette;
        palette.selection = index;
        for(const item of list.querySelectorAll(".otd-palette-item")) {
            const on = Number(item.dataset.index) === index;
            item.classList.toggle("is-selected", on);
            item.setAttribute("aria-selected", String(on));
            if(on && scroll) item.scrollIntoView({ block: "nearest" });
        }
        input.setAttribute("aria-activedescendant", results.length ? `otd-palette-${index}` : "");
    }

    function close(restoreFocus) {
        if(!palette) return;
        const { overlay, back } = palette;
        palette = null;
        overlay.remove();
        if(restoreFocus && back?.isConnected) back.focus();
    }

    function run(index) {
        const command = palette?.results[index]?.original;
        if(!command) return;
        close(true);
        command.apply();
    }

    document.addEventListener("keydown", e => {
        if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyK") {
            e.preventDefault();
            if(palette) close(true);
            else open();
        }
    }, true);
    // TweetDeck's ";", which opens nothing without its staff flag
    $(document).on("uiShowCommandPalette", open);

    OTD.addStyle(`
        #otd-palette { position: fixed; inset: 0; z-index: 10000; display: flex; justify-content: center; align-items: flex-start; padding: 12vh 16px 16px; background: rgba(15, 20, 25, .4); }
        #otd-palette .otd-palette { --bg: #fff; --text: #0f1419; --mute: #536471; --line: #cfd9de; --pick: #e8f5fd; --mark: #1570c4;
            box-sizing: border-box; width: 100%; max-width: 560px; max-height: 70vh; display: flex; flex-direction: column; overflow: hidden;
            background: var(--bg); color: var(--text); border-radius: 12px; box-shadow: 0 12px 40px rgba(0, 0, 0, .3); font-size: 14px; }
        html.dark #otd-palette .otd-palette { --bg: var(--otd-raised-solid); --text: var(--otd-text); --mute: var(--otd-text-2); --line: var(--otd-line); --pick: var(--otd-raised-hover); --mark: var(--otd-accent); }
        #otd-palette .otd-palette-input { box-sizing: border-box; width: 100%; height: auto; margin: 0; padding: 14px 16px; border: 0 !important; border-bottom: 1px solid var(--line) !important; border-radius: 0;
            background: transparent !important; color: var(--text) !important; font-size: 16px; box-shadow: none !important; outline: none; }
        #otd-palette .otd-palette-input::placeholder { color: var(--mute); }
        #otd-palette .otd-palette-list { margin: 0; padding: 6px; list-style: none; overflow-y: auto; }
        #otd-palette .otd-palette-item { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer; line-height: 1.35; }
        #otd-palette .otd-palette-item.is-selected { background: var(--pick); }
        #otd-palette .otd-palette-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #otd-palette .otd-palette-label b { color: var(--mark); font-weight: 700; }
        #otd-palette .otd-palette-key { flex: none; padding: 1px 6px; border: 1px solid var(--line); border-radius: 4px; color: var(--mute); font: 12px/1.4 inherit; }
        #otd-palette .otd-palette-nothing { padding: 10px; color: var(--mute); }
    `);
})();
