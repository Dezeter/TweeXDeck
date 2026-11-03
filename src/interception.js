const PUBLIC_TOKENS = [
    "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
];
const NEW_API = `https://${location.hostname}/i/api/graphql`;
const cursors = {};
const OTD_INIT_TIME = Date.now();

const generateID = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

let verifiedUser;
if(localStorage.OTDverifiedUser) {
    try {
        verifiedUser = JSON.parse(localStorage.OTDverifiedUser);
    } catch(e) {
        console.warn(`Error parsing OTDverifiedUser.`, e);
        verifiedUser = null;
    }
}
let feeds;
if(localStorage.OTDfeeds) {
    try {
        feeds = JSON.parse(localStorage.OTDfeeds);
    } catch(e) {
        console.warn(`Error parsing OTDfeeds.`, e);
        feeds = {};
    }
}
let columns;
if(localStorage.OTDcolumns) {
    try {
        columns = JSON.parse(localStorage.OTDcolumns);
    } catch(e) {
        console.warn(`Error parsing OTDcolumns.`, e);
        columns = {};
    }
}
let settings;
if(localStorage.OTDsettings) {
    try {
        settings = JSON.parse(localStorage.OTDsettings);
    } catch(e) {
        console.warn(`Error parsing OTDsettings.`, e);
        settings = null;
    }
}
let seenNotifications = [];
let seenHomeTweets = {};
let timings = {
    home: {},
    foryou: {},
    list: {},
    user: {},
    search: {},
}
let refreshInterval = localStorage.OTDrefreshInterval ? parseInt(localStorage.OTDrefreshInterval) : 35000;

// Top cursors: what a column's new tweets are asked with, by the newest tweet TweetDeck has (its since_id). As x.com
// does, an answer with nothing new gives the next one. A cursor X answered with an error, or that brought nothing
// for TOP_CURSOR_QUIET, isn't asked with again: without one X answers with its newest tweets, as after a reload, and
// its answer gives a new cursor. Kept, a cursor X stopped taking left a column without new tweets until a reload.
const TOP_CURSOR_QUIET = 5 * 60 * 1000;
const topCursorSince = {};
function topCursor(key) {
    if(cursors[key] && Date.now() - (topCursorSince[key] ?? 0) > TOP_CURSOR_QUIET) forgetTopCursor(key);
    return cursors[key];
}
// a cursor that brought tweets, or the next one of a cursor that brought nothing (renew)
function keepTopCursor(key, value, renew) {
    cursors[key] = value;
    if(!renew || !topCursorSince[key]) topCursorSince[key] = Date.now();
}
function forgetTopCursor(key) {
    delete cursors[key];
    delete topCursorSince[key];
}
// a request with a top cursor X doesn't answer, or answers with an error status
function watchTopCursor(xhr) {
    const key = xhr.storage.topKey;
    if(key) xhr.addEventListener("loadend", () => {
        if(xhr.status < 200 || xhr.status >= 300) forgetTopCursor(key);
    });
}
// an answer with no tweets to a request with a top cursor: X's next cursor if it gave one, none without a timeline
function nothingNew(xhr, entries) {
    reportPoll(xhr, 0);
    const key = xhr.storage.topKey;
    if(!key) return [];
    if(!entries) forgetTopCursor(key);
    else {
        const next = findTopCursor(entries);
        if(next) keepTopCursor(key, next, true);
    }
    return [];
}
const findTopCursor = entries => entries.find(e => e.entryId.startsWith("sq-cursor-top-") || e.entryId.startsWith("cursor-top-"))?.content?.value;
const findBottomCursor = entries => entries.find(e => e.entryId.startsWith("sq-cursor-bottom-") || e.entryId.startsWith("cursor-bottom-"))?.content?.value;
// for the load watchdog (watchdog.js): what a column's request for its new tweets brought, once a request
function reportPoll(xhr, tweets) {
    if(!xhr.storage.poll || xhr.storage.reported) return;
    xhr.storage.reported = true;
    document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "poll", feed: xhr.storage.poll, tweets, cursor: !!xhr.storage.topKey }) }));
}

function exportState() {
	const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({
        feeds, 
        columns,
        settings,
        columnIds: localStorage.OTDcolumnIds ? JSON.parse(localStorage.OTDcolumnIds) : []
    })], {type: 'application/json'}));
    a.download = 'OTDState.json';
    a.click();
}

function importState() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
        const file = input.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            try {
                const data = JSON.parse(text);
                if(!data.feeds || !data.columns || !data.settings || !data.columnIds) {
                    throw new Error("Invalid file");
                }
                localStorage.OTDfeeds = JSON.stringify(data.feeds);
                localStorage.OTDcolumns = JSON.stringify(data.columns);
                localStorage.OTDsettings = JSON.stringify(data.settings);
                localStorage.OTDcolumnIds = JSON.stringify(data.columnIds);
                location.reload();
            } catch(e) {
                alert("Error parsing file");
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function cleanUp() {
    let ids = localStorage.OTDcolumnIds ? JSON.parse(localStorage.OTDcolumnIds) : [];
    for(let columnId in columns) {
        if(!ids.includes(columnId)) {
            delete columns[columnId];
        }
    }
    localStorage.OTDcolumns = JSON.stringify(columns);
    for(let id in feeds) {
        if(!localStorage.OTDcolumns.includes(id)) {
            delete feeds[id];
        }
    }
    localStorage.OTDfeeds = JSON.stringify(feeds);
}

function getFollows(id = getCurrentUserId(), cursor = -1, count = 5000) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open("GET", `https://api.${location.hostname}/1.1/friends/ids.json?user_id=${id}&cursor=${cursor}&stringify_ids=true&count=${count}`, true);
		xhr.setRequestHeader("X-Twitter-Active-User", "yes");
		xhr.setRequestHeader("X-Twitter-Auth-Type", "OAuth2Session");
		xhr.setRequestHeader("X-Twitter-Client-Language", "en");
		xhr.setRequestHeader("Authorization", "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA");
		xhr.setRequestHeader("X-Csrf-Token", (function () {
			var csrf = document.cookie.match(/(?:^|;\s*)ct0=([0-9a-f]+)\s*(?:;|$)/);
			return csrf ? csrf[1] : "";
		})());
		xhr.withCredentials = true;

		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4 && xhr.status === 200) {
				resolve(JSON.parse(xhr.responseText));
			} else if (xhr.readyState === 4 && xhr.status !== 200) {
                reject(xhr);
            }
		};
		
		xhr.send();
	});
}

let followsData = JSON.parse(localStorage.OTDfollowsData || "{}");

let updatingFollows = false;
function updateFollows(id = getCurrentUserId()) {
    if(followsData[id] && followsData[id].lastUpdate && Date.now() - +followsData[id].lastUpdate < 1000 * 60 * 60 * 6) return;
    if(updatingFollows) return;
    updatingFollows = true;

    if(!followsData[id]) followsData[id] = {};
    let newfollows = [];
    let cursor = -1;
    let count = 5000;
    let i = 0;
    let get = async () => {
        let res = await getFollows(id, cursor, count);
        newfollows = newfollows.concat(res.ids);
        if(res.next_cursor_str === "0" || i++ > 10) {
            followsData[id].lastUpdate = Date.now();
            followsData[id].data = newfollows;
            localStorage.OTDfollowsData = JSON.stringify(followsData);
            updatingFollows = false;
            return;
        }
        cursor = res.next_cursor_str;
        get();
    };

    get();
}

// setTimeout(updateFollows, 1000);
// setInterval(updateFollows, 1000 * 60);

function parseNoteTweet(result) {
    let text, entities;
    if (result.note_tweet.note_tweet_results.result) {
        text = result.note_tweet.note_tweet_results.result.text;
        entities = result.note_tweet.note_tweet_results.result.entity_set;
        if (result.note_tweet.note_tweet_results.result.richtext?.richtext_tags.length) {
            entities.richtext = result.note_tweet.note_tweet_results.result.richtext.richtext_tags; // logically, richtext is an entity, right?
        }
    } else {
        text = result.note_tweet.note_tweet_results.text;
        entities = result.note_tweet.note_tweet_results.entity_set;
    }
    return { text, entities };
}

// X's smart cashtags, by tweet id, for cashtags.js (window.OTDcashtagData): the assets a tweet attaches, a card under its text each, and
// the ones its text names by their id ("robinhood:0x…", X shows "$Index"), with their name and ticker. TweetDeck
// keeps neither; the oldest go past 3000 tweets. "attached" is null when X didn't say (a query that leaves it out),
// [] when it said none; what an earlier answer said stays when a later one doesn't say.
const smartCashtags = window.OTDcashtagData = new Map();
function rememberCashtags(result) {
    const id = result?.legacy?.id_str || result?.rest_id;
    if (!id) return;
    const note = result.note_tweet?.note_tweet_results?.result || result.note_tweet?.note_tweet_results;
    const before = smartCashtags.get(id);
    let tags = [...(note?.entity_set?.smarttags || []), ...(result.legacy?.entities?.smarttags || [])]
        .filter(tag => tag?.tag?.rest_id && typeof tag.text === "string" && tag.text)
        .map(tag => ({ id: String(tag.tag.rest_id), text: tag.text, name: String(tag.tag.info?.info?.name || ""), ticker: String(tag.tag.info?.info?.ticker || "") }));
    let attached = Array.isArray(result.cashtag_attachments) ? result.cashtag_attachments.map(a => a?.rest_id).filter(Boolean).map(String) : null;
    if (!tags.length && !attached) return;
    if (!tags.length) tags = before?.tags || [];
    attached = attached || before?.attached || null;
    smartCashtags.delete(id);
    smartCashtags.set(id, { attached, tags });
    if (smartCashtags.size > 3000) smartCashtags.delete(smartCashtags.keys().next().value);
}

function parseTweetCard(card) {
    const legacy = card?.legacy;
    if (!legacy) return;
    const bindings = Array.isArray(legacy.binding_values)
        ? Object.fromEntries(legacy.binding_values.filter(entry => entry?.key && entry.value).map(entry => [entry.key, entry.value]))
        : legacy.binding_values || {};
    // TweetDeck's cards show summary_photo_image_original and thumbnail_image_original only; a card X sends
    // without them gets the largest image it has, or the other one of the two
    for (const prefix of ["summary_photo_image", "thumbnail_image", "photo_image_full_size", "player_image"]) {
        if (bindings[`${prefix}_original`]?.image_value?.url) continue;
        const best = ["_x_large", "_large", "", "_small"].map(suffix => bindings[prefix + suffix]).find(value => value?.image_value?.url);
        if (best) bindings[`${prefix}_original`] = best;
    }
    if (!bindings.summary_photo_image_original && bindings.thumbnail_image_original) bindings.summary_photo_image_original = bindings.thumbnail_image_original;
    if (!bindings.thumbnail_image_original && bindings.summary_photo_image_original) bindings.thumbnail_image_original = bindings.summary_photo_image_original;
    const normalized = { ...legacy, binding_values: bindings };
    if (legacy.name !== "unified_card") return normalized;
    try {
        const payload = JSON.parse(bindings.unified_card?.string_value);
        if (!["image_website", "image_carousel_website", "image_multi_dest_carousel_website", "image_collection_website"].includes(payload?.type)) return normalized;
        const objects = payload.component_objects || {};
        const slides = payload.layout?.data?.slides;
        const order = Array.isArray(slides) && slides.length
            ? slides.flat()
            : payload.components;
        if (!Array.isArray(order)) return normalized;
        const mediaKey = order.find(key => ["media", "swipeable_media"].includes(objects[key]?.type));
        const component = objects[mediaKey];
        const slot = component?.type === "swipeable_media" ? component.data?.media_list?.[0] : component?.data;
        const media = payload.media_entities?.[slot?.id];
        if (media?.type !== "photo") return normalized;
        const imageUrl = media.media_url_https || media.media_url;
        const image = new URL(imageUrl);
        if (!["https:", "http:"].includes(image.protocol)) return normalized;
        const slide = Array.isArray(slides) ? slides.find(keys => Array.isArray(keys) && keys.includes(mediaKey)) : null;
        const details = (slide || order).map(key => objects[key]).find(value => value?.type === "details")?.data;
        const destinationKey = slot?.destination || component?.data?.destination || details?.destination;
        const destination = payload.destination_objects?.[destinationKey];
        if (!["browser", "browser_with_docked_media"].includes(destination?.type)) return normalized;
        const urlData = destination.data?.url_data;
        const url = new URL(urlData?.url);
        if (!["https:", "http:"].includes(url.protocol)) return normalized;
        const vanity = typeof urlData.vanity === "string" && urlData.vanity ? urlData.vanity : url.hostname;
        const stringValue = value => ({ type: "STRING", string_value: value });
        const converted = {
            card_url: stringValue(urlData.url),
            title: stringValue(typeof details?.title?.content === "string" && details.title.content ? details.title.content : vanity),
            description: stringValue(typeof details?.subtitle?.content === "string" ? details.subtitle.content : ""),
            domain: stringValue(vanity),
            vanity_url: stringValue(vanity),
        };
        for (const prefix of ["photo_image_full_size", "summary_photo_image", "thumbnail_image"]) {
            for (const [suffix, bucket] of [["", "medium"], ["_small", "small"], ["_large", "large"], ["_x_large", "large"], ["_original", "original"]]) {
                const sizes = media.sizes || {};
                const size = sizes[bucket] || sizes.medium || sizes.large || {};
                const width = bucket === "original" ? media.original_info?.width || sizes.large?.w || 0 : size.w || 0;
                const height = bucket === "original" ? media.original_info?.height || sizes.large?.h || 0 : size.h || 0;
                converted[prefix + suffix] = { type: "IMAGE", image_value: { url: imageUrl, width, height } };
            }
        }
        return { ...legacy, name: "summary_large_image", url: urlData.url, binding_values: converted };
    } catch {
        return normalized;
    }
}

