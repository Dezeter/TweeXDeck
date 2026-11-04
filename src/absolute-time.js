// Tweet times as a time and date ("14:05", "26 окт., 14:05", "26.10.2025") instead of "5m", in the
// browser's language. TweetDeck formats them through TD.util.prettyDate when it renders a tweet and every
// minute after, so this replaces that. Loaded by injection.js after otd-common.js. Switch "absoluteTime".
(() => {
    if(!OTD.isOn("absoluteTime")) return;
    const util = window.TD?.util;
    if(!util?.prettyDate) return;

    const locale = OTD.LOCALE;
    const today = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    const thisYear = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    // short: the time sits next to the author's name
    const earlier = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });

    const prettyDate = util.prettyDate;
    util.prettyDate = function(date) {
        const when = date instanceof Date ? date : new Date(date);
        if(isNaN(when)) return prettyDate.apply(this, arguments);
        const now = new Date();
        if(when.toDateString() === now.toDateString()) return today.format(when);
        if(when.getFullYear() === now.getFullYear()) return thisYear.format(when);
        return earlier.format(when);
    };
})();
