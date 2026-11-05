// No "Show more" in columns (fill-gaps.js): a gap TweetDeck makes loads by itself, as a click on it does, and is never
// shown; more than five pages in a row it's let go of, and so is one whose page doesn't come.
const { test, expect } = require("@playwright/test");
const { openPage, addTweetDeck, addScripts } = require("./helpers");

// TweetDeck with fill-gaps.js; a column of TweetDeck's own gap code with what it's asked to do written down: the
// gaps' pages asked for, the gaps taken away
async function open(page, storage) {
    await page.clock.install();
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await addScripts(page, "src/otd-common.js", "src/fill-gaps.js");
    await page.evaluate(() => {
        window.__column = Object.assign(Object.create(TD.vo.Column.prototype), {
            gaps: new Map(), asked: [], removed: [],
            findChirp(id) { return this.gaps.get(id) || null; },
            fillGap(id) { this.asked.push(id); },
            removeChirp(chirp) { this.removed.push(chirp.id); this.gaps.delete(chirp.id); },
        });
        // what TweetDeck has, loading above or a gap's page: a gap where its page didn't reach, or none
        window.__page = remainder => {
            const chirps = __column.extractChirpsWithGap({ chirps: [{ sortIndex: { type: "id", value: 100 } }], remainderCursor: { interval: { empty: !remainder } }, possibleGapSize: 40 });
            const gap = chirps.find(chirp => chirp instanceof TD.services.GapChirp);
            if(gap) __column.gaps.set(gap.id, gap);
            return gap?.id || null;
        };
    });
}
const column = page => page.evaluate(() => ({ asked: __column.asked.length, removed: __column.removed.length, gaps: __column.gaps.size }));

test("a gap TweetDeck makes is filled at once, as a click on its \"Show more\" does; one that brings nothing is gone", async ({ page }) => {
    await open(page);
    const gap = await page.evaluate(() => __page(true));
    expect(gap).toMatch(/^gap_/);
    expect(await column(page)).toEqual({ asked: 0, removed: 0, gaps: 1 });
    await page.clock.runFor(250);
    expect(await page.evaluate(() => __column.asked)).toEqual([gap]);
    // its page came and left no gap: TweetDeck took the gap away, as it does
    await page.evaluate(id => { __column.gaps.delete(id); __page(false); }, gap);
    await page.clock.runFor(25000);
    expect(await column(page)).toEqual({ asked: 1, removed: 0, gaps: 0 });
});

test("more than five pages in a row: the gap is let go of; a page that doesn't come lets its gap go too", async ({ page }) => {
    await open(page);
    for(let i = 0; i < 5; i++) {
        await page.evaluate(() => {
            // a gap's page came with another gap after it
            for(const id of [...__column.gaps.keys()]) __column.gaps.delete(id);
            __page(true);
        });
        await page.clock.runFor(250);
    }
    expect(await column(page)).toEqual({ asked: 5, removed: 0, gaps: 1 });
    // the sixth in a row isn't asked for
    await page.evaluate(() => {
        for(const id of [...__column.gaps.keys()]) __column.gaps.delete(id);
        __page(true);
    });
    await page.clock.runFor(250);
    expect(await column(page)).toEqual({ asked: 5, removed: 1, gaps: 0 });

    // a minute on, a new row; its page never comes, and the gap goes 20 s later
    await page.clock.runFor(61000);
    await page.evaluate(() => __page(true));
    await page.clock.runFor(250);
    expect(await column(page)).toEqual({ asked: 6, removed: 1, gaps: 1 });
    await page.clock.runFor(20000);
    expect(await column(page)).toEqual({ asked: 6, removed: 2, gaps: 0 });
});

test("a gap isn't shown; switched off, TweetDeck's own \"Show more\" is back, asked for by a click", async ({ page }) => {
    await open(page);
    const shown = () => page.evaluate(() => {
        document.querySelector("#otd-gap-column")?.remove();
        document.body.insertAdjacentHTML("beforeend", '<section id="otd-gap-column" class="js-column column"><div class="js-column-scroller"><div class="js-chirp-container chirp-container"></div></div></section>');
        const gap = new TD.services.GapChirp({ interval: {} }, { sortIndex: { type: "id", value: 1 }, gapSize: 0 });
        document.querySelector("#otd-gap-column .js-chirp-container").insertAdjacentHTML("beforeend", gap.render());
        const item = document.querySelector("#otd-gap-column .gap-chirp");
        return { text: item.textContent.trim(), shown: item.getClientRects().length > 0 };
    });
    expect(await shown()).toEqual({ text: "Show more", shown: false });
    await page.evaluate(() => OTD.setOn("fillGaps", false));
    expect(await shown()).toEqual({ text: "Show more", shown: true });
    // and nothing asked for by itself
    await page.evaluate(() => __page(true));
    await page.clock.runFor(30000);
    expect(await column(page)).toEqual({ asked: 0, removed: 0, gaps: 1 });
});