function parseTweet(res) {
    try {

        if (typeof res !== "object") return;
        if (res.limitedActionResults) {
            let limitation = res.limitedActionResults.limited_actions.find((l) => l.action === "Reply");
            if (limitation) {
                res.tweet.legacy.limited_actions_text = limitation.prompt
                    ? limitation.prompt.subtext.text
                    : "This tweet has limitations to who can reply.";
            }
            res = res.tweet;
        }
        if (!res.legacy && res.tweet) res = res.tweet;
        let tweet = res.legacy;
        if (!res.core || !tweet) return;
        rememberCashtags(res);
        if(!tweet.id) {
            tweet.id = +tweet.id_str;
        }
        let result = res.core.user_results.result;
        tweet.conversation_id = +tweet.conversation_id_str;
        tweet.text = tweet.full_text;
        // X is migrating user fields out of `legacy` into `core`/`avatar`/etc,
        // so `legacy` can now be missing entirely. The fallbacks below already
        // repopulate name/screen_name/avatar/created_at from the new shape.
        tweet.user = result.legacy || {};
        tweet.user.id = +tweet.user_id_str;
        tweet.user.id_str = tweet.user_id_str;
        if (result.is_blue_verified) {
            tweet.user.verified = true;
            tweet.user.verified_type = "Blue";
        }
        if(!tweet.user.profile_image_url && result?.avatar?.image_url) {
            tweet.user.profile_image_url = result.avatar.image_url;
            tweet.user.profile_image_url_https = tweet.user.profile_image_url.replace("http://", "https://");
        }
        if(!tweet.user.profile_image_url && tweet.user.profile_image_url_https) {
            tweet.user.profile_image_url = tweet.user.profile_image_url_https.replace("https://", "http://");
        }
        if(!tweet.user.name && result?.core?.name) {
            tweet.user.name = result.core.name;
        }
        if(!tweet.user.screen_name && result?.core?.screen_name) {
            tweet.user.screen_name = result.core.screen_name;
        }
        if(!tweet.user.created_at && result?.core?.created_at) {
            tweet.user.created_at = result.core.created_at;
        }
        if(result?.relationship_perspectives?.muting) {
            tweet.user.muting = true;
        }
        if(result?.relationship_perspectives?.blocking) {
            tweet.user.blocking = true;
        }
        if(result?.privacy?.protected) {
            tweet.user.protected = true;
        }
        if(result?.location?.location) {
            tweet.user.location = res.core.user_results.result.location.location;
        }
        if(result?.verification?.verified) {
            tweet.user.verified = true;
        }

        if (tweet.retweeted_status_result?.result) {
            let result = tweet.retweeted_status_result.result;
            if (result.limitedActionResults) {
                let limitation = result.limitedActionResults.limited_actions.find(
                    (l) => l.action === "Reply"
                );
                if (limitation) {
                    result.tweet.legacy.limited_actions_text = limitation.prompt
                        ? limitation.prompt.subtext.text
                        : "This tweet has limitations to who can reply.";
                }
                result = result.tweet;
            }
            rememberCashtags(result);
            rememberCashtags(result.quoted_status_result?.result?.tweet || result.quoted_status_result?.result);
            if (
                result.quoted_status_result &&
                result.quoted_status_result.result &&
                result.quoted_status_result.result.legacy &&
                result.quoted_status_result.result.core &&
                result.quoted_status_result.result.core.user_results.result.legacy
            ) {
                result.legacy.quoted_status = result.quoted_status_result.result.legacy;
                const quotedCard = parseTweetCard(result.quoted_status_result.result.card);
                if (quotedCard) result.legacy.quoted_status.card = quotedCard;
                result.legacy.quoted_status.id = +result.legacy.quoted_status.id_str;
                result.legacy.quoted_status.text = result.legacy.quoted_status.full_text;
                result.legacy.quoted_status.conversation_id = +result.legacy.quoted_status.conversation_id_str;
                if (result.legacy.quoted_status) {
                    result.legacy.quoted_status.user =
                        result.quoted_status_result.result.core.user_results.result.legacy;
                    result.legacy.quoted_status.user.id_str = result.legacy.quoted_status.user_id_str;
                    result.legacy.quoted_status.user.id = +result.legacy.quoted_status.user_id_str;
                    let user_result = result?.quoted_status_result?.result?.core?.user_results?.result;
                    if(!result.legacy.quoted_status.user.profile_image_url && user_result?.avatar?.image_url) {
                        result.legacy.quoted_status.user.profile_image_url = user_result.avatar.image_url;
                        result.legacy.quoted_status.user.profile_image_url_https = result.legacy.quoted_status.user.profile_image_url.replace("http://", "https://");
                    }
                    if(!result.legacy.quoted_status.user.profile_image_url && result.legacy.quoted_status.user.profile_image_url_https) {
                        result.legacy.quoted_status.user.profile_image_url = result.legacy.quoted_status.user.profile_image_url_https.replace("https://", "http://");
                    }
                    if(!result.legacy.quoted_status.user.name && user_result?.core?.name) {
                        result.legacy.quoted_status.user.name = user_result.core.name;
                    }
                    if(!result.legacy.quoted_status.user.screen_name && user_result?.core?.screen_name) {
                        result.legacy.quoted_status.user.screen_name = user_result.core.screen_name;
                    }
                    if(!result.legacy.quoted_status.user.created_at && user_result?.core?.created_at) {
                        result.legacy.quoted_status.user.created_at = user_result.core.created_at;
                    }
                    if(user_result?.relationship_perspectives?.muting) {
                        result.legacy.quoted_status.user.muting = true;
                    }
                    if(user_result?.relationship_perspectives?.blocking) {
                        result.legacy.quoted_status.user.blocking = true;
                    }
                    if(user_result?.privacy?.protected) {
                        result.legacy.quoted_status.user.protected = true;
                    }
                    if(user_result?.location?.location) {
                        result.legacy.quoted_status.user.location = user_result.location.location;
                    }
                    if(user_result?.verification?.verified) {
                        result.legacy.quoted_status.user.verified = true;
                    }
                    
                    if (user_result.is_blue_verified) {
                        result.legacy.quoted_status.user.verified = true;
                        result.legacy.quoted_status.user.verified_type = "Blue";
                    }
                } else {
                    console.warn("No retweeted quoted status", result);
                }
            }
            tweet.retweeted_status = result.legacy;
            if (tweet.retweeted_status && result.core.user_results.result.legacy) {
                let user_result = result?.core?.user_results?.result;
                tweet.retweeted_status.text = tweet.retweeted_status.full_text;
                tweet.retweeted_status.id = +tweet.retweeted_status.id_str;
                tweet.retweeted_status.conversation_id = +tweet.retweeted_status.conversation_id_str;
                tweet.retweeted_status.user = user_result.legacy;
                tweet.retweeted_status.user.id_str = tweet.retweeted_status.user_id_str;
                tweet.retweeted_status.user.id = +tweet.retweeted_status.user_id_str;
                if(!tweet.retweeted_status.user.profile_image_url && user_result?.avatar?.image_url) {
                    tweet.retweeted_status.user.profile_image_url = user_result.avatar.image_url;
                    tweet.retweeted_status.user.profile_image_url_https = tweet.retweeted_status.user.profile_image_url.replace("http://", "https://");
                } 
                if(!tweet.retweeted_status.user.profile_image_url && tweet.retweeted_status.user.profile_image_url_https) {
                    tweet.retweeted_status.user.profile_image_url = tweet.retweeted_status.user.profile_image_url_https.replace("https://", "http://");
                }
                if(!tweet.retweeted_status.user.name && user_result?.core?.name) {
                    tweet.retweeted_status.user.name = user_result.core.name;
                }
                if(!tweet.retweeted_status.user.screen_name && user_result?.core?.screen_name) {
                    tweet.retweeted_status.user.screen_name = user_result.core.screen_name;
                }
                if(!tweet.retweeted_status.user.created_at && user_result?.core?.created_at) {
                    tweet.retweeted_status.user.created_at = user_result.core.created_at;
                }
                if(user_result?.relationship_perspectives?.muting) {
                    tweet.retweeted_status.user.muting = true;
                }
                if(user_result?.relationship_perspectives?.blocking) {
                    tweet.retweeted_status.user.blocking = true;
                }
                if(user_result?.privacy?.protected) {
                    tweet.retweeted_status.user.protected = true;
                }
                if(user_result?.location?.location) {
                    tweet.retweeted_status.user.location = result.core.user_results.result.location.location;
                }
                if(user_result?.verification?.verified) {
                    tweet.retweeted_status.user.verified = true;
                }

                if (result.core.user_results.result.is_blue_verified) {
                    tweet.retweeted_status.user.verified = true;
                    tweet.retweeted_status.user.verified_type = "Blue";
                }
                tweet.retweeted_status.ext = {};
                if (result.views) {
                    tweet.retweeted_status.ext.views = { r: { ok: { count: +result.views.count } } };
                }
                const retweetedCard = parseTweetCard(result.card);
                if (retweetedCard) tweet.retweeted_status.card = retweetedCard;
            } else {
                console.warn("No retweeted status", result);
            }
            if (result.note_tweet && result.note_tweet.note_tweet_results && localStorage.OTDenableAutoExpand === "1") {
                let note = parseNoteTweet(result);
                tweet.retweeted_status.full_text = note.text;
                tweet.retweeted_status.entities = note.entities;
                tweet.retweeted_status.display_text_range = undefined; // no text range for long tweets
            }
        }
    
        if (res.quoted_status_result) {
            tweet.quoted_status_result = res.quoted_status_result;
        }
        if (res.note_tweet && res.note_tweet.note_tweet_results) {
            let note = parseNoteTweet(res);
            tweet.full_text = note.text;
            tweet.entities = note.entities;
            tweet.display_text_range = undefined; // no text range for long tweets
        }
        if (tweet.quoted_status_result && tweet.quoted_status_result.result) {
            let result = tweet.quoted_status_result.result;
            if (!result.core && result.tweet) result = result.tweet;
            if (result.limitedActionResults) {
                let limitation = result.limitedActionResults.limited_actions.find(
                    (l) => l.action === "Reply"
                );
                if (limitation) {
                    result.tweet.legacy.limited_actions_text = limitation.prompt
                        ? limitation.prompt.subtext.text
                        : "This tweet has limitations to who can reply.";
                }
                result = result.tweet;
            }
            rememberCashtags(result);
            if(result && result.legacy) {
                tweet.quoted_status = result.legacy;
                const quotedCard = parseTweetCard(result.card);
                if (quotedCard) tweet.quoted_status.card = quotedCard;
                tweet.quoted_status.id = +tweet.quoted_status.id_str;
                tweet.quoted_status.conversation_id = +tweet.quoted_status.conversation_id_str;
                tweet.quoted_status.text = tweet.quoted_status.full_text;
                if (tweet.quoted_status) {
                    tweet.quoted_status.user = result.core.user_results.result.legacy;
                    if (!tweet.quoted_status.user) {
                        delete tweet.quoted_status;
                    } else {
                        tweet.quoted_status.user.id_str = tweet.quoted_status.user_id_str;
                        tweet.quoted_status.user.id = +tweet.quoted_status.user_id_str;
                        let user_result = result?.core?.user_results?.result;
                        if(!tweet.quoted_status.user.profile_image_url && user_result?.avatar?.image_url) {
                            tweet.quoted_status.user.profile_image_url = user_result.avatar.image_url;
                            tweet.quoted_status.user.profile_image_url_https = tweet.quoted_status.user.profile_image_url.replace("http://", "https://");
                        }
                        if(!tweet.quoted_status.user.profile_image_url && tweet.quoted_status.user.profile_image_url_https) {
                            tweet.quoted_status.user.profile_image_url = tweet.quoted_status.user.profile_image_url_https.replace("https://", "http://");
                        }
                        if(!tweet.quoted_status.user.name && user_result?.core?.name) {
                            tweet.quoted_status.user.name = user_result.core.name;
                        }
                        if(!tweet.quoted_status.user.screen_name && user_result?.core?.screen_name) {
                            tweet.quoted_status.user.screen_name = user_result.core.screen_name;
                        }
                        if(!tweet.quoted_status.user.created_at && user_result?.core?.created_at) {
                            tweet.quoted_status.user.created_at = user_result.core.created_at;
                        }
                        if(user_result?.relationship_perspectives?.muting) {
                            tweet.quoted_status.user.muting = true;
                        }
                        if(user_result?.relationship_perspectives?.blocking) {
                            tweet.quoted_status.user.blocking = true;
                        }
                        if(user_result?.privacy?.protected) {
                            tweet.quoted_status.user.protected = true;
                        }
                        if(user_result?.location?.location) {
                            tweet.quoted_status.user.location = user_result.location.location;
                        }
                        if(user_result?.verification?.verified) {
                            tweet.quoted_status.user.verified = true;
                        }
                        if (user_result.is_blue_verified) {
                            tweet.quoted_status.user.verified = true;
                            tweet.quoted_status.user.verified_type = "Blue";
                        }
                        tweet.quoted_status.ext = {};
                        if (result.views) {
                            tweet.quoted_status.ext.views = { r: { ok: { count: +result.views.count } } };
                        }
                    }
                } else {
                    console.warn("No quoted status", result);
                }
            }
        }
        const card = parseTweetCard(res.card);
        if (card) tweet.card = card;
        if (res.views) {
            if (!tweet.ext) tweet.ext = {};
            tweet.ext.views = { r: { ok: { count: +res.views.count } } };
        }
        if (res.source) {
            tweet.source = res.source;
        }
        if (res.birdwatch_pivot) {
            // community notes
            tweet.birdwatch = res.birdwatch_pivot;
        }
    
        if (tweet.favorited && tweet.favorite_count === 0) {
            tweet.favorite_count = 1;
        }
        if (tweet.retweeted && tweet.retweet_count === 0) {
            tweet.retweet_count = 1;
        }
    
        return tweet;
    } catch (e) {
        console.error('error parsing tweet', e, res);
        throw new Error('error parsing tweet');
    }
}

// TweetDetail, x.com's own query for a tweet with the ones it replies to and its replies
function tweetDetailUrl(focalTweetId) {
    return `https://${location.hostname}/i/api/graphql/KwGBbJZc6DBx8EKmyQSP7g/TweetDetail?variables=${encodeURIComponent(
        JSON.stringify({
            focalTweetId,
            with_rux_injections: false,
            includePromotedContent: false,
            withCommunity: true,
            withQuickPromoteEligibilityTweetFields: true,
            withBirdwatchNotes: true,
            withVoice: true,
            withV2Timeline: true,
        })
    )}&features=${encodeURIComponent(
        JSON.stringify({
            rweb_lists_timeline_redesign_enabled: false,
            blue_business_profile_image_shape_enabled: true,
            responsive_web_graphql_exclude_directive_enabled: true,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: false,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            tweetypie_unmention_optimization_enabled: true,
            vibe_api_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            tweet_awards_web_tipping_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            standardized_nudges_misinfo: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
            interactive_text_enabled: true,
            responsive_web_text_conversations_enabled: false,
            longform_notetweets_rich_text_read_enabled: true,
            longform_notetweets_inline_media_enabled: false,
            responsive_web_enhance_cards_enabled: false,
            ...CASHTAG_FEATURES,
        })
    )}`;
}

// X's answer to TweetDetail in the shape of /2/timeline/conversation, which TweetDeck asked for replies and X
// answers 404 to since late October 2026: the tweets and their authors by id, and entries pointing at them. Only
// the conversation (the tweets above, the tweet, the replies and the cursors to more of them), not "Discover
// more" and the like. An answer that isn't TweetDetail's comes back as it is.
function conversationTimeline(data) {
    const instructions = data?.data?.threaded_conversation_with_injections_v2?.instructions;
    if (!Array.isArray(instructions)) return data;
    const tweets = {};
    const users = {};
    const tweetOf = content => {
        if (content?.itemType !== "TimelineTweet") return null;
        let tweet;
        try {
            tweet = parseTweet(content.tweet_results?.result);
        } catch (e) {
            return null;
        }
        // deleted and withheld ones are tombstones, without a tweet
        if (!tweet?.id_str) return null;
        tweets[tweet.id_str] = tweet;
        users[tweet.user_id_str] = tweet.user;
        return { id: tweet.id_str, displayType: content.tweetDisplayType || "Tweet" };
    };
    // a cursor comes as an item of its own, or in place of the entry's content
    const cursorOf = content => {
        if (!content?.value || (content.itemType || content.entryType) !== "TimelineTimelineCursor") return null;
        return { value: content.value, cursorType: content.cursorType, ...(content.displayTreatment ? { displayTreatment: content.displayTreatment } : {}) };
    };
    const entries = [];
    for (const instruction of instructions) {
        if (instruction?.type !== "TimelineAddEntries") continue;
        for (const entry of instruction.entries || []) {
            const entryId = String(entry?.entryId || "");
            const { sortIndex } = entry;
            if (entryId.startsWith("tweet-")) {
                const tweet = tweetOf(entry.content?.itemContent);
                if (tweet) entries.push({ entryId, sortIndex, content: { item: { content: { tweet } } } });
            } else if (entryId.startsWith("conversationthread-")) {
                // its tweets; its own "show more" cursor TweetDeck never followed
                const items = (entry.content?.items || [])
                    .map(item => ({ entryId: String(item?.entryId || "").replace("conversationthread-", "conversationThread-"), tweet: tweetOf(item?.item?.itemContent) }))
                    .filter(item => item.tweet)
                    .map(({ entryId, tweet }) => ({ entryId, item: { content: { tweet } } }));
                if (items.length) entries.push({ entryId: entryId.replace("conversationthread-", "conversationThread-"), sortIndex, content: { timelineModule: { displayType: "VerticalConversation", items } } });
            } else if (entryId.startsWith("cursor-")) {
                const cursor = cursorOf(entry.content?.itemContent || entry.content);
                if (cursor) entries.push({ entryId, sortIndex, content: { operation: { cursor } } });
            }
        }
    }
    return { globalObjects: { tweets, users }, timeline: { id: "Conversation", instructions: [{ addEntries: { entries } }] } };
}

