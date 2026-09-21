/* Twitter Feed — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var FANOUT = 200; // average followers written per tweet (fanout-on-write)
  var READ_RATIO = 50; // timeline reads per tweet
  var TWEET_CAP = 5000; // tweets/s per tweet-service node
  var STORE_CAP = 4000; // durable tweet writes/s per store partition
  var FANOUT_CAP = 20000; // timeline-cache writes/s per fanout worker
  var CACHE_CAP = 100000; // timeline ops/s per Redis node
  var FEED_CAP = 20000; // timeline reads/s per feed-service node
  var TARGET = 0.7;

  function name(k) {
    return { tweetsvc: "Tweet service", store: "Tweet store", fanout: "Fanout workers", cache: "Timeline cache", feedsvc: "Feed service" }[k] || "Component";
  }

  function compute(state, tweets, h) {
    var fmt = h.fmt, pct = h.pct;
    var fanoutWrites = tweets * FANOUT;
    var reads = tweets * READ_RATIO;

    var svcUtil = tweets / (state.tweetsvc * TWEET_CAP);
    var storeUtil = tweets / (state.store * STORE_CAP);
    var fanoutUtil = fanoutWrites / (state.fanout * FANOUT_CAP);
    var cacheUtil = (fanoutWrites + reads) / (state.cache * CACHE_CAP);
    var feedUtil = reads / (state.feedsvc * FEED_CAP);

    var utils = { tweetsvc: svcUtil, store: storeUtil, fanout: fanoutUtil, cache: cacheUtil, feedsvc: feedUtil };
    var required = {
      tweetsvc: Math.max(1, Math.ceil(tweets / (TWEET_CAP * TARGET))),
      store: Math.max(1, Math.ceil(tweets / (STORE_CAP * TARGET))),
      fanout: Math.max(1, Math.ceil(fanoutWrites / (FANOUT_CAP * TARGET))),
      cache: Math.max(1, Math.ceil((fanoutWrites + reads) / (CACHE_CAP * TARGET))),
      feedsvc: Math.max(1, Math.ceil(reads / (FEED_CAP * TARGET))),
    };

    var bottleneck = null, worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });

    var narration;
    if (bottleneck && worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(worst) + " — timelines lag and feeds go stale." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(tweets) + " tweets/s → " + fmt(fanoutWrites) + " timeline writes/s and " + fmt(reads) + " reads/s, all within capacity." };

    return {
      load: { users: tweets, tweetsvc: tweets, store: tweets, fanout: fanoutWrites, cache: fanoutWrites + reads, feedsvc: reads, readers: reads },
      edgeFlow: { "users-tweetsvc": tweets, "tweetsvc-store": tweets, "store-fanout": tweets, "fanout-cache": fanoutWrites, "feedsvc-cache": reads, "readers-feedsvc": reads },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        users: fmt(tweets) + " /s",
        tweetsvc: "×" + state.tweetsvc + " · " + pct(svcUtil),
        store: "×" + state.store + " · " + pct(storeUtil),
        fanout: "×" + state.fanout + " · " + pct(fanoutUtil),
        cache: "×" + state.cache + " · " + pct(cacheUtil),
        feedsvc: "×" + state.feedsvc + " · " + pct(feedUtil),
        readers: fmt(reads) + " /s",
      },
      metrics: [
        { key: "t", label: "Tweets/s", value: fmt(tweets), level: "ok" },
        { key: "f", label: "Timeline writes/s", value: fmt(fanoutWrites), level: "ok" },
        { key: "r", label: "Reads/s", value: fmt(reads), level: "ok" },
        { key: "svc", label: "Tweet svc util", value: pct(svcUtil), level: svcUtil >= 1 ? "danger" : svcUtil >= TARGET ? "warn" : "ok" },
        { key: "st", label: "Store util", value: pct(storeUtil), level: storeUtil >= 1 ? "danger" : storeUtil >= TARGET ? "warn" : "ok" },
        { key: "fn", label: "Fanout util", value: pct(fanoutUtil), level: fanoutUtil >= 1 ? "danger" : fanoutUtil >= TARGET ? "warn" : "ok" },
        { key: "ca", label: "Cache util", value: pct(cacheUtil), level: cacheUtil >= 1 ? "danger" : cacheUtil >= TARGET ? "warn" : "ok" },
        { key: "fd", label: "Feed util", value: pct(feedUtil), level: feedUtil >= 1 ? "danger" : feedUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".twitter-feed-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Tweets", default: 1,
          options: [
            { label: "100 /s", value: 100 }, { label: "1,000 /s", value: 1000 }, { label: "5,000 /s", value: 5000 },
            { label: "10,000 /s", value: 10000 }, { label: "50,000 /s", value: 50000 }, { label: "200,000 /s", value: 200000 },
          ],
        },
        target: TARGET,
        aria: "Twitter feed architecture under load",
        note: "Fanout-on-write pushes each tweet to follower timelines (×" + FANOUT + " here), which is what makes the celebrity problem explosive; reads are served from the precomputed timeline cache. Fanout-on-read avoids the write amplification but makes reads expensive.",
        nodes: [
          { id: "users", label: "Users", icon: "👥", kind: "client", x: 60, y: 300, capacity: null, min: 1 },
          { id: "tweetsvc", label: "Tweet svc", icon: "🐦", kind: "service", x: 250, y: 300, capacity: TWEET_CAP, scaleLabel: "service node", min: 1, count: 2,
            fail: "every tweet is accepted and validated here.", why: "The tweet service is stateless; more nodes split the writes." },
          { id: "store", label: "Tweet store", icon: "🗄️", kind: "db", x: 440, y: 300, capacity: STORE_CAP, scaleLabel: "store partition", min: 1, count: 1,
            fail: "durable tweet writes are the source of truth.", why: "Partition the tweet store so writes spread across shards." },
          { id: "fanout", label: "Fanout workers", icon: "🛠️", kind: "worker", x: 630, y: 300, capacity: FANOUT_CAP, scaleLabel: "fanout worker", min: 1, count: 1,
            fail: "one tweet becomes " + FANOUT + " timeline writes — the write amplification.", why: "More fanout workers drain the fan-out backlog faster." },
          { id: "cache", label: "Timeline cache", icon: "⚡", kind: "cache", x: 820, y: 300, capacity: CACHE_CAP, scaleLabel: "Redis node", min: 1, count: 1,
            fail: "timelines take both fan-out writes and feed reads.", why: "Shard timelines across more Redis nodes." },
          { id: "feedsvc", label: "Feed svc", icon: "📰", kind: "service", x: 1010, y: 300, capacity: FEED_CAP, scaleLabel: "feed node", min: 1, count: 2,
            fail: "reads are far more frequent than writes.", why: "Serve reads from more feed-service nodes." },
          { id: "readers", label: "Readers", icon: "📱", kind: "client", x: 1180, y: 300, capacity: null, min: 1 },
        ],
        edges: [
          { from: "users", to: "tweetsvc", kind: "write" },
          { from: "tweetsvc", to: "store", kind: "write" },
          { from: "store", to: "fanout", kind: "queue" },
          { from: "fanout", to: "cache", kind: "write" },
          { from: "feedsvc", to: "cache", kind: "read" },
          { from: "readers", to: "feedsvc", kind: "read" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
