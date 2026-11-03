// TweetDeck's icons as SVG masks over their own color instead of its icon font, switchable without a reload
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { ROOT, openPage, addTweetDeck, addScripts } = require("./helpers");

const source = fs.readFileSync(path.join(ROOT, "src/icons.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "files/bundle.css"), "utf8");

async function open(page, storage) {
    await openPage(page, { storage });
    await addTweetDeck(page, { css: true });
    await page.evaluate(() => {
        document.body.insertAdjacentHTML("beforeend", `<div class="column">
            <i class="icon icon-reply" id="reply"></i>
            <span class="is-favorite"><i class="icon icon-heart-filled icon-favorite-toggle" id="liked"></i></span>
            <i class="icon icon-small-valigned icon-retweet-filled icon-retweet-color" id="retweeted"></i>
            <i class="icon icon-twitter-bird" id="bird"></i>
            <i class="icon icon-toggle-on" id="switch"></i>
        </div>`);
    });
    await addScripts(page, "src/otd-common.js", "src/icons.js");
}
const look = (page, id) => page.evaluate(id => {
    const el = document.getElementById(id);
    const before = getComputedStyle(el, "::before");
    const mask = before.maskImage || before.webkitMaskImage;
    return {
        content: before.content,
        mask: mask === "none" ? "none" : decodeURIComponent(mask).match(/fill='([^']+)' stroke='#000' stroke-width='([\d.]+)'/).slice(1).join(" "),
        // the mask is filled with the icon's color, so TweetDeck's colors stay
        color: before.backgroundColor === getComputedStyle(el).color,
        size: [Math.round(el.getBoundingClientRect().width), Math.round(before.width.replace("px", ""))],
    };
}, id);

test("icons are SVG in the icon's own color and size: outline, a liked heart filled, a retweet bolder", async ({ page }) => {
    await open(page);
    expect(await look(page, "reply")).toEqual({ content: '""', mask: "none 2", color: true, size: [20, 20] });
    expect(await look(page, "liked")).toMatchObject({ mask: "#000 2", color: true });
    expect(await page.$eval("#liked", el => getComputedStyle(el).color)).toBe("rgb(224, 36, 94)");
    expect(await look(page, "retweeted")).toMatchObject({ mask: "none 2.75", color: true });
    expect(await page.$eval("#retweeted", el => getComputedStyle(el).color)).toBe("rgb(23, 191, 99)");
});

test("icons without a shape keep TweetDeck's font: the bird, switches", async ({ page }) => {
    await open(page);
    for(const id of ["bird", "switch"]) {
        const icon = await look(page, id);
        expect(icon.content, id).not.toBe('""');
        expect(icon.mask, id).toBe("none");
    }
});

test("switched off, all of TweetDeck's font is back, and on again without a reload", async ({ page }) => {
    await open(page, { OTDsvgIcons: "0" });
    expect(await look(page, "reply")).toMatchObject({ content: '"\uF151"', mask: "none" });
    await page.evaluate(() => OTD.setOn("svgIcons", true));
    expect(await look(page, "reply")).toMatchObject({ content: '""', mask: "none 2" });
    await page.evaluate(() => OTD.setOn("svgIcons", false));
    expect(await look(page, "reply")).toMatchObject({ content: '"\uF151"', mask: "none" });
});

test("the verified badge is X's, grey as the other icons, in place of TweetDeck's blue picture; off, the picture again", async ({ page }) => {
    await open(page);
    const badge = () => page.evaluate(() => {
        document.querySelector("#badge") || document.querySelector(".column").insertAdjacentHTML("beforeend", '<b class="fullname">Alice</b><i class="js-show-tip sprite sprite-verified-mini" id="badge"></i>');
        const style = getComputedStyle(document.querySelector("#badge"));
        const mask = style.maskImage || style.webkitMaskImage;
        return { image: style.backgroundImage.startsWith("url") ? "picture" : style.backgroundImage, fill: style.backgroundColor, x: decodeURIComponent(mask).includes("M22.25 12"), size: style.width };
    });
    expect(await badge()).toEqual({ image: "none", fill: "rgb(83, 100, 113)", x: true, size: "16px" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    expect((await badge()).fill).toBe("rgb(136, 153, 166)");
    await page.evaluate(() => OTD.setOn("svgIcons", false));
    expect(await badge()).toMatchObject({ image: "picture", x: false });
});

test("every class with a shape is one of TweetDeck's icons or this extension's own, and every shape is used", () => {
    const icons = [...source.match(/const ICONS = \{([\s\S]*?)\};/)[1].matchAll(/"([\w-]+)": "([\w-]+)(?: \w+)?"/g)];
    const shapes = [...source.match(/const SHAPES = \{([\s\S]*?)\};/)[1].matchAll(/^\s+"([\w-]+)":/gm)].map(m => m[1]);
    expect(icons.length).toBeGreaterThan(60);
    // this extension's own (otd-…): For you's and Spaces', column types of its own (for-you.js)
    for(const [, name] of icons) if(!name.startsWith("otd-")) expect(css, `.icon-${name}`).toContain(`.icon-${name}:before {`);
    expect(icons.map(m => m[1]).filter(name => name.startsWith("otd-"))).toEqual(["otd-foryou", "otd-spaces"]);
    expect([...new Set(icons.map(m => m[2]))].sort()).toEqual([...shapes].sort());
});