function getCurrentUserId() {
    let accounts = TD.storage.accountController.getAll();
    let screen_name = TD.storage.accountController.getUserIdentifier();
    let account = accounts.find((account) => account.state.username === screen_name);
    return account?.state?.userId ?? verifiedUser?.id_str ?? localStorage.twitterAccountID;
}

// what x.com asks with its tweets for their smart cashtags (cashtag_attachments, smarttags); X leaves them out without
const CASHTAG_FEATURES = { rweb_cashtags_enabled: true, rweb_cashtags_composer_attachment_enabled: true };

function generateParams(features, variables, fieldToggles) {
    let params = new URLSearchParams();
    params.append("variables", JSON.stringify(variables));
    params.append("features", JSON.stringify({ ...features, ...CASHTAG_FEATURES }));
    if (fieldToggles) params.append("fieldToggles", JSON.stringify(fieldToggles));

    return params.toString();
}

function extractAssignedJSON(html, varName = "window.__INITIAL_STATE__") {
    const assignPos = html.indexOf(varName);
    if (assignPos === -1) {
        console.error(html);
        throw new Error(`Variable ${varName} not found`);
    }
  
    let i = assignPos + varName.length;
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] !== '=') {
      i = html.indexOf('=', i);
      if (i === -1) throw new Error(`Assignment for ${varName} not found`);
    }
    i++; // skip '='
    while (i < html.length && /\s/.test(html[i])) i++;
  
    const opener = html[i];
    if (opener !== '{' && opener !== '[') {
      throw new Error(`Expected JSON object/array after ${varName} = ...`);
    }
    const closer = opener === '{' ? '}' : ']';
  
    let depth = 0, inStr = false, quote = null, escaped = false;
    const start = i;
    for (; i < html.length; i++) {
      const ch = html[i];
  
      if (inStr) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quote) {
          inStr = false;
          quote = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = true;
        quote = ch;
        continue;
      }
      if (ch === opener) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) throw new Error(`Unterminated JSON for ${varName}`);
  
    let jsonText = html.slice(start, i + 1);
  
    let j = i + 1;
    while (j < html.length && /\s/.test(html[j])) j++;
    if (html[j] === ';') j++;
  
    try {
      return JSON.parse(stripBOM(jsonText));
    } catch (e) {
      const repaired = repairCommonJSONIssues(jsonText);
      try {
        return JSON.parse(repaired);
      } catch (e2) {
        const ctx = repaired.slice(0, 1200);
        throw new Error(
          `Found assignment, but JSON.parse failed twice. First: ${e.message}. Second: ${e2.message}. ` +
          `Sample of repaired text start:\n${ctx}`
        );
      }
    }
  
    function stripBOM(s) {
      return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
    }
  
    function repairCommonJSONIssues(s) {
      s = stripBOM(s);
  
      let out = '';
      let inStr = false;
      let quote = null;
      let escaped = false;
  
      for (let k = 0; k < s.length; k++) {
        let ch = s[k];
  
        if (!inStr) {
          if (ch === '"' || ch === "'") {
            inStr = true;
            quote = ch;
            out += ch;
            continue;
          }
          out += ch;
          continue;
        }
  
        if (escaped) {
          escaped = false;
          out += ch;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          out += ch;
          continue;
        }
        if (ch === quote) {
          inStr = false;
          quote = null;
          out += ch;
          continue;
        }
  
        const code = ch.charCodeAt(0);
  
        if (code === 0x2028) { out += '\\u2028'; continue; }
        if (code === 0x2029) { out += '\\u2029'; continue; }
  
        if (code >= 0x00 && code <= 0x1F) {
          if (ch === '\n') { out += '\\n'; continue; }
          if (ch === '\r') { out += '\\r'; continue; }
          if (ch === '\t') { out += '\\t'; continue; }
          if (ch === '\b') { out += '\\b'; continue; }
          if (ch === '\f') { out += '\\f'; continue; }
          out += '\\u' + code.toString(16).padStart(4, '0');
          continue;
        }
  
        out += ch;
      }
  
      return out;
    }
}
function formatTwitterStyle(date) {
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  
    const day = days[date.getUTCDay()];
    const month = months[date.getUTCMonth()];
    const dayNum = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const mins = String(date.getUTCMinutes()).padStart(2, "0");
    const secs = String(date.getUTCSeconds()).padStart(2, "0");
    const year = date.getUTCFullYear();
  
    return `${day} ${month} ${dayNum} ${hours}:${mins}:${secs} +0000 ${year}`;
}

// an answer of the extension's own, or X's from elsewhere (sendNoteTweet), in place of the request's
function emulateResponse(xhr) {
    respond(xhr, 200);
}
function respond(xhr, status) {
    xhr._status = status;
    xhr._readyState = 4;
    xhr.responseHeaderOverride = {
        "content-type": () => "application/json"
    }
    const loadEvent = new ProgressEvent('load');
    loadEvent.lengthComputable = true;
    loadEvent.loaded = 1;
    loadEvent.total = 1;

    if(xhr.onload) xhr.onload(loadEvent);
    if(xhr.onloadend) xhr.onloadend(loadEvent);

    const readyStateEvent = new Event('readystatechange');
    if(xhr.onreadystatechange) xhr.onreadystatechange(readyStateEvent);
}

// Posts longer than 280 (long-posts.js lets TweetDeck's tweet box write them), as x.com sends them:
// CreateNoteTweet, by x.com's own id of it, from its main.js, with the features the mutation names there, as x.com's
// homepage sets them; both kept a day. X's error stays an error, for TweetDeck to keep the text and say so.
const LONG_POST_FROM = 280;
function weightedLength(text) {
    try {
        return window.twttr.txt.parseTweet(text).weightedLength;
    } catch (e) {
        return [...text].length;
    }
}
// An operation of x.com's GraphQL as x.com's own main.js has it, its id and the names of its features, with the
// values x.com's homepage gives them; kept for a day in localStorage[storage]
async function graphqlQuery(name, type, storage) {
    try {
        const kept = JSON.parse(localStorage[storage] || "null");
        if (kept?.id && Date.now() - kept.at < 864e5) return kept;
    } catch (e) {}
    let html = "", main;
    // a logged out homepage can be X's newer app; /i/jf/ is still the old one
    for (const path of ["/", "/i/jf/"]) {
        html = await fetch(`https://${location.hostname}${path}`, { credentials: "include" }).then(res => res.text());
        main = html.match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web(?:-legacy)?\/main\.[\w-]+\.js/)?.[0];
        if (main) break;
    }
    if (!main) throw new Error("no main.js on x.com's homepage");
    const res = await fetch(main);
    if (!res.ok) throw new Error(`${main}: HTTP ${res.status}`);
    const op = (await res.text()).match(new RegExp(`queryId:"([\\w-]+)",operationName:"${name}",operationType:"${type}",metadata:\\{featureSwitches:\\[([^\\]]*)\\]`));
    if (!op) throw new Error(`no ${name} in x.com's main.js`);
    // the homepage's default, then the user's own value of each: the last one written
    const features = {};
    for (const [, feature] of op[2].matchAll(/"(\w+)"/g)) {
        const values = [...html.matchAll(new RegExp(`"${feature}":\\{"value":(true|false)`, "g"))];
        features[feature] = values.length ? values[values.length - 1][1] === "true" : false;
    }
    const query = { id: op[1], features, at: Date.now() };
    localStorage[storage] = JSON.stringify(query);
    return query;
}
// CreateNoteTweet as x.com had it in October 2026, for when x.com's main.js can't be read
const NOTE_TWEET_QUERY = { id: "o4vMmMGVvt40x_q9DD3ehQ", features: {"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,"responsive_web_grok_analyze_post_followups_enabled":true,"rweb_cashtags_composer_attachment_enabled":true,"responsive_web_jetfuel_frame":true,"rweb_sports_post_context_enabled":true,"responsive_web_grok_share_attachment_enabled":true,"responsive_web_grok_annotations_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"content_disclosure_indicator_enabled":true,"content_disclosure_ai_generated_indicator_enabled":true,"responsive_web_grok_show_grok_translated_post":true,"responsive_web_grok_analysis_button_from_backend":true,"post_ctas_fetch_enabled":false,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":false,"profile_label_improvements_pcf_label_in_post_enabled":true,"responsive_web_profile_redirect_enabled":true,"rweb_tipjar_consumption_enabled":false,"verified_phone_label_enabled":false,"responsive_web_nested_quote_preview_enabled":true,"articles_preview_enabled":true,"rweb_cashtags_enabled":true,"responsive_web_grok_community_note_auto_translation_is_enabled":true,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"responsive_web_grok_image_annotation_enabled":true,"responsive_web_grok_imagine_annotation_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true} };
const noteTweetQuery = () => graphqlQuery("CreateNoteTweet", "mutation", "OTDnoteTweetQuery").catch(e => {
    console.warn("CreateNoteTweet isn't in x.com's main.js or it can't be read, sent by the id x.com had:", e);
    return NOTE_TWEET_QUERY;
});
// the tweet a mutation's answer has, whatever X calls the mutation's field: create_tweet, notetweet_create
const createdTweet = data => Object.values(data?.data || {}).find(v => v?.tweet_results?.result)?.tweet_results.result;
async function sendNoteTweet(xhr, body) {
    let status = 0, text = "", url = "";
    try {
        const query = await noteTweetQuery();
        const path = `/i/api/graphql/${query.id}/CreateNoteTweet`;
        url = `https://${location.hostname}${path}`;
        const headers = { ...xhr.modReqHeaders };
        if (window.solveChallenge) headers["x-client-transaction-id"] = await solveChallenge(path, "POST");
        document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "request", id: xhr.otdId, method: "POST", url }) }));
        const res = await fetch(url, { method: "POST", headers, credentials: "include", body: JSON.stringify({ variables: JSON.parse(body).variables, features: query.features, queryId: query.id }) });
        status = res.status;
        text = await res.text();
        // an id X has dropped: asked again next time
        if (status === 400 || status === 404) delete localStorage.OTDnoteTweetQuery;
    } catch (e) {
        console.error("CreateNoteTweet", e);
        text = JSON.stringify({ errors: [{ code: 0, message: String(e?.message || e) }] });
    }
    if (url) document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "response", id: xhr.otdId, method: "POST", url, status }) }));
    xhr.storage.noteTweet = text;
    let posted = false;
    try {
        posted = !!createdTweet(JSON.parse(text));
    } catch (e) {}
    respond(xhr, posted ? 200 : status >= 400 ? status : 403);
}

// the features x.com asks its home timelines with
const HOME_FEATURES = {"rweb_video_screen_enabled":false,"profile_label_improvements_pcf_label_in_post_enabled":true,"responsive_web_profile_redirect_enabled":false,"rweb_tipjar_consumption_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,"responsive_web_grok_analyze_post_followups_enabled":true,"responsive_web_jetfuel_frame":true,"responsive_web_grok_share_attachment_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"responsive_web_grok_show_grok_translated_post":false,"responsive_web_grok_analysis_button_from_backend":true,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_grok_image_annotation_enabled":true,"responsive_web_grok_imagine_annotation_enabled":true,"responsive_web_grok_community_note_auto_translation_is_enabled":false,"responsive_web_enhance_cards_enabled":false};
// HomeTimeline's id as x.com had it (twikit 2.3.3), for when x.com's main.js can't be read, with the same features
const HOME_TIMELINE_ID = "-X_hcgQzmHGl29-UXxz4sw";

// X's For you, the timeline X picks for the user from people they follow and people they don't, for a home
// column TweetDeck asks for with otd_timeline=foryou (for-you.js): HomeTimeline by x.com's own id and features, a
// POST as x.com sends it (a GET came back without a body), its cursors one top and one bottom for each account,
// as x.com keeps them. It's asked for new tweets at most every refreshInterval, as TweetDeck asks for its home
// timelines every few seconds.
async function sendForYou(xhr) {
    const user = xhr.storage.user_id;
    const top = `foryou-${user}-top`, bottom = `foryou-${user}-bottom`;
    const variables = { count: 40, includePromotedContent: true, latestControlAvailable: true, requestContext: "launch", withCommunity: true, seenTweetIds: [] };
    const skip = () => {
        xhr.storage.cancelled = true;
        emulateResponse(xhr);
    };
    if (xhr.storage.max_id) {
        // further down from where the last page ended; without one there's nothing further
        if (!cursors[bottom]) return skip();
        variables.cursor = cursors[bottom];
    } else if (xhr.storage.since_id) {
        if (Date.now() - (timings.foryou[user] || 0) < refreshInterval) return skip();
        if (topCursor(top)) {
            variables.cursor = cursors[top];
            variables.requestContext = "ptr";
            xhr.storage.topKey = top;
        }
    }
    timings.foryou[user] = Date.now();
    let status = 0, text = "", url = `https://${location.hostname}/i/api/graphql/HomeTimeline`, error = "";
    try {
        let query;
        try {
            query = await graphqlQuery("HomeTimeline", "query", "OTDhomeTimelineQuery");
        } catch (e) {
            console.warn("HomeTimeline isn't in x.com's main.js, asked by the id it had:", e);
            query = { id: HOME_TIMELINE_ID, features: HOME_FEATURES };
        }
        const path = `/i/api/graphql/${query.id}/HomeTimeline`;
        url = `https://${location.hostname}${path}`;
        // as send() has them for a request it opens, which this one isn't
        const headers = { ...xhr.modReqHeaders };
        if (localStorage.device_id) headers["X-Client-UUID"] = localStorage.device_id;
        if (window.solveChallenge) headers["x-client-transaction-id"] = await solveChallenge(path, "POST");
        document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "request", id: xhr.otdId, method: "POST", url }) }));
        const res = await fetch(url, { method: "POST", headers, credentials: "include",
            body: JSON.stringify({ variables, features: { ...query.features, ...CASHTAG_FEATURES }, queryId: query.id }) });
        status = res.status;
        text = await res.text();
        // an id X has dropped: asked again next time
        if (status === 400 || status === 404) delete localStorage.OTDhomeTimelineQuery;
    } catch (e) {
        console.error("HomeTimeline", e);
        error = String(e?.message || e);
    }
    document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "response", id: xhr.otdId, method: "POST", url, status, ...(error ? { error } : {}) }) }));
    xhr.storage.body = text;
    respond(xhr, status >= 200 && status < 300 ? 200 : status || 503);
}

