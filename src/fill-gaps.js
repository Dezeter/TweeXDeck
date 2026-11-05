// No "Show more" in columns: TweetDeck puts a gap where what it loaded above didn't reach the tweets it had, a "Show
// more" to click for the rest. Through X's GraphQL, which doesn't take TweetDeck's from-to ranges, it often hides
// nothing. Here a gap loads by itself as soon as it's there, the way a click on it does (TweetDeck's own fillGap),
// in its place: what comes goes where the gap was, steady-columns.js keeps what's on the screen where it is, and a gap
// that brings nothing is gone, as TweetDeck has it. A gap is never shown. More than five pages in a row in a column
// within a minute, as after a laptop's sleep, and the gap is let go instead, so as not to load hundreds of pages; one
// still there 20 s after it was asked for, its page not come, goes too. Switch "fillGaps", live.
// Loaded by injection.js after steady-columns.js.
(() => {
    const Column = window.TD?.vo?.Column;
    if(!Column?.prototype?.extractChirpsWithGap || !Column.prototype.fillGap || !window.TD.services?.GapChirp) return;

    const MAX_IN_A_ROW = 5;
    const ROW_FOR = 60 * 1000;
    const GIVE_UP_AFTER = 20 * 1000;

    OTD.htmlClassWhileOn("fillGaps", "otd-fill-gaps");
    OTD.addStyle(`
        html.otd-fill-gaps .js-chirp-container > .gap-chirp, html.otd-fill-gaps .js-chirp-container .js-stream-item.gap-chirp { display: none !important; }
    `);

    // TweetDeck makes a gap here, for what it loaded above and for what a gap's own page brought
    const extract = Column.prototype.extractChirpsWithGap;
    Column.prototype.extractChirpsWithGap = function() {
        const chirps = extract.apply(this, arguments);
        if(!OTD.isOn("fillGaps")) return chirps;
        const gap = Array.isArray(chirps) ? chirps.find(chirp => chirp instanceof TD.services.GapChirp) : null;
        if(gap) fillSoon(this, gap);
        // a page that left no gap ends the row
        else this.otdGaps = null;
        return chirps;
    };

    // once TweetDeck has drawn it, as a click would
    function fillSoon(column, gap) {
        const now = Date.now();
        const row = column.otdGaps && now - column.otdGaps.at < ROW_FOR ? column.otdGaps.count + 1 : 1;
        column.otdGaps = { count: row, at: now };
        setTimeout(() => {
            if(!column.findChirp?.(gap.id)) return;
            if(row > MAX_IN_A_ROW) {
                column.removeChirp(gap);
                return;
            }
            try {
                column.fillGap(gap.id);
            } catch(e) {
                console.warn("[otd-gaps]", e);
            }
            // its page not come: let go of
            setTimeout(() => {
                if(column.findChirp?.(gap.id)) column.removeChirp(gap);
            }, GIVE_UP_AFTER);
        }, 200);
    }
})();
