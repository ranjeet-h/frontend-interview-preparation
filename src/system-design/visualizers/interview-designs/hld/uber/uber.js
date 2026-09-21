/* Uber — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var MATCH_RATIO = 0.04; // ride requests per location update
  var GEO_QUERIES = 10; // index queries per match (expanding radius)
  var INGEST_CAP = 20000; // location writes/s per ingest node
  var GEO_CAP = 50000; // index ops/s per shard
  var MATCH_CAP = 2000; // matches/s per matching node
  var DISPATCH_CAP = 10000; // offers/s per dispatch worker
  var TRIP_CAP = 5000; // trip writes/s per partition
  var PRICING_CAP = 5000; // fare computations/s per pricing node
  var TARGET = 0.7;

  function name(k) {
    return { ingest: "Location ingest", geo: "Geospatial index", matching: "Matching service", dispatch: "Dispatch", trip: "Trip store", pricing: "Pricing" }[k] || "Component";
  }

  function compute(state, updates, h) {
    var fmt = h.fmt, pct = h.pct;
    var matches = Math.max(1, Math.round(updates * MATCH_RATIO));
    var geoOps = updates + matches * GEO_QUERIES;

    var ingestUtil = updates / (state.ingest * INGEST_CAP);
    var geoUtil = geoOps / (state.geo * GEO_CAP);
    var matchUtil = matches / (state.matching * MATCH_CAP);
    var dispatchUtil = matches / (state.dispatch * DISPATCH_CAP);
    var tripUtil = matches / (state.trip * TRIP_CAP);
    var pricingUtil = matches / (state.pricing * PRICING_CAP);

    var utils = { ingest: ingestUtil, geo: geoUtil, matching: matchUtil, dispatch: dispatchUtil, trip: tripUtil, pricing: pricingUtil };
    var required = {
      ingest: Math.max(1, Math.ceil(updates / (INGEST_CAP * TARGET))),
      geo: Math.max(1, Math.ceil(geoOps / (GEO_CAP * TARGET))),
      matching: Math.max(1, Math.ceil(matches / (MATCH_CAP * TARGET))),
      dispatch: Math.max(1, Math.ceil(matches / (DISPATCH_CAP * TARGET))),
      trip: Math.max(1, Math.ceil(matches / (TRIP_CAP * TARGET))),
      pricing: Math.max(1, Math.ceil(matches / (PRICING_CAP * TARGET))),
    };

    var bottleneck = null, worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });

    var narration;
    if (bottleneck && worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(worst) + " — locations drop and matches slow down." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(updates) + " location writes/s → " + fmt(matches) + " matches/s; index and matching stay within capacity." };

    return {
      load: { drivers: updates, riders: matches, ingest: updates, geo: geoOps, matching: matches, dispatch: matches, trip: matches, pricing: matches },
      edgeFlow: { "drivers-ingest": updates, "ingest-geo": updates, "matching-geo": matches * GEO_QUERIES, "riders-matching": matches, "matching-dispatch": matches, "matching-trip": matches, "matching-pricing": matches },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        drivers: fmt(updates) + " /s",
        riders: fmt(matches) + " req/s",
        ingest: "×" + state.ingest + " · " + pct(ingestUtil),
        geo: "×" + state.geo + " · " + pct(geoUtil),
        matching: "×" + state.matching + " · " + pct(matchUtil),
        dispatch: "×" + state.dispatch + " · " + pct(dispatchUtil),
        trip: "×" + state.trip + " · " + pct(tripUtil),
        pricing: "×" + state.pricing + " · " + pct(pricingUtil),
      },
      metrics: [
        { key: "u", label: "Location writes/s", value: fmt(updates), level: "ok" },
        { key: "m", label: "Matches/s", value: fmt(matches), level: "ok" },
        { key: "in", label: "Ingest util", value: pct(ingestUtil), level: ingestUtil >= 1 ? "danger" : ingestUtil >= TARGET ? "warn" : "ok" },
        { key: "ge", label: "Index util", value: pct(geoUtil), level: geoUtil >= 1 ? "danger" : geoUtil >= TARGET ? "warn" : "ok" },
        { key: "ma", label: "Matching util", value: pct(matchUtil), level: matchUtil >= 1 ? "danger" : matchUtil >= TARGET ? "warn" : "ok" },
        { key: "di", label: "Dispatch util", value: pct(dispatchUtil), level: dispatchUtil >= 1 ? "danger" : dispatchUtil >= TARGET ? "warn" : "ok" },
        { key: "tr", label: "Trip util", value: pct(tripUtil), level: tripUtil >= 1 ? "danger" : tripUtil >= TARGET ? "warn" : "ok" },
        { key: "pr", label: "Pricing util", value: pct(pricingUtil), level: pricingUtil >= 1 ? "danger" : pricingUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".uber-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Location updates", default: 2,
          options: [
            { label: "100,000 /s", value: 100000 }, { label: "500,000 /s", value: 500000 }, { label: "1.25M /s", value: 1250000 },
            { label: "5M /s", value: 5000000 }, { label: "10M /s", value: 10000000 }, { label: "50M /s", value: 50000000 },
          ],
        },
        target: TARGET,
        aria: "Uber architecture under load",
        note: "Location is a best-effort firehose of latest-only positions into a sharded in-memory geo index; ride requests are far rarer and drive matching, dispatch, the trip store, and pricing. Matching is city-local and assignment is an atomic compare-and-set with a lease.",
        nodes: [
          { id: "drivers", label: "Drivers", icon: "🚗", kind: "client", x: 70, y: 320, capacity: null, min: 1 },
          { id: "riders", label: "Riders", icon: "🧍", kind: "client", x: 70, y: 120, capacity: null, min: 1 },
          { id: "ingest", label: "Location ingest", icon: "📍", kind: "service", x: 290, y: 320, capacity: INGEST_CAP, scaleLabel: "ingest node", min: 1, count: 2,
            fail: "every driver pings every few seconds — the hottest write path.", why: "Ingest is stateless; more nodes spread the location firehose." },
          { id: "geo", label: "Geo index", icon: "🗺️", kind: "cache", x: 520, y: 220, capacity: GEO_CAP, scaleLabel: "index shard", min: 1, count: 1,
            fail: "the in-memory index takes every write plus nearby-driver queries.", why: "Shard the index by geo cell so a cell's ops stay on one shard." },
          { id: "matching", label: "Matching", icon: "🧩", kind: "service", x: 750, y: 220, capacity: MATCH_CAP, scaleLabel: "matching node", min: 1, count: 2,
            fail: "each ride request runs an expanding-radius candidate search.", why: "Matching is stateless per city; more nodes split the searches." },
          { id: "dispatch", label: "Dispatch", icon: "📣", kind: "worker", x: 980, y: 100, capacity: DISPATCH_CAP, scaleLabel: "dispatch worker", min: 1, count: 1,
            fail: "offers must reach driver devices quickly and expire on time.", why: "More dispatch workers push offers faster." },
          { id: "trip", label: "Trip store", icon: "🗄️", kind: "db", x: 980, y: 320, capacity: TRIP_CAP, scaleLabel: "trip partition", min: 1, count: 1,
            fail: "trip assignment must be strongly consistent to avoid double-booking.", why: "Partition by cityId/rideId so trip writes spread across shards." },
          { id: "pricing", label: "Pricing", icon: "💱", kind: "external", x: 980, y: 540, capacity: PRICING_CAP, scaleLabel: "pricing node", min: 1, count: 1,
            fail: "fare estimation runs per request.", why: "Scale pricing nodes; fare rules are cached." },
        ],
        edges: [
          { from: "drivers", to: "ingest", kind: "write" },
          { from: "ingest", to: "geo", kind: "write" },
          { from: "matching", to: "geo", kind: "read" },
          { from: "riders", to: "matching", kind: "read" },
          { from: "matching", to: "dispatch", kind: "queue" },
          { from: "matching", to: "trip", kind: "write" },
          { from: "matching", to: "pricing", kind: "read" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