let counter = 0;
let bookmarkTimes = {};
const OriginalXHR = XMLHttpRequest;
const proxyRoutes = [
    // Home timeline
    {
        path: "/1.1/statuses/home_timeline.json",
        method: "GET",
        beforeRequest: (xhr) => {
            try {
                let url = new URL(xhr.modUrl);
                let params = new URLSearchParams(url.search);
                let variables = {"count":40,"includePromotedContent":true,"latestControlAvailable":true};
                let features = HOME_FEATURES;

                let max_id = params.get("max_id");
                let since_id = params.get("since_id");
                // Spaces: spaces.js draws its column, its requests for tweets are answered empty without asking X
                if (params.get("otd_timeline") === "spaces") {
                    xhr.storage.cancelled = true;
                    return;
                }
                // For you: its request is made as it's sent (sendForYou), its account known by then
                if (params.get("otd_timeline") === "foryou") {
                    xhr.storage.forYou = true;
                    xhr.storage.max_id = max_id;
                    xhr.storage.since_id = since_id;
                    if (since_id) xhr.storage.poll = "foryou";
                    xhr.modUrl = `${NEW_API}/HomeTimeline`;
                    return;
                }
                let user_id = xhr.modReqHeaders["x-act-as-user-id"] ?? params.get("user_id") ?? getCurrentUserId();
                if(params.get("user_id")) {
                    xhr.storage.user_id = params.get("user_id");
                }
                if (max_id) {
                    let bn = BigInt(params.get("max_id"));
                    bn += BigInt(1);
                    if (cursors[`home-${user_id}-${bn}`]) {
                        variables.cursor = cursors[`home-${user_id}-${bn}`];
                        // xhr.storage.cursor = true;
                    }
                }
                if (since_id) {
                    xhr.storage.poll = "home";
                    let key = `home-${user_id}-${BigInt(since_id)}-top`;
                    if (topCursor(key)) {
                        variables.cursor = cursors[key];
                        xhr.storage.cursor = true;
                        xhr.storage.since_id = since_id;
                        xhr.storage.topKey = key;
                    }
                }
                xhr.modUrl = `${NEW_API}/cWF3cqWadLlIXA6KJWhcew/HomeLatestTimeline?${generateParams(
                    features,
                    variables
                )}`;
            } catch (e) {
                console.error(e);
            }
        },
        openHandler: (xhr, method, url, async, username, password) => {
            if(xhr.storage.forYou || xhr.storage.cancelled) return;
            let user_id = xhr.modReqHeaders["x-act-as-user-id"] ?? xhr.storage.user_id ?? getCurrentUserId();
            xhr.storage.user_id = user_id;
            if(!timings.home[user_id]) {
                timings.home[user_id] = 0;
            }
            if(Date.now() - timings.home[user_id] < refreshInterval && xhr.storage.cursor && Math.random() > 0.6) {
                xhr.storage.cancelled = true;
            } else {
                xhr.open(method, url, async, username, password);
                timings.home[user_id] = Date.now();
            }
        },
        sendHandler: (xhr, data) => {
            if(xhr.storage.cancelled) {
                emulateResponse(xhr);
            } else if(xhr.storage.forYou) {
                sendForYou(xhr);
            } else {
                watchTopCursor(xhr);
                xhr.send(data);
            }
        },
        beforeSendHeaders: (xhr) => {
            xhr.storage.user_id = xhr.modReqHeaders["x-act-as-user-id"] ?? getCurrentUserId();
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] = PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
            // updateFollows(xhr.storage.user_id);
        },
        afterRequest: (xhr) => {
            if(xhr.storage.cancelled) {
                return [];
            }
            if(xhr.storage.data) {
                return xhr.storage.data;
            }
            // For you's that X answered without a body, as it does an error: its status is TweetDeck's error
            if (xhr.storage.forYou && !xhr.storage.body) return nothingNew(xhr);
            let data;
            try {
                data = JSON.parse(xhr.storage.forYou ? xhr.storage.body : xhr.responseText);
            } catch (e) {
                console.error(e);
                return nothingNew(xhr);
            }
            // errors beside the timeline are X's about some of its tweets (one it couldn't get); the rest is there
            let instructions = data?.data?.home?.home_timeline_urt?.instructions;
            if (!instructions) {
                return nothingNew(xhr);
            }
            let entries = instructions.find((i) => i.type === "TimelineAddEntries");
            if (!entries) {
                return nothingNew(xhr, []);
            }
            entries = entries.entries;
            // the tweets of For you seen apart from Following's
            const seen = xhr.storage.forYou ? `foryou-${xhr.storage.user_id}` : xhr.storage.user_id;
            let tweets = [];
            for (let e of entries) {
                // thats a lot of trash https://lune.dimden.dev/0bf524e52eb.png
                if (e.entryId.startsWith("tweet-")) {
                    let res = e.content.itemContent?.tweet_results?.result;
                    let tweet = parseTweet(res);
                    if (!tweet) continue;
                    if (
                        tweet.source &&
                        (tweet.source.includes("Twitter for Advertisers") ||
                            tweet.source.includes("advertiser-interface"))
                    )
                        continue;
                    if (tweet.user.blocking || tweet.user.muting) continue;

                    tweets.push(tweet);
                } else if (e.entryId.startsWith("home-conversation-")) {
                    let items = e.content.items;

                    let pushTweets = [];
                    for (let i = 0; i < items.length; i++) {
                        let item = items[i];
                        if (
                            (item.entryId.startsWith("tweet-") || item.entryId.includes("-tweet-")) &&
                            !item.entryId.includes("promoted")
                        ) {
                            let res = item.item?.itemContent?.tweet_results?.result;
                            let tweet = parseTweet(res);
                            if (!tweet) continue;
                            if (
                                tweet.source &&
                                (tweet.source.includes("Twitter for Advertisers") ||
                                    tweet.source.includes("advertiser-interface"))
                            )
                                continue;
                            if (tweet.user.blocking || tweet.user.muting) break;
                            if (item.item.feedbackInfo) {
                                tweet.feedback = item.item.feedbackInfo.feedbackKeys
                                    .map(
                                        (f) =>
                                            data.data.home.home_timeline_urt.responseObjects.feedbackActions.find(
                                                (a) => a.key === f
                                            ).value
                                    )
                                    .filter((f) => f);
                                if (tweet.feedback) {
                                    tweet.feedbackMetadata =
                                        item.item.feedbackInfo.feedbackMetadata;
                                }
                            }
                            pushTweets.push(tweet);
                        }
                    }
                    if(!seenHomeTweets[seen]) {
                        seenHomeTweets[seen] = [];
                    }
                    for(let tweet of pushTweets) {
                        if(xhr.storage.since_id && seenHomeTweets[seen].includes(tweet.id_str)) continue;
                        seenHomeTweets[seen].push(tweet.id_str);
                        tweets.push(tweet);
                    }
                }
            }

            if (tweets.length === 0) return nothingNew(xhr, entries);

            // i didn't know they return tweets unsorted???
            tweets.sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            if(!seenHomeTweets[seen]) {
                seenHomeTweets[seen] = [];
            }
            for(let tweet of tweets) {
                if(seenHomeTweets[seen].includes(tweet.id_str)) continue;
                seenHomeTweets[seen].push(tweet.id_str);
            }

            // For you: the top cursor of the newest page, the bottom one of the page furthest down
            if (xhr.storage.forYou) {
                const top = findTopCursor(entries), bottom = findBottomCursor(entries);
                if (top && !xhr.storage.max_id) keepTopCursor(`foryou-${xhr.storage.user_id}-top`, top);
                if (bottom && !xhr.storage.since_id) cursors[`foryou-${xhr.storage.user_id}-bottom`] = bottom;
                xhr.storage.data = tweets;
                reportPoll(xhr, tweets.length);
                return tweets;
            }

            let bottomCursor = entries.find(
                (e) =>
                    e.entryId.startsWith("sq-cursor-bottom-") ||
                    e.entryId.startsWith("cursor-bottom-")
            );
            if (bottomCursor) {
                cursors[`home-${xhr.storage.user_id}-${tweets[tweets.length - 1].id_str}`] =
                    bottomCursor.content.value;
            }
            let top = findTopCursor(entries);
            if (top) {
                if(tweets[0]) keepTopCursor(`home-${xhr.storage.user_id}-${tweets[0].id_str}-top`, top);
                if(tweets[1]) keepTopCursor(`home-${xhr.storage.user_id}-${tweets[1].id_str}-top`, top);
                // the one asked with moves on too, as on x.com: TweetDeck asks with it again when what came is older
                if(xhr.storage.topKey) keepTopCursor(xhr.storage.topKey, top, true);
            }

            xhr.storage.data = tweets;
            reportPoll(xhr, tweets.length);

            return tweets;
        },
    },
    // List timeline
    {
        path: "/1.1/lists/statuses.json",
        method: "GET",
        beforeRequest: (xhr) => {
            try {
                let url = new URL(xhr.modUrl);
                let params = new URLSearchParams(url.search);
                let variables = { count: 40, includePromotedContent: false };
                let features = {"rweb_video_screen_enabled":false,"payments_enabled":false,"profile_label_improvements_pcf_label_in_post_enabled":true,"rweb_tipjar_consumption_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,"responsive_web_grok_analyze_post_followups_enabled":true,"responsive_web_jetfuel_frame":true,"responsive_web_grok_share_attachment_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"responsive_web_grok_show_grok_translated_post":false,"responsive_web_grok_analysis_button_from_backend":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_grok_image_annotation_enabled":true,"responsive_web_grok_community_note_auto_translation_is_enabled":false,"responsive_web_enhance_cards_enabled":false};

                let list_id = params.get("list_id");
                let max_id = params.get("max_id");
                let since_id = params.get("since_id");
                if (max_id) {
                    let bn = BigInt(params.get("max_id"));
                    bn += BigInt(1);
                    if (cursors[`list-${list_id}-${bn}`]) {
                        variables.cursor = cursors[`list-${list_id}-${bn}`];
                        xhr.storage.cursor = true;
                    }
                }
                if (since_id) {
                    xhr.storage.poll = "list";
                    let key = `list-${list_id}-${BigInt(since_id)}-top`;
                    if (topCursor(key)) {
                        variables.cursor = cursors[key];
                        xhr.storage.cursor = true;
                        xhr.storage.topKey = key;
                    }
                }
                variables.listId = list_id;
                xhr.storage.list_id = list_id;
                xhr.modUrl = `${NEW_API}/l411pL-GRg-AKo_a2rmYjg/ListLatestTweetsTimeline?${generateParams(
                    features,
                    variables
                )}`;
            } catch (e) {
                console.error(e);
            }
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] = PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        openHandler: (xhr, method, url, async, username, password) => {
            const list_id = xhr.storage.list_id;
            if(!timings.list[list_id]) {
                timings.list[list_id] = 0;
            }
            if(Date.now() - timings.list[list_id] < refreshInterval && xhr.storage.cursor) {
                xhr.storage.cancelled = true;
            } else {
                xhr.open(method, url, async, username, password);
                timings.list[list_id] = Date.now();
            }
        },
        sendHandler: (xhr, data) => {
            if(xhr.storage.cancelled) {
                emulateResponse(xhr);
            } else {
                watchTopCursor(xhr);
                xhr.send(data);
            }
        },
        afterRequest: (xhr) => {
            if(xhr.storage.cancelled) {
                return [];
            }
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return nothingNew(xhr);
            }
            let instructions = data?.data?.list?.tweets_timeline?.timeline?.instructions;
            if (!instructions) return nothingNew(xhr);
            let list = instructions.find((i) => i.type === "TimelineAddEntries");
            if (!list) return nothingNew(xhr, []);
            list = list.entries;
            let tweets = [];
            for (let e of list) {
                if (e.entryId.startsWith("tweet-")) {
                    let res = e.content.itemContent.tweet_results.result;
                    let tweet = parseTweet(res);
                    if (tweet) {
                        tweets.push(tweet);
                    }
                } else if (e.entryId.startsWith("list-conversation-")) {
                    let lt = e.content.items;
                    for (let i = 0; i < lt.length; i++) {
                        let t = lt[i];
                        if (t.entryId.startsWith("tweet-") || t.entryId.includes("-tweet-")) {
                            let res = t.item.itemContent.tweet_results.result;
                            let tweet = parseTweet(res);
                            if (!tweet) continue;
                            tweets.push(tweet);
                        }
                    }
                }
            }

            if (tweets.length === 0) return nothingNew(xhr, list);

            tweets = tweets.filter(t => !t.user.muting && !t.user.blocking);

            // i didn't know they return tweets unsorted???
            tweets.sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )

            let bottomCursor = list.find(
                (e) =>
                    e.entryId.startsWith("sq-cursor-bottom-") ||
                    e.entryId.startsWith("cursor-bottom-")
            );
            if (bottomCursor) {
                cursors[`list-${xhr.storage.list_id}-${tweets[tweets.length - 1].id_str}`] =
                    bottomCursor.content.value;
            }
            let top = findTopCursor(list);
            if (top) {
                if(tweets[0]) keepTopCursor(`list-${xhr.storage.list_id}-${tweets[0].id_str}-top`, top);
                if(tweets[1]) keepTopCursor(`list-${xhr.storage.list_id}-${tweets[1].id_str}-top`, top);
                // the one asked with moves on too, as on x.com: TweetDeck asks with it again when what came is older
                if(xhr.storage.topKey) keepTopCursor(xhr.storage.topKey, top, true);
            }
            reportPoll(xhr, tweets.length);

            return tweets;
        },
    },
    // User timeline
    {
        path: "/1.1/statuses/user_timeline.json",
        method: "GET",
        beforeRequest: (xhr) => {
            try {
                let url = new URL(xhr.modUrl);
                let params = new URLSearchParams(url.search);
                let user_id = params.get("user_id");
                let variables = {
                    count: 20,
                    includePromotedContent: false,
                    withQuickPromoteEligibilityTweetFields: false,
                    withVoice: true,
                    withV2Timeline: true,
                };
                let features = {
                    rweb_lists_timeline_redesign_enabled: false,
                    responsive_web_graphql_exclude_directive_enabled: true,
                    verified_phone_label_enabled: false,
                    creator_subscriptions_tweet_preview_api_enabled: true,
                    responsive_web_graphql_timeline_navigation_enabled: true,
                    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                    tweetypie_unmention_optimization_enabled: true,
                    responsive_web_edit_tweet_api_enabled: true,
                    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
                    view_counts_everywhere_api_enabled: true,
                    longform_notetweets_consumption_enabled: true,
                    responsive_web_twitter_article_tweet_consumption_enabled: false,
                    tweet_awards_web_tipping_enabled: false,
                    freedom_of_speech_not_reach_fetch_enabled: true,
                    standardized_nudges_misinfo: true,
                    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
                    longform_notetweets_rich_text_read_enabled: true,
                    longform_notetweets_inline_media_enabled: true,
                    responsive_web_media_download_video_enabled: false,
                    responsive_web_enhance_cards_enabled: false,
                };

                if (!user_id) {
                    variables.userId = getCurrentUserId();
                } else {
                    variables.userId = user_id;
                }
                let since_id = params.get("since_id");
                let max_id = params.get("max_id");
                if (max_id) {
                    let bn = BigInt(params.get("max_id"));
                    bn += BigInt(1);
                    if (cursors[`${variables.userId}-${bn}`]) {
                        variables.cursor = cursors[`${variables.userId}-${bn}`];
                        xhr.storage.cursor = true;
                    }
                }
                if (since_id) {
                    xhr.storage.poll = "user";
                    let key = `${variables.userId}-${BigInt(since_id)}-top`;
                    if (topCursor(key)) {
                        variables.cursor = cursors[key];
                        xhr.storage.cursor = true;
                        xhr.storage.topKey = key;
                    }
                }
                xhr.storage.user_id = variables.userId;

                xhr.modUrl = `${NEW_API}/wxoVeDnl0mP7VLhe6mTOdg/UserTweetsAndReplies?${generateParams(
                    features,
                    variables
                )}`;
            } catch (e) {
                console.error(e);
            }
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
            // delete xhr.modReqHeaders["x-act-as-user-id"];
        },
        openHandler: (xhr, method, url, async, username, password) => {
            const user_id = xhr.storage.user_id;
            if(!timings.user[user_id]) {
                timings.user[user_id] = 0;
            }
            if(Date.now() - timings.user[user_id] < refreshInterval && xhr.storage.cursor) {
                xhr.storage.cancelled = true;
            } else {
                xhr.open(method, url, async, username, password);
                timings.user[user_id] = Date.now();
            }
        },
        sendHandler: (xhr, data) => {
            if(xhr.storage.cancelled) {
                emulateResponse(xhr);
            } else {
                watchTopCursor(xhr);
                xhr.send(data);
            }
        },
        afterRequest: (xhr) => {
            if(xhr.storage.cancelled) {
                return [];
            }
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return nothingNew(xhr);
            }
            let instructions = data?.data?.user?.result?.timeline_v2?.timeline?.instructions;
            if (!instructions) return nothingNew(xhr);
            let entries = instructions.find((e) => e.type === "TimelineAddEntries");
            if (!entries) {
                return nothingNew(xhr, []);
            }
            entries = entries.entries;
            let tweets = [];
            for (let entry of entries) {
                if (entry.entryId.startsWith("tweet-")) {
                    let result = entry.content.itemContent.tweet_results.result;
                    let tweet = parseTweet(result);
                    if (tweet) {
                        tweets.push(tweet);
                    }
                } else if (entry.entryId.startsWith("profile-conversation-")) {
                    let items = entry.content.items;
                    for (let i = 0; i < items.length; i++) {
                        let item = items[i];
                        let result = item.item.itemContent.tweet_results.result;
                        if (item.entryId.startsWith("tweet-") || item.entryId.includes("-tweet-")) {
                            let tweet = parseTweet(result);
                            if (tweet && tweet.user.id_str === xhr.storage.user_id) {
                                tweets.push(tweet);
                            }
                        }
                    }
                }
            }

            if (tweets.length === 0) return nothingNew(xhr, entries);

            // i didn't know they return tweets unsorted???
            tweets.sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            let bottomCursor = entries.find(
                (e) =>
                    e.entryId.startsWith("sq-cursor-bottom-") ||
                    e.entryId.startsWith("cursor-bottom-")
            ).content.value;
            if (bottomCursor) {
                cursors[`${xhr.storage.user_id}-${tweets[tweets.length - 1].id_str}`] = bottomCursor;
            }
            let top = findTopCursor(entries);
            if (top) {
                if(tweets[0]) keepTopCursor(`${xhr.storage.user_id}-${tweets[0].id_str}-top`, top);
                if(tweets[1]) keepTopCursor(`${xhr.storage.user_id}-${tweets[1].id_str}-top`, top);
                // the one asked with moves on too, as on x.com: TweetDeck asks with it again when what came is older
                if(xhr.storage.topKey) keepTopCursor(xhr.storage.topKey, top, true);
            }

            let pinEntry = instructions.find((e) => e.type === "TimelinePinEntry");
            if (
                pinEntry &&
                pinEntry.entry &&
                pinEntry.entry.content &&
                pinEntry.entry.content.itemContent
            ) {
                let result = pinEntry.entry.content.itemContent.tweet_results.result;
                let pinnedTweet = parseTweet(result);
                if (pinnedTweet) {
                    let tweetTimes = tweets.map((t) => [
                        t.id_str,
                        new Date(t.created_at).getTime(),
                    ]);
                    tweetTimes.push([
                        pinnedTweet.id_str,
                        new Date(pinnedTweet.created_at).getTime(),
                    ]);
                    tweetTimes.sort((a, b) => b[1] - a[1]);
                    let index = tweetTimes.findIndex((t) => t[0] === pinnedTweet.id_str);
                    if (index !== tweets.length) {
                        tweets.splice(index, 0, pinnedTweet);
                    }
                }
            }
            reportPoll(xhr, tweets.length);

            return tweets;
        },
    },
    // Bookmarks timeline
    {
        path: "/1.1/statuses/bookmarks.json",
        method: "GET",
        beforeRequest: (xhr) => {
            try {
                let url = new URL(xhr.modUrl);
                let params = new URLSearchParams(url.search);
                let variables = {
                    "count": 40,
                    "includePromotedContent":false
                };
                let features = {"graphql_timeline_v2_bookmark_timeline":true,"blue_business_profile_image_shape_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"tweetypie_unmention_optimization_enabled":true,"vibe_api_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":false,"interactive_text_enabled":true,"responsive_web_text_conversations_enabled":false,"longform_notetweets_rich_text_read_enabled":true,"responsive_web_enhance_cards_enabled":false};

                let max_id = params.get("max_id");
                if (max_id) {
                    let bn = BigInt(params.get("max_id"));
                    bn += BigInt(1);
                    if (cursors[`bookmarks-${bn}`]) {
                        variables.cursor = cursors[`bookmarks-${bn}`];
                    }
                    if(bookmarkTimes[`${bn}`]) {
                        xhr.storage.time = bookmarkTimes[`${bn}`];
                    }
                }

                xhr.modUrl = `${NEW_API}/3OjEFzT2VjX-X7w4KYBJRg/Bookmarks?${generateParams(
                    features,
                    variables
                )}`;
            } catch (e) {
                console.error(e);
            }
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
            // delete xhr.modReqHeaders["x-act-as-user-id"];
        },
        // artificially slow down, because theres an invisible rate limit that gets hit after a few hours
        responseHeaderOverride: {
            "x-rate-limit-limit": (value) => {
                return Math.floor(+value/5);
            },
            "x-rate-limit-remaining": (value) => {
                return Math.floor(+value/5);
            },
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return [];
            }
            // if (data.errors && data.errors[0]) {
            //     return [];
            // }
            let instructions = data?.data?.bookmark_timeline_v2?.timeline?.instructions;
            let entries = instructions?.find((e) => e.type === "TimelineAddEntries");
            if (!entries) {
                return [];
            }
            entries = entries.entries;
            let tweets = [];
            for (let entry of entries) {
                if (entry.entryId.startsWith("tweet-")) {
                    let result = entry.content.itemContent.tweet_results.result;
                    let tweet = parseTweet(result);
                    if (tweet) {
                        tweets.push(tweet);
                    }
                } else if (entry.entryId.startsWith("profile-conversation-")) {
                    let items = entry.content.items;
                    for (let i = 0; i < items.length; i++) {
                        let item = items[i];
                        let result = item.item.itemContent.tweet_results.result;
                        if (item.entryId.startsWith("tweet-") || item.entryId.includes("-tweet-")) {
                            let tweet = parseTweet(result);
                            if (tweet && tweet.user.id_str === xhr.storage.user_id) {
                                tweets.push(tweet);
                            }
                        }
                    }
                }
            }

            if (tweets.length === 0) return tweets;

            for(let i = 0; i < tweets.length; i++) {
                const tweet = tweets[i];
                tweet.receiveTime = bookmarkTimes[tweet.id_str] ?? ((xhr.storage.time ?? Date.now()) - i);
                bookmarkTimes[tweet.id_str] = tweet.receiveTime;
            }

            let cursor = entries.find(
                (e) =>
                    e.entryId.startsWith("sq-cursor-bottom-") ||
                    e.entryId.startsWith("cursor-bottom-")
            ).content.value;
            if (cursor) {
                cursors[`bookmarks-${tweets[tweets.length - 1].id_str}`] = cursor;
            }

            return tweets;
        },
    },
    // Notifications column
    {
        path: "/1.1/activity/about_me.json",
        method: "GET",
        beforeRequest: (xhr) => {
            const params = new URLSearchParams(xhr.modUrl);
            const since_id = params.get("since_id");
            const max_id = params.get("max_id");
            const user_id = xhr.modReqHeaders["x-act-as-user-id"] ?? params.get("user_id") ?? getCurrentUserId();
            let cursor;
            if(since_id && cursors[`notifications-${user_id}-top`]) {
                cursor = cursors[`notifications-${user_id}-top`];
            } else if(max_id && cursors[`notifications-${user_id}-bottom`]) {
                cursor = cursors[`notifications-${user_id}-bottom`];
            }

            xhr.modUrl = `https://${location.hostname}/i/api/2/notifications/all.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_has_nft_avatar=1&include_ext_is_blue_verified=1&include_ext_verified_type=1&include_ext_profile_image_shape=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&include_entities=true&include_user_entities=true&include_ext_media_color=true&include_ext_media_availability=true&include_ext_sensitive_media_warning=true&include_ext_trusted_friends_metadata=true&send_error_codes=true&simple_quoted_tweet=true&count=20&requestContext=launch&ext=mediaStats%2ChighlightedLabel%2ChasNftAvatar%2CvoiceInfo%2CbirdwatchPivot%2CsuperFollowMetadata%2CunmentionInfo%2CeditControl${cursor ? `&cursor=${cursor}` : ''}`;
        },
        beforeSendHeaders: (xhr) => {
            xhr.storage.user_id = xhr.modReqHeaders["x-act-as-user-id"] ?? getCurrentUserId();
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = navigator.language.split("-")[0];
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        afterRequest: (xhr) => {
            if(xhr.storage.notifications) {
                return xhr.storage.notifications;
            }
            try {
                const response = JSON.parse(xhr.responseText);
                const entries = response.timeline.instructions.find((i) => i.addEntries).addEntries.entries;
                const go = response.globalObjects;
                const notifications = [];
                for(let entry of entries) {
                    try {
                        if(entry.entryId.startsWith("notification-")) {
                            const sortIndex = entry.sortIndex;
                            const item = entry.content.item;
                            const type = item.clientEventInfo.element;
                            const notif = item.content.notification;
    
                            switch(type) {
                                case "users_retweeted_your_retweet":
                                case "users_retweeted_your_tweet":
                                case "user_liked_multiple_tweets": 
                                case "users_liked_your_retweet":
                                case "users_liked_your_tweet": {
                                    const nf = go.notifications[notif.id];
                                    const actions = nf.template.aggregateUserActionsV1;
                                    const users = actions.fromUsers.map(u => u.user.id);
                                    const tweets = actions.targetObjects.map(t => t.tweet.id);
                                    let i = 0;
                                    for(const userId of users) {
                                        for(const tweetId of tweets) {
                                            const tweet = go.tweets[tweetId];
                                            const user = go.users[userId];
                                            const action = type === "users_retweeted_your_tweet" || type === "users_retweeted_your_retweet" ? "retweet" : "favorite";
                                            if(!tweet || !user) continue;
                                            const id = `${tweetId}-${userId}-${action}`;
                                            if(seenNotifications.includes(id)) continue;
                                            seenNotifications.push(id);
                                            const notifSortIndex = +sortIndex - (i++);
                                            tweet.user = go.users[tweet.user_id_str];
                                            if(tweet.quoted_status_id_str) {
                                                tweet.quoted_status = go.tweets[tweet.quoted_status_id_str];
                                                tweet.quoted_status.user = go.users[tweet.quoted_status.user_id_str];
                                            }
    
                                            const sources = [user];
                                            const targets = [tweet];
                                            const target_objects = [tweet];
                                            notifications.push({
                                                action,
                                                created_at: formatTwitterStyle(new Date(notifSortIndex)),
                                                max_position: notifSortIndex+"",
                                                min_position: notifSortIndex+"",
                                                sources,
                                                sources_size: sources.length,
                                                target_objects,
                                                target_objects_size: target_objects.length,
                                                targets,
                                                targets_size: targets.length,
                                            })
                                        }
                                    }
                                    break;
                                }
                                case "user_mentioned_you":
                                case "user_replied_to_your_tweet": 
                                case "user_quoted_your_tweet":{
                                    const tweetId = item.content.tweet.id;
                                    const tweet = go.tweets[tweetId];
                                    if(!tweet) continue;
                                    tweet.user = go.users[tweet.user_id_str];
                                    const type = item.clientEventInfo.element === "user_mentioned_you" ? "mention" : item.clientEventInfo.element === "user_replied_to_your_tweet" ? "reply" : "quote";
                                    
                                    const id = `${tweetId}-${tweet.user_id_str}-${type}`;
                                    if(seenNotifications.includes(id)) continue;
                                    seenNotifications.push(id);
    
                                    if(tweet.quoted_status_id_str) {
                                        tweet.quoted_status = go.tweets[tweet.quoted_status_id_str];
                                        tweet.quoted_status.user = go.users[tweet.quoted_status.user_id_str];
                                    }
                                    
                                    notifications.push({
                                        action: type,
                                        created_at: formatTwitterStyle(new Date(+sortIndex)),
                                        max_position: sortIndex+"",
                                        min_position: sortIndex+"",
                                        sources: [tweet.user],
                                        sources_size: 1,
                                        target_objects: [tweet],
                                        target_objects_size: 1,
                                        targets: [tweet],
                                        targets_size: 1,
                                    });
                                    break;
                                }
                                case "follow_from_recommended_user":
                                case "users_followed_you": {
                                    const nf = go.notifications[notif.id];
                                    const users = nf.template.aggregateUserActionsV1.fromUsers.map(u => u.user.id);
                                    for(const userId of users) {
                                        const user = go.users[userId];
                                        if(!user) continue;
                                        const id = `${userId}-follow`;
                                        if(seenNotifications.includes(id)) continue;
                                        seenNotifications.push(id);
                                        notifications.push({
                                            action: "follow",
                                            created_at: formatTwitterStyle(new Date(+sortIndex)),
                                            max_position: sortIndex+"",
                                            min_position: sortIndex+"",
                                            sources: [user],
                                            sources_size: 1,
                                            target_objects: [user],
                                            target_objects_size: 1,
                                            targets: [user],
                                            targets_size: 1
                                        });
                                    }
                                    break;
                                }
                                case "generic_login_notification":
                                case "generic_acid_notification":
                                case "generic_safety_label_added":
                                    break;
                                default:
                                    console.warn(`Unknown notification type: ${type}`);
                            }
                        }
                    } catch (e) {
                        console.error(`Error parsing notification`, JSON.stringify(entry));
                    }
                }
                xhr.storage.notifications = notifications;
                const cursorTop = entries.find(
                    (e) =>
                        e.entryId.startsWith("sq-cursor-top-") ||
                        e.entryId.startsWith("cursor-top-")
                )?.content?.operation?.cursor?.value;
                if(cursorTop) {
                    cursors[`notifications-${xhr.storage.user_id}-top`] = cursorTop;
                }
                const cursorBottom = entries.find(
                    (e) =>
                        e.entryId.startsWith("sq-cursor-bottom-") ||
                        e.entryId.startsWith("cursor-bottom-")
                )?.content?.operation?.cursor?.value;
                if(cursorBottom) {
                    cursors[`notifications-${xhr.storage.user_id}-bottom`] = cursorBottom;
                }
                return notifications;
            } catch (e) {
                console.error(`Error parsing notifications`, e);
                return [];
            }
        },
    },
    // Mentions timeline
    {
        path: "/1.1/statuses/mentions_timeline.json",
        method: "GET",
        beforeRequest: (xhr) => {
            const params = new URLSearchParams(xhr.modUrl);
            const since_id = params.get("since_id");
            const max_id = params.get("max_id");
            const user_id = xhr.modReqHeaders["x-act-as-user-id"] ?? params.get("user_id") ?? getCurrentUserId();
            xhr.storage.user_id = user_id;
            let cursor;
            if(since_id && cursors[`mentions-${user_id}-top`]) {
                cursor = cursors[`mentions-${user_id}-top`];
            } else if(max_id && cursors[`mentions-${user_id}-bottom`]) {
                cursor = cursors[`mentions-${user_id}-bottom`];
            }

            xhr.modUrl = `https://${location.hostname}/i/api/2/notifications/mentions.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_has_nft_avatar=1&include_ext_is_blue_verified=1&include_ext_verified_type=1&include_ext_profile_image_shape=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&include_entities=true&include_user_entities=true&include_ext_media_color=true&include_ext_media_availability=true&include_ext_sensitive_media_warning=true&include_ext_trusted_friends_metadata=true&send_error_codes=true&simple_quoted_tweet=true&count=20&requestContext=launch&ext=mediaStats%2ChighlightedLabel%2ChasNftAvatar%2CvoiceInfo%2CbirdwatchPivot%2CsuperFollowMetadata%2CunmentionInfo%2CeditControl${cursor ? `&cursor=${cursor}` : ''}`;
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] = PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        afterRequest: (xhr) => {
            try {
                const response = JSON.parse(xhr.responseText);
                const entries = response.timeline.instructions.find((i) => i.addEntries).addEntries.entries;
                const go = response.globalObjects;
                const tweets = [];
                for(let entry of entries) {
                    if(entry.entryId.startsWith("notification-")) {
                        const sortIndex = entry.sortIndex;
                        const item = entry.content.item;
                        const type = item.clientEventInfo.element;

                        switch(type) {
                            case "user_mentioned_you":
                            case "user_replied_to_your_tweet": 
                            case "user_quoted_your_tweet":{
                                const tweetId = item.content.tweet.id;
                                const tweet = go.tweets[tweetId];
                                if(!tweet) continue;
                                tweet.user = go.users[tweet.user_id_str];

                                if(tweet.quoted_status_id_str) {
                                    tweet.quoted_status = go.tweets[tweet.quoted_status_id_str];
                                    tweet.quoted_status.user = go.users[tweet.quoted_status.user_id_str];
                                }
                                
                                tweets.push(tweet);
                                break;
                            }
                        }
                    }
                }
                const cursorTop = entries.find(
                    (e) =>
                        e.entryId.startsWith("sq-cursor-top-") ||
                        e.entryId.startsWith("cursor-top-")
                )?.content?.operation?.cursor?.value;
                if(cursorTop) {
                    cursors[`mentions-${xhr.storage.user_id}-top`] = cursorTop;
                }
                const cursorBottom = entries.find(
                    (e) =>
                        e.entryId.startsWith("sq-cursor-bottom-") ||
                        e.entryId.startsWith("cursor-bottom-")
                )?.content?.operation?.cursor?.value;
                if(cursorBottom) {
                    cursors[`mentions-${xhr.storage.user_id}-bottom`] = cursorBottom;
                }
                
                return tweets;
            } catch (e) {
                console.error(`Error parsing mentions`, e);
                return [];
            }
        }
    },
    // User likes timeline
    {
        path: "/1.1/favorites/list.json",
        method: "GET",
        beforeRequest: (xhr) => {
            try {
                let url = new URL(xhr.modUrl);
                let params = new URLSearchParams(url.search);
                let user_id = params.get("user_id") ?? getCurrentUserId();
                let variables = {
                    "userId": user_id,
                    "count": 50,
                    "includePromotedContent": false,
                    "withSuperFollowsUserFields": true,
                    "withDownvotePerspective": false,
                    "withReactionsMetadata": false,
                    "withReactionsPerspective": false,
                    "withSuperFollowsTweetFields": true,
                    "withClientEventToken": false,
                    "withBirdwatchNotes": false,
                    "withVoice": true,
                    "withV2Timeline": true
                };
                let features = {
                    "dont_mention_me_view_api_enabled": true,
                    "interactive_text_enabled": true,
                    "responsive_web_uc_gql_enabled": false,
                    "vibe_tweet_context_enabled": false,
                    "responsive_web_edit_tweet_api_enabled": false,
                    "standardized_nudges_misinfo": false,
                    "responsive_web_enhance_cards_enabled": false
                };

                let max_id = params.get("max_id");
                if (max_id) {
                    let bn = BigInt(params.get("max_id"));
                    bn += BigInt(1);
                    if (cursors[`${variables.userId}-${bn}-likes`]) {
                        variables.cursor = cursors[`${variables.userId}-${bn}-likes`];
                    }
                }
                xhr.storage.user_id = variables.userId;

                xhr.modUrl = `${NEW_API}/vni8vUvtZvJoIsl49VPudg/Likes?${generateParams(
                    features,
                    variables
                )}`;
            } catch (e) {
                console.error(e);
            }
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
            // delete xhr.modReqHeaders["x-act-as-user-id"];
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return [];
            }
            // if (data.errors && data.errors[0]) {
            //     return [];
            // }
            let instructions = data?.data?.user?.result?.timeline_v2?.timeline?.instructions;
            let entries = instructions?.find((e) => e.type === "TimelineAddEntries");
            if (!entries) {
                return [];
            }
            entries = entries.entries;

            let tweets = entries
                .filter(e => e.entryId.startsWith('tweet-') && e.content.itemContent.tweet_results.result)
                .map(e => parseTweet(e.content.itemContent.tweet_results.result))
                .filter(e => e);

            if (tweets.length === 0) return tweets;

            let cursor = entries.find(
                (e) =>
                    e.entryId.startsWith("sq-cursor-bottom-") ||
                    e.entryId.startsWith("cursor-bottom-")
            ).content.value;
            if (cursor) {
                cursors[`${xhr.storage.user_id}-${tweets[tweets.length - 1].id_str}-likes`] = cursor;
            }

            // i didn't know they return tweets unsorted???
            tweets.sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            return tweets;
        },
    },
    // Liking / unliking
    {
        path: /\/1\.1\/favorites\/.*\.json/,
        method: "POST",
        beforeRequest: (xhr) => {
            const isFavorite = xhr.modUrl.includes("create.json");
            xhr.storage.isFavorite = isFavorite;

            xhr.modUrl = isFavorite ? 
                `https://${location.hostname}/i/api/graphql/lI07N6Otwv1PhnEgXILM7A/FavoriteTweet` : 
                `https://${location.hostname}/i/api/graphql/ZYKSe-w7KEslx3JhSIk5LA/UnfavoriteTweet`;
        },
        sendHandler: (xhr, data) => {
            const tweet_id = new URLSearchParams(data).get("id");
            xhr.send(JSON.stringify({"variables":{"tweet_id":tweet_id},"queryId":xhr.storage.isFavorite ? "lI07N6Otwv1PhnEgXILM7A" : "ZYKSe-w7KEslx3JhSIk5LA"}));
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] = PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        afterRequest: (xhr) => {
            return {};
        },
    },
    // Collections
    {
        path: /\/1\.1\/collections\/.*\.json/,
        method: "GET",
        openHandler: () => {},
        sendHandler: emulateResponse,
        afterRequest: (xhr) => {
            xhr._status = 404;
            return "";
        },
    },
    {
        path: /\/1\.1\/collections\/.*\.json/,
        method: "POST",
        openHandler: () => {},
        sendHandler: emulateResponse,
        afterRequest: (xhr) => {
            xhr._status = 404;
            return "";
        },
    },
    // User profile
    {
        path: "/1.1/users/show.json",
        method: "GET",
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] = PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
    },
    // Search
    {
        path: "/1.1/search/universal.json",
        method: "GET",
        beforeRequest: (xhr) => {
            try {
                let url = new URL(xhr.modUrl);
                let params = new URLSearchParams(url.search);
                let variables = {
                    rawQuery: params.get("q"),
                    count: 20,
                    querySource: "typed_query",
                    product: "Latest",
                };
                let features = {"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"tweetypie_unmention_optimization_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_enhance_cards_enabled":false};

                xhr.storage.query = variables.rawQuery;
                xhr.storage.cursor = params.get("since_id");
                xhr.modUrl = `${NEW_API}/l0dLMlz_fHji3FT8AfrvxA/SearchTimeline?${generateParams(
                    features,
                    variables
                )}`;
            } catch (e) {
                console.error(e);
            }
        },
        openHandler: (xhr, method, url, async, username, password) => {
            if(!timings.search[xhr.storage.query]) {
                timings.search[xhr.storage.query] = 0;
            }
            if(Date.now() - timings.search[xhr.storage.query] < 60000*1.5 && xhr.storage.cursor) {
                xhr.storage.cancelled = true;
            } else {
                xhr.open(method, url, async, username, password);
                timings.search[xhr.storage.query] = Date.now();
            }
        },
        sendHandler: (xhr, data) => {
            if(xhr.storage.cancelled) {
                emulateResponse(xhr);
            } else {
                xhr.send(data);
            }
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        afterRequest: (xhr) => {
            if(xhr.storage.cancelled) {
                return [];
            }
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return [];
            }
            // if (data.errors && data.errors[0]) {
            //     return [];
            // }
            let instructions = data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
            let entries = instructions?.find((i) => i.entries);
            if (!entries) {
                return [];
            }
            entries = entries.entries;
            let res = [];
            for (let entry of entries) {
                if (entry.entryId.startsWith("sq-I-t-") || entry.entryId.startsWith("tweet-")) {
                    let result = entry.content.itemContent.tweet_results.result;

                    if (entry.content.itemContent.promotedMetadata) {
                        continue;
                    }
                    let tweet = parseTweet(result);
                    if (!tweet) {
                        continue;
                    }
                    res.push(tweet);
                }
            }
            let cursor = entries.find(
                (e) =>
                    e.entryId.startsWith("sq-cursor-bottom-") ||
                    e.entryId.startsWith("cursor-bottom-")
            );
            if (cursor) {
                cursor = cursor.content.value;
            } else {
                cursor = instructions.find(
                    (e) =>
                        e.entry_id_to_replace &&
                        (e.entry_id_to_replace.startsWith("sq-cursor-bottom-") ||
                            e.entry_id_to_replace.startsWith("cursor-bottom-"))
                );
                if (cursor) {
                    cursor = cursor.entry.content.value;
                } else {
                    cursor = null;
                }
            }

            return {
                metadata: {
                    cursor,
                    refresh_interval_in_sec: 30,
                },
                modules: res.map((t) => ({ status: { data: t } })),
            };
        },
    },
    // User search
    {
        path: "/1.1/users/search.json",
        method: "GET",
        beforeRequest: (xhr) => {
            try {
                let url = new URL(xhr.modUrl);
                let params = new URLSearchParams(url.search);
                let variables = {
                    rawQuery: params.get("q"),
                    count: 20,
                    querySource: "typed_query",
                    product: "People",
                };
                let features = {
                    rweb_lists_timeline_redesign_enabled: false,
                    responsive_web_graphql_exclude_directive_enabled: true,
                    verified_phone_label_enabled: false,
                    creator_subscriptions_tweet_preview_api_enabled: true,
                    responsive_web_graphql_timeline_navigation_enabled: true,
                    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                    tweetypie_unmention_optimization_enabled: true,
                    responsive_web_edit_tweet_api_enabled: true,
                    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
                    view_counts_everywhere_api_enabled: true,
                    longform_notetweets_consumption_enabled: true,
                    responsive_web_twitter_article_tweet_consumption_enabled: false,
                    tweet_awards_web_tipping_enabled: false,
                    freedom_of_speech_not_reach_fetch_enabled: true,
                    standardized_nudges_misinfo: true,
                    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
                    longform_notetweets_rich_text_read_enabled: true,
                    longform_notetweets_inline_media_enabled: true,
                    responsive_web_media_download_video_enabled: false,
                    responsive_web_enhance_cards_enabled: false,
                };

                xhr.modUrl = `${NEW_API}/nK1dw4oV3k4w5TdtcAdSww/SearchTimeline?${generateParams(
                    features,
                    variables
                )}`;
            } catch (e) {
                console.error(e);
            }
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return [];
            }
            if (data.errors && data.errors[0]) {
                return [];
            }
            let instructions = data.data.search_by_raw_query.search_timeline.timeline.instructions;
            let entries = instructions.find((i) => i.entries);
            if (!entries) {
                return [];
            }
            entries = entries.entries;
            let res = [];
            for (let entry of entries) {
                if (entry.entryId.startsWith("sq-I-u-") || entry.entryId.startsWith("user-")) {
                    let result = entry.content.itemContent.user_results.result;
                    if (!result || !result.legacy) {
                        console.log("Bug: no user", entry);
                        continue;
                    }
                    let user = result.legacy;
                    user.id_str = result.rest_id;
                    res.push(user);
                }
            }
            let cursor = entries.find(
                (e) =>
                    e.entryId.startsWith("sq-cursor-bottom-") ||
                    e.entryId.startsWith("cursor-bottom-")
            );
            if (cursor) {
                cursor = cursor.content.value;
            } else {
                cursor = instructions.find(
                    (e) =>
                        e.entry_id_to_replace &&
                        (e.entry_id_to_replace.startsWith("sq-cursor-bottom-") ||
                            e.entry_id_to_replace.startsWith("cursor-bottom-"))
                );
                if (cursor) {
                    cursor = cursor.entry.content.value;
                } else {
                    cursor = null;
                }
            }

            return res;
        },
    },
    // Tweet creation
    {
        path: "/1.1/statuses/update.json",
        method: "POST",
        beforeRequest: (xhr) => {
            xhr.modUrl = `https://${location.hostname}/i/api/graphql/oB-5XsHNAbjvARJEc8CZFw/CreateTweet`;
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] = PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        beforeSendBody: (xhr, body) => {
            let params = Object.fromEntries(new URLSearchParams(body));
            let variables = {
                tweet_text: params.status,
                media: {
                    media_entities: [],
                    possibly_sensitive: false,
                },
                semantic_annotation_ids: [],
                dark_request: false,
            };
            if (params.in_reply_to_status_id) {
                variables.reply = {
                    in_reply_to_tweet_id: params.in_reply_to_status_id,
                    exclude_reply_user_ids: [],
                };
                if (params.exclude_reply_user_ids) {
                    variables.reply.exclude_reply_user_ids =
                        params.exclude_reply_user_ids.split(",");
                }
            }
            if (params.media_ids) {
                variables.media.media_entities = params.media_ids
                    .split(",")
                    .map((id) => ({ media_id: id, tagged_users: [] }));
            }
            if (params.attachment_url) {
                variables.attachment_url = params.attachment_url;
            }
            xhr.storage.long = weightedLength(params.status || "") > LONG_POST_FROM;
            if (xhr.storage.long) variables.richtext_options = { richtext_tags: [] };

            return JSON.stringify({
                variables,
                features: {"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"tweetypie_unmention_optimization_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"articles_preview_enabled":true,"rweb_video_timestamps_enabled":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_enhance_cards_enabled":false},
                queryId: "oB-5XsHNAbjvARJEc8CZFw",
            });
        },
        sendHandler: (xhr, body) => {
            if (xhr.storage.long) return sendNoteTweet(xhr, body);
            document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "request", id: xhr.otdId, method: "POST", url: xhr.modUrl }) }));
            xhr.send(body);
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.storage.noteTweet ?? xhr.responseText);
            } catch (e) {
                console.error(e);
                return {};
            }
            const result = createdTweet(data);
            // X's errors as TweetDeck reads them, v1.1's
            if (xhr.storage.noteTweet !== undefined && !result) {
                return { errors: (data?.errors || [{ code: 0, message: "" }]).map(e => ({ code: e.code ?? 0, message: e.message || "" })) };
            }
            if (data.errors && data.errors[0]) {
                return {};
            }
            if (!result) return {};
            let tweet = parseTweet(result);
            return tweet;
        },
    },
    // Retweeting
    {
        path: /\/1.1\/statuses\/retweet\/(\d+).json/,
        method: "POST",
        beforeRequest: (xhr) => {
            let originalUrl = new URL(xhr.originalUrl);
            xhr.storage.tweet_id = originalUrl.pathname.match(
                /\/1.1\/statuses\/retweet\/(\d+).json/
            )[1];
            xhr.storage.retweeter = getCurrentUserId();
            xhr.modUrl = `https://${location.hostname}/i/api/graphql/ojPdsZsimiJrUGLR1sjUtA/CreateRetweet`;
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] = PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
            if (xhr.modReqHeaders["x-act-as-user-id"]) {
                xhr.storage.retweeter = xhr.modReqHeaders["x-act-as-user-id"];
            }
        },
        beforeSendBody: (xhr, body) => {
            return JSON.stringify({
                variables: {
                    tweet_id: xhr.storage.tweet_id,
                    dark_request: false,
                },
                queryId: "ojPdsZsimiJrUGLR1sjUtA",
            });
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return {};
            }
            if (data.errors && data.errors[0]) {
                return {};
            }
            let res = data.data.create_retweet.retweet_results.result;
            let tweet = res.legacy;
            tweet.id_str = res.rest_id;
            if (!tweet.user) {
                tweet.user = {
                    id_str: xhr.storage.retweeter,
                };
            }
            return tweet;
        },
    },
    // Unretweeting
    {
        path: /\/1.1\/statuses\/unretweet\/(\d+).json/,
        method: "POST",
        beforeRequest: (xhr) => {
            let originalUrl = new URL(xhr.originalUrl);
            xhr.storage.tweet_id = originalUrl.pathname.match(
                /\/1.1\/statuses\/unretweet\/(\d+).json/
            )[1];
            xhr.storage.retweeter = getCurrentUserId();
            xhr.modUrl = `https://${location.hostname}/i/api/graphql/iQtK4dl5hBmXewYZuEOKVw/DeleteRetweet`;
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
            if (xhr.modReqHeaders["x-act-as-user-id"]) {
                xhr.storage.retweeter = xhr.modReqHeaders["x-act-as-user-id"];
            }
        },
        beforeSendBody: (xhr, body) => {
            return JSON.stringify({
                variables: { source_tweet_id: xhr.storage.tweet_id, dark_request: false },
                queryId: "iQtK4dl5hBmXewYZuEOKVw",
            });
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return {};
            }
            if (data.errors && data.errors[0]) {
                return {};
            }
            let res = data.data.unretweet.source_tweet_results.result;
            let tweet = res.legacy;
            tweet.id_str = res.rest_id;
            if (!tweet.user) {
                tweet.user = {
                    id_str: xhr.storage.retweeter,
                };
            }
            return tweet;
        },
    },
    // Getting tweet details
    {
        path: /\/1.1\/statuses\/show\/(\d+).json/,
        method: "GET",
        beforeRequest: (xhr) => {
            let originalUrl = new URL(xhr.originalUrl);
            xhr.storage.tweet_id = originalUrl.pathname.match(
                /\/1.1\/statuses\/show\/(\d+).json/
            )[1];
            xhr.modUrl = tweetDetailUrl(xhr.storage.tweet_id);
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return {};
            }
            if (data.errors && data.errors[0]) {
                return {};
            }
            let ic = data.data.threaded_conversation_with_injections_v2.instructions
                .find((i) => i.type === "TimelineAddEntries")
                .entries.find((e) => e.entryId === `tweet-${xhr.storage.tweet_id}`)
                .content.itemContent;
            let res = ic.tweet_results.result;
            let tweet = parseTweet(res);
            return tweet;
        },
    },
    {
        path: "/1.1/statuses/show.json",
        method: "GET",
        beforeRequest: (xhr) => {
            let originalUrl = new URL(xhr.originalUrl);
            xhr.storage.tweet_id = originalUrl.searchParams.get("id");
            xhr.modUrl = tweetDetailUrl(xhr.storage.tweet_id);
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return {};
            }
            if (data.errors && data.errors[0]) {
                return {};
            }
            let ic = data.data.threaded_conversation_with_injections_v2.instructions
                .find((i) => i.type === "TimelineAddEntries")
                .entries.find((e) => e.entryId === `tweet-${xhr.storage.tweet_id}`)
                .content.itemContent;
            let res = ic.tweet_results.result;
            let tweet = parseTweet(res);
            return tweet;
        },
    },
    // Tweet deletion
    {
        path: /\/1.1\/statuses\/destroy\/(\d+).json/,
        method: "POST",
        beforeRequest: (xhr) => {
            let originalUrl = new URL(xhr.originalUrl);
            xhr.storage.tweet_id = originalUrl.pathname.match(
                /\/1.1\/statuses\/destroy\/(\d+).json/
            )[1];
            xhr.modUrl = `https://${location.hostname}/i/api/graphql/VaenaVgh5q5ih7kvyVjgtg/DeleteTweet`;
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        beforeSendBody: (xhr, body) => {
            return JSON.stringify({
                variables: { tweet_id: xhr.storage.tweet_id, dark_request: false },
                queryId: "VaenaVgh5q5ih7kvyVjgtg",
            });
        },
    },
    // Tweet replies: X answers /2/timeline/conversation with 404 since late October 2026, at api.x.com and at
    // x.com/i/api alike; asked with TweetDetail, as x.com does, and answered in the old shape
    {
        path: /\/2\/timeline\/conversation\/(\d+).json/,
        method: "GET",
        beforeRequest: (xhr) => {
            let originalUrl = new URL(xhr.originalUrl);
            xhr.storage.tweet_id = originalUrl.pathname.match(/\/2\/timeline\/conversation\/(\d+).json/)[1];
            xhr.modUrl = tweetDetailUrl(xhr.storage.tweet_id);
        },
        beforeSendHeaders: (xhr) => {
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];
        },
        afterRequest: (xhr) => {
            let data;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (e) {
                console.error(e);
                return data;
            }
            data = conversationTimeline(data);
            if ((data.errors && data.errors[0]) || !data.globalObjects) {
                return data;
            }
            for (let id in data.globalObjects.tweets) {
                let tweet = data.globalObjects.tweets[id];
                for (const status of [tweet, tweet.retweeted_status, tweet.quoted_status, tweet.retweeted_status?.quoted_status]) {
                    const card = parseTweetCard({ legacy: status?.card });
                    if (card) status.card = card;
                }

                if (!tweet.contributors) tweet.contributors = null;
                if (tweet.conversation_id_str)
                    tweet.conversation_id = parseInt(tweet.conversation_id_str);
                if (!tweet.coordinates) tweet.coordinates = null;
                if (!tweet.conversation_muted) tweet.conversation_muted = false;
                if (!tweet.favorited) tweet.favorited = false;
                if (!tweet.geo) tweet.geo = null;
                if (!tweet.id) tweet.id = parseInt(id);
                if (!tweet.in_reply_to_screen_name) tweet.in_reply_to_screen_name = null;
                if (!tweet.in_reply_to_status_id) tweet.in_reply_to_status_id = null;
                if (!tweet.in_reply_to_status_id_str) tweet.in_reply_to_status_id_str = null;
                if (!tweet.in_reply_to_user_id) tweet.in_reply_to_user_id = null;
                if (!tweet.in_reply_to_user_id_str) tweet.in_reply_to_user_id_str = null;
                if (!tweet.is_quote_status) tweet.is_quote_status = false;
                if (!tweet.place) tweet.place = null;
                if (!tweet.supplemental_language) tweet.supplemental_language = null;
                if (!tweet.retweeted) tweet.retweeted = false;
                if (!tweet.truncated) tweet.truncated = false;
                if (!tweet.user_id) tweet.user_id = parseInt(tweet.user_id_str);
            }

            for (let id in data.globalObjects.users) {
                let user = data.globalObjects.users[id];

                if (!user.default_profile) user.default_profile = false;
                if (!user.default_profile_image) user.default_profile_image = false;
                if (!user.entities) user.entities = {};
                if (!user.entities.description) user.entities.description = { urls: [] };
                if (!user.entities.description.urls) user.entities.description.urls = [];
                if (!user.entities.url) user.entities.url = { urls: [] };
                if (!user.entities.url.urls) user.entities.url.urls = [];
                if (!user.follow_request_sent) user.follow_request_sent = false;
                if (!user.following) user.following = false;
                if (!user.has_extended_profile) user.has_extended_profile = false;
                if (!user.is_translation_enabled) user.is_translation_enabled = false;
                if (!user.is_translator) user.is_translator = false;
                if (!user.followed_by) user.followed_by = false;
                if (!user.id) user.id = parseInt(id);
                if (!user.lang) user.lang = null;
                if (!user.notifications) user.notifications = false;
                if (!user.profile_background_color) user.profile_background_color = "C0DEED";
                if (!user.profile_background_image_url)
                    user.profile_background_image_url =
                        "http://abs.twimg.com/images/themes/theme1/bg.png";
                if (!user.profile_background_image_url_https)
                    user.profile_background_image_url_https =
                        "https://abs.twimg.com/images/themes/theme1/bg.png";
                if (!user.profile_background_tile) user.profile_background_tile = false;
                if (!user.profile_link_color) user.profile_link_color = "1DA1F2";
                if (!user.profile_image_url && user.profile_image_url_https)
                    user.profile_image_url = user.profile_image_url_https.replace(
                        "https://",
                        "http://"
                    );
                if (!user.profile_sidebar_border_color)
                    user.profile_sidebar_border_color = "000000";
                if (!user.profile_sidebar_fill_color) user.profile_sidebar_fill_color = "DDEEF6";
                if (!user.profile_text_color) user.profile_text_color = "333333";
                if (!user.profile_use_background_image) user.profile_use_background_image = true;
                if (!user.protected) user.protected = false;
                if (!user.require_some_consent) user.require_some_consent = false;
                if (!user.time_zone) user.time_zone = null;
                if (!user.utc_offset) user.utc_offset = null;
                if (!user.verified) user.verified = false;
            }

            let entries = data.timeline.instructions.find((i) => i.addEntries);
            if (entries) {
                entries.addEntries.entries = entries.addEntries.entries.filter(
                    (e) => !e.entryId.startsWith("tweetComposer-")
                );
                for (let entry of entries.addEntries.entries) {
                    if (entry.entryId.startsWith("conversationThread-")) {
                        let newContent = {
                            item: {
                                content: {
                                    conversationThread: {
                                        conversationComponents: [],
                                    },
                                },
                            },
                        };
                        if (entry.content.timelineModule.items)
                            for (let item of entry.content.timelineModule.items) {
                                if (item.item && item.item.content && item.item.content.tweet) {
                                    newContent.item.content.conversationThread.conversationComponents.push(
                                        {
                                            conversationTweetComponent: {
                                                tweet: item.item.content.tweet,
                                            },
                                        }
                                    );
                                }
                            }
                        entry.content = newContent;
                    }
                }
            }

            return data;
        },
    },
    // getting user
    {
        path: "/1.1/account/verify_credentials.json",
        method: "GET",
        beforeRequest: (xhr) => {
            // xhr.modUrl = `https://x.com/home/`;
        },
        beforeSendHeaders: (xhr) => {
            // delete xhr.modReqHeaders["Content-Type"];
            // delete xhr.modReqHeaders["X-Twitter-Active-User"];
            // delete xhr.modReqHeaders["X-Twitter-Client-Language"];
            // delete xhr.modReqHeaders["X-Twitter-Auth-Type"];
            // delete xhr.modReqHeaders["Authorization"];
            // delete xhr.modReqHeaders["X-Csrf-Token"];
            xhr.storage.user_id = xhr.modReqHeaders["x-act-as-user-id"];
            xhr.modReqHeaders["Content-Type"] = "application/json";
            xhr.modReqHeaders["X-Twitter-Active-User"] = "yes";
            xhr.modReqHeaders["X-Twitter-Client-Language"] = "en";
            xhr.modReqHeaders["Authorization"] =
                PUBLIC_TOKENS[0];
            delete xhr.modReqHeaders["X-Twitter-Client-Version"];

        },
        afterRequest: (xhr) => {
            const data = JSON.parse(xhr.responseText);
            try {
                if(!xhr.storage.user_id && !data.errors) {
                    localStorage.OTDverifiedUser = JSON.stringify(data);
                    verifiedUser = data;
                } 
            } catch (e) {
                console.error('error parsing verified user', e);
            }
            return data;
        },
        // afterRequest: (xhr) => {
        //     try {
        //         const state = extractAssignedJSON(xhr.responseText);
        //         const user_id = state.session.user_id;
        //         const user = state.entities.users.entities[user_id];
        //         if(!user) {
        //             console.error(`User not found: ${JSON.stringify(state)}`);
        //             if(localStorage.OTDverifiedUser) {
        //                 try {
        //                     verifiedUser = JSON.parse(localStorage.OTDverifiedUser);
        //                     console.warn("Using verified user from localStorage");
        //                     return verifiedUser;
        //                 } catch (e) {}
        //             }
        //             throw new Error('User not found');
        //         }
        //         verifiedUser = user;
        //         localStorage.OTDverifiedUser = JSON.stringify(user);
        //         return user;
        //     } catch (e) {
        //         console.error(`Failed to get user data`, e);
        //         return null;
        //     }
        // }
    },
    // DM messages
    {
        path: /\/1.1\/dm\/conversation\/(\d+)-(\d+).json/,
        method: "GET",
        afterRequest: (xhr) => {
            return xhr.responseText.replaceAll("\\/\\/ton.twitter.com\\/1.1", "\\/\\/ton.x.com\\/i");
        }
    },
    // Inbox
    {
        path: "/1.1/dm/user_updates.json",
        method: "GET",
        afterRequest: (xhr) => {
            return xhr.responseText.replaceAll("\\/\\/ton.twitter.com\\/1.1", "\\/\\/ton.x.com\\/i");
        }
    },
    // TweetDeck state
    {
        path: "/1.1/tweetdeck/clients/blackbird/all",
        method: "GET",
        openHandler: () => {},
        sendHandler: emulateResponse,
        afterRequest: (xhr) => {
            const state = {
                client: {
                    columns: localStorage.OTDcolumnIds ? JSON.parse(localStorage.OTDcolumnIds) : [],
                    mtime: new Date().toISOString(),
                    name: "blackbird",
                    settings: settings ?? {
                        account_whitelist: [`twitter:${verifiedUser.id_str}`],
                        default_account: `twitter:${verifiedUser.id_str}`,
                        recent_searches: [],
                        display_sensitive_media: false,
                        name_cache: {
                            customTimelines: {},
                            lists: {},
                            users: {}
                        },
                        navbar_width: "full-size",
                        previous_splash_version: "4.0.220811153004",
                        show_search_filter_callout: false,
                        show_trends_filter_callout: false,
                        theme: "light",
                        use_narrow_columns: null,
                        version: 2
                    },
                },
                columns: columns ?? {},
                decider: {},
                feeds: feeds ?? {},
                messages: [],
                new: true
            };
            if(!settings) {
                settings = state.client.settings;
                localStorage.OTDsettings = JSON.stringify(settings);
            }
            cleanUp();
            console.log('account state', state);

            return state;
        },
    },
    // emulate sending state data
    {
        path: "/1.1/tweetdeck/clients/blackbird",
        method: "POST",
        responseHeaderOverride: {
            "x-td-mtime": () => {
                return new Date().toISOString();
            },
        },
        openHandler: () => {},
        sendHandler: emulateResponse,
        beforeSendBody: (xhr, body) => {
            let json = JSON.parse(body);
            console.log('state push', json);
            if(json.columns) {
                localStorage.OTDcolumnIds = JSON.stringify(json.columns);
            }
            if(json.settings && settings) {
                for(let key in json.settings) {
                    settings[key] = json.settings[key];
                }
                localStorage.OTDsettings = JSON.stringify(settings);
            }
            cleanUp();
            return body;
        },
        afterRequest: (xhr) => {
            return "";
        }
    },
    // emulate sending feeds
    {
        path: "/1.1/tweetdeck/feeds",
        method: "POST",
        responseHeaderOverride: {
            "X-Td-Mtime": () => {
                return new Date().toISOString();
            },
        },
        openHandler: () => {},
        sendHandler: emulateResponse,
        beforeSendBody: (xhr, body) => {
            let json = JSON.parse(body);
            let ids = [];
            for(let i = 0; i < json.length; i++) {
                const id = json[i].id ?? generateID();
                ids.push(id);
                feeds[id] = json[i];
            }
            xhr.storage.ids = ids;
            localStorage.OTDfeeds = JSON.stringify(feeds);
            console.log('feeds push', json, ids);
            return body;
        },
        afterRequest: (xhr) => {
            return xhr.storage.ids;
        }
    },
    // emulate sending columns
    {
        path: "/1.1/tweetdeck/columns",
        method: "POST",
        responseHeaderOverride: {
            "X-Td-Mtime": () => {
                return new Date().toISOString();
            },
        },
        openHandler: () => {},
        sendHandler: emulateResponse,
        beforeSendBody: (xhr, body) => {
            let json = JSON.parse(body);
            let ids = [];
            for(let i = 0; i < json.length; i++) {
                const id = json[i].id ?? generateID();
                ids.push(id);
                columns[id] = json[i];
            }
            xhr.storage.ids = ids;
            localStorage.OTDcolumns = JSON.stringify(columns);
            console.log('columns push', json, ids);
            return body;
        },
        afterRequest: (xhr) => {
            return xhr.storage.ids;
        }
    },
    // tweetdeck stuff
    {
        path: "/decider",
        method: "GET",
        openHandler: () => {},
        sendHandler: emulateResponse,
        afterRequest: (xhr) => {
            console.log("Got decider");
            // machine_translated_tweets off: TweetDeck's own "Translate Tweet", Microsoft's translation, isn't offered;
            // Grok's (grok-translate.js) translates tweets
            return {"decider":{"tweetdeck_subsequent_follows":true,"scheduler_write":true,"in_reply_to_indicator":true,"enable_cors_firefox":true,"create_moment":true,"simplified_edit_collection_flow":true,"suggest_refresh":true,"poll_streamed_feed_favorites":true,"disable_oauth_echo":true,"scheduler_read_visible":true,"upload_big_gifs":true,"cookie_force_migrate":true,"action_retweeted_retweet":true,"native_animated_gifs":true,"touchdeck_sidebar_v2":true,"account_settings_join_team_flow":true,"enable_rewrite_columns":true,"touchdeck_font_size_v2":true,"touchdeck_search_v2":true,"disable_typeahead_search_with_feather_v2":true,"dataminr_proxied_auth_flow":true,"disable_streaming":true,"abuse_emergency_filter_info":true,"poll_streamed_feed_home":true,"compose_quoted_tweet_as_attachment":true,"send_twitter_auth_type_header":true,"dataminr":true,"heartfave_animation":true,"touchdeck_column_options_v2":true,"tweets_emoji":true,"column_unread_bar":true,"with_video_upload":true,"continuous_pipeline_staging":true,"universal_search_timelines":true,"machine_translated_tweets":false,"hashflags":true,"scheduler_read_background":true,"cookie_streaming":true,"poll_streamed_feed_usertweets":true,"faster_notifications":true,"disable_scheduled_messages":true,"streamed_chirp_lookup_metrics":true,"tweet_up_to_four_images":true,"sample_failed_requests":true,"iq_tweets":true,"add_column_by_url_query_param":true,"use_twitter_api_sync":true,"track_search_engagement":true,"quote_tweet_read":true,"cookie_access_tweetdeck":true,"account_settings_redesign":true,"windows_migration_logged_in_2":true,"tweetstorms":true,"action_favorited_retweet":true,"tweetdeck_subsequent_likes":true,"touchdeck_tweet_controls_v3":true,"trends_tailored":true,"live_video_timelines":true,"slow_collection_refresh":true,"fetch_entire_blocklist":true,"report_flow_iframe":true,"tweet_hide_suffix":true,"windows_migration_warning_2":true,"version_poll_force_upgrade":true,"quote_tweet_write":true,"poll_cards_enabled":true,"version_poll":true,"migrate_chrome_app_session_to_web":true,"add_account":true,"disable_quote_tweet_unavailable_msg":true,"convert_new_oauth_account_to_contributor":true,"iq_rts":true,"migrate_mac_app_session_to_web_gt_3_9_482":true,"enable_cors_2":true,"windows_migration_logged_out_2":true,"simplified_replies":true,"scheduler_write_media":true,"multi_photo_media_grid":true,"touchdeck_modals_v2":true,"non_destructive_chirp_rerender":true,"touchdeck_dropdowns_v2":true,"umf_prompts":true,"cramming":true,"trends_regional":true,"cookie_td_cookie_migration":true,"universal_search_timelines_by_id":true,"add_account_via_xauth_2":true,"native_video":true,"chirp_lateness_metric":true,"upload_use_sru":true,"mute_conversation":true,"action_quoted_tweet":true,"dm_rounded_avatars":true,"compose_character_limit_do_not_count_attachments":true,"touchdeck_compose_v2":true,"autocomplete_remote_sources":true,"cards_enabled_detail_view":true}};
        },
    },
    {
        path: "/web/dist/version.json",
        method: "GET",
        openHandler: () => {},
        sendHandler: emulateResponse,
        afterRequest: (xhr) => {
            console.log("Got version.json");
            return {"version":"4.0.220811153004","minimum":"4.0.190610153508"};
        },
    },
    {
        path: "/1.1/help/settings.json",
        method: "GET",
        openHandler: () => {},
        sendHandler: emulateResponse,
        afterRequest: (xhr) => {
            console.log("Got settings.json");
            return {"versions":{"feature_switches":"a6da3a3fb61e9c1423276a8df0da3258980b42cf","experiments":"a6da3a3fb61e9c1423276a8df0da3258980b42cf","settings":"a88b5266c59f52ccf8a8f1fd85f2b92a"},"config":{"live_engagement_in_column_8020":{"value":"live_engagement_enabled"},"tweetdeck_activity_streaming":{"value":false},"tweetdeck_content_render_search_tweets":{"value":true},"tweetdeck_live_engagements":{"value":true},"tweetdeck_scheduled_new_api":{"value":true},"tweetdeck_trends_column":{"value":true},"twitter_text_emoji_counting_enabled":{"value":true}},"impression_pointers":{}};
        },
    },
    // X answers 410 Gone since October 2026. TweetDeck falls back on its own defaults then; they are answered
    // here instead, the values compose counts characters with, without asking.
    {
        path: "/1.1/help/configuration.json",
        method: "GET",
        openHandler: () => {},
        sendHandler: emulateResponse,
        afterRequest: (xhr) => {
            return {
                dm_text_character_limit: 10000,
                characters_reserved_per_media: 23,
                max_media_per_upload: 1,
                photo_size_limit: 3145728,
                photo_sizes: {
                    thumb: { h: 150, resize: "crop", w: 150 },
                    small: { h: 480, resize: "fit", w: 340 },
                    medium: { h: 1200, resize: "fit", w: 600 },
                    large: { h: 2048, resize: "fit", w: 1024 },
                },
                short_url_length: 23,
                transformedURLLength: 23,
            };
        },
    },
    {
        path: "/i/jot",
        method: "GET",
        openHandler: () => {},
        sendHandler: emulateResponse,
        afterRequest: (xhr) => {
            return "";
        },
    },
];

// X is retiring api.x.com: an address there it stopped answering is asked at x.com's own /i/api from then on,
// as x.com itself asks (replies were the first, October 2026). Learned from X's answers: 410, a 404 without
// X's JSON errors, or twice no answer at all (its errors come without CORS headers) move an address; 404 or
// 410 at /i/api moves it back. Kept in localStorage.OTDmovedApi, by path with ids as {id}.
const movedApi = new Set();
try {
    JSON.parse(localStorage.OTDmovedApi || "[]").forEach(key => movedApi.add(key));
} catch (e) {}
const unansweredApi = {};
let otdRequests = 0;
const stuckApi = new Set();
function oldApiKey(url) {
    try {
        let u = new URL(url);
        if (!/^api\.(x|twitter)\.com$/.test(u.hostname) || !/^\/(1\.1|2)\//.test(u.pathname)) return null;
        return u.pathname.replace(/\d{5,}/g, "{id}");
    } catch (e) {
        return null;
    }
}
function learnApi(key, moved, status, body) {
    let gone = status === 410 || (status === 404 && !/"errors"\s*:/.test(body || "")) || status === 0;
    if (!gone) {
        delete unansweredApi[key];
        return;
    }
    if (moved) {
        if (status === 0) return;
        movedApi.delete(key);
        stuckApi.add(key);
    } else {
        if (status === 0 && (unansweredApi[key] = (unansweredApi[key] || 0) + 1) < 2) return;
        if (stuckApi.has(key) || movedApi.has(key)) return;
        movedApi.add(key);
    }
    localStorage.OTDmovedApi = JSON.stringify([...movedApi]);
    console.warn(`[otd] ${key} ${moved ? "isn't at x.com/i/api either, back to api.x.com" : "is gone from api.x.com, asking x.com/i/api"}`);
    document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "moved", key, moved: !moved }) }));
}

// wrap the XMLHttpRequest
XMLHttpRequest = function () {
    return new Proxy(new OriginalXHR(), {
        // async is true when it isn't given, as XMLHttpRequest has it; passing undefined on would make it false
        open(method, url, async = true, username = null, password = null) {
            this.modMethod = method;
            this.modUrl = url;
            this.originalUrl = url;
            this.modReqHeaders = {};
            this.storage = {};


            try {
                let parsedUrl = new URL(url);
                this.proxyRoute = proxyRoutes.find((route) => {
                    if(!route) return false;
                    if (route.method.toUpperCase() !== method.toUpperCase()) return false;
                    if (typeof route.path === "string") {
                        return route.path === parsedUrl.pathname;
                    } else if (route.path instanceof RegExp) {
                        return route.path.test(parsedUrl.pathname);
                    }
                });
            } catch (e) {
                console.error(e);
            }
            if (this.proxyRoute && this.proxyRoute.beforeRequest) {
                this.proxyRoute.beforeRequest(this);
            }
            this.apiKey = oldApiKey(this.modUrl);
            this.apiMoved = !!this.apiKey && movedApi.has(this.apiKey);
            if (this.apiMoved) {
                let u = new URL(this.modUrl);
                this.modUrl = `https://${location.hostname}/i/api${u.pathname}${u.search}`;
            }
            if (this.apiKey) {
                this.addEventListener("load", () => {
                    let body = "";
                    try {
                        body = this.responseText;
                    } catch (e) {}
                    learnApi(this.apiKey, this.apiMoved, this.status, body);
                });
                this.addEventListener("error", () => learnApi(this.apiKey, this.apiMoved, 0));
            }
            // for the load watchdog (watchdog.js): what went to X and how X answered, without the query
            if (/^https:\/\/([a-z]+\.)?(x|twitter)\.com\//.test(url)) {
                this.otdId = ++otdRequests;
                this.addEventListener("loadend", () => {
                    document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "response", id: this.otdId, method, url: String(url).split("?")[0], status: this.status }) }));
                });
            }

            // both handlers must be set, because if openHandler never opens the request 'send' will always error
            if(this.proxyRoute && this.proxyRoute.openHandler && this.proxyRoute.sendHandler) {
                this.proxyRoute.openHandler(this, this.modMethod, this.modUrl, async, username, password);
            } else {
                this.open(this.modMethod, this.modUrl, async, username, password);
            }
        },
        setRequestHeader(name, value) {
            this.modReqHeaders[name] = value;
        },
        async send(body = null) {
            let parsedUrl = new URL(this.modUrl);
            let method = this.modMethod;
            if(!method) {
                method = "GET";
            } else {
                method = method.toUpperCase();
            }
            if(
                this.readyState === 1 &&
                (
                    this.modUrl.includes("api.twitter.com") || 
                    this.modUrl.includes("api.x.com") || 
                    this.modUrl.includes("twitter.com/i/api") ||
                    this.modUrl.includes("x.com/i/api")
                )
            ) {
                if(localStorage.device_id) this.setRequestHeader('X-Client-UUID', localStorage.device_id);
                if(Date.now() - OTD_INIT_TIME < 3000 && !window.solveChallenge) {
                    console.log('waiting for challenge');
                    let i = 0;
                    while(!window.solveChallenge && i++ < 50) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                if(window.solveChallenge) {
                    try {
                        this.setRequestHeader('x-client-transaction-id', await solveChallenge(parsedUrl.pathname, method));
                    } catch (e) {
                        // if(localStorage.secureRequests) {
                            console.error(`Challenge error for ${method} ${parsedUrl.pathname}:`, e);
                            document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "response", id: this.otdId, method, url: `${parsedUrl.origin}${parsedUrl.pathname}`, status: 0, error: String(e) }) }));
                            throw e;
                        // }
                    }
                }
            }
            if (this.proxyRoute && this.proxyRoute.beforeSendHeaders) {
                this.proxyRoute.beforeSendHeaders(this);
            }
            try {
                for (const [name, value] of Object.entries(this.modReqHeaders)) {
                    this.setRequestHeader(name, value);
                }
            } catch(e) {
                if(!String(e).includes('OPENED')) {
                    console.error(e);
                }
            }
            if (this.proxyRoute && this.proxyRoute.beforeSendBody) {
                body = this.proxyRoute.beforeSendBody(this, body);
            }
            if(this.proxyRoute && this.proxyRoute.sendHandler) {
                this.proxyRoute.sendHandler(this, body);
            } else {
                if (this.otdId) {
                    document.dispatchEvent(new CustomEvent("otd-diagnostic", { detail: JSON.stringify({ kind: "request", id: this.otdId, method, url: `${parsedUrl.origin}${parsedUrl.pathname}` }) }));
                }
                this.send(body);
            }
        },
        get(xhr, key) {
            if (!key in xhr) return undefined;
            if (key === "responseText" && xhr._responseText) return xhr._responseText;
            if (key === "responseText") return this.interceptResponseText(xhr);
            if (key === "readyState" && xhr._readyState) return xhr._readyState;
            if (key === "status" && xhr._status) return xhr._status;
            if (key === "statusText" && (xhr._statusText || xhr._status)) return xhr._statusText ? xhr._statusText : xhr._status+"";

            let value = xhr[key];
            if (typeof value === "function") {
                value = this[key] || value;
                return (...args) => value.apply(xhr, args);
            } else {
                return value;
            }
        },
        set(xhr, key, value) {
            if (key in xhr) {
                xhr[key] = value;
            }
            return value;
        },
        interceptResponseText(xhr) {
            if (xhr.proxyRoute && xhr.proxyRoute.afterRequest) {
                let out = xhr.proxyRoute.afterRequest(xhr);
                if (typeof out === "object") {
                    return JSON.stringify(out);
                } else {
                    return out;
                }
            }
            return xhr.responseText;
        },
        getResponseHeader(name) {
            let override = this.responseHeaderOverride ? this.responseHeaderOverride : this.proxyRoute ? this.proxyRoute.responseHeaderOverride : undefined;
            if(this.proxyRoute && override) {
                for(let header in override) {
                    if(header.toLowerCase() === name.toLowerCase()) {
                        return override[header](this.getResponseHeader(header));
                    }
                }
            }
            return this.getResponseHeader(name);
        },
        getAllResponseHeaders() {
            let headers = this.getAllResponseHeaders();

            let override = this.responseHeaderOverride ? this.responseHeaderOverride : this.proxyRoute ? this.proxyRoute.responseHeaderOverride : undefined;
            if (this.proxyRoute && override) {
                let splitHeaders = headers.split("\r\n");
                let objHeaders = {};
                for (let header of splitHeaders) {
                    let splitHeader = header.split(": ");
                    let headerName = splitHeader[0];
                    let headerValue = splitHeader[1];
                    objHeaders[headerName.toLowerCase()] = headerValue;
                }
                for(let header in override) {
                    objHeaders[header.toLowerCase()] = override[header](objHeaders[header.toLowerCase()], objHeaders);
                }
                headers = Object.entries(objHeaders).filter(([_, value]) => value).map(([name, value]) => `${name}: ${value}`).join("\r\n");
            }

            return headers;
        },
    });
};
