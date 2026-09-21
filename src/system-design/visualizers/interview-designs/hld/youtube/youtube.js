/* YouTube — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var UPLOAD_RATIO = 1 / 1000; // uploads per view
  var RENDITIONS = 5; // transcoded renditions per upload
  var ORIGIN_MISS = 0.05; // CDN misses that reach the origin
  var META_READ = 0.1; // metadata reads per view
  var CDN_CAP = 200000; // segment requests/s per CDN edge
  var OBJ_CAP = 50000; // origin ops/s per store shard
  var METADATA_CAP = 20000; // metadata ops/s per node
  var TRANSCODE_CAP = 5; // transcode jobs/s per worker cluster
  var UPLOAD_CAP = 500; // uploads/s per upload node
  var TARGET = 0.7;

  function name(k) {
    return { cdn: "CDN edges", objstore: "Origin storage", transcode: "Transcode workers", metadata: "Metadata", uploadsvc: "Upload service" }[k] || "Component";
  }

  function compute(state, views, h) {
    var fmt = h.fmt, pct = h.pct;
    var uploads = Math.max(1, Math.round(views * UPLOAD_RATIO));
    var transcodes = uploads * RENDITIONS;

    var cdnUtil = views / (state.cdn * CDN_CAP);
    var objUtil = (uploads * (1 + RENDITIONS) + views * ORIGIN_MISS) / (state.objstore * OBJ_CAP);
    var transcodeUtil = transcodes / (state.transcode * TRANSCODE_CAP);
    var metaUtil = (uploads + views * META_READ) / (state.metadata * METADATA_CAP);
    var uploadUtil = uploads / (state.uploadsvc * UPLOAD_CAP);

    var utils = { cdn: cdnUtil, objstore: objUtil, transcode: transcodeUtil, metadata: metaUtil, uploadsvc: uploadUtil };
    var required = {
      cdn: Math.max(1, Math.ceil(views / (CDN_CAP * TARGET))),
      objstore: Math.max(1, Math.ceil((uploads * (1 + RENDITIONS) + views * ORIGIN_MISS) / (OBJ_CAP * TARGET))),
      transcode: Math.max(1, Math.ceil(transcodes / (TRANSCODE_CAP * TARGET))),
      metadata: Math.max(1, Math.ceil((uploads + views * META_READ) / (METADATA_CAP * TARGET))),
      uploadsvc: Math.max(1, Math.ceil(uploads / (UPLOAD_CAP * TARGET))),
    };

    var bottleneck = null, worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });

    var narration;
    if (bottleneck && worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(worst) + " — playback stalls or transcodes back up." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(views) + " views/s (CDN) and " + fmt(uploads) + " uploads/s (" + fmt(transcodes) + " transcode jobs/s), all within capacity." };

    return {
      load: { viewers: views, cdn: views, objstore: uploads * (1 + RENDITIONS) + views * ORIGIN_MISS, metadata: uploads + views * META_READ, uploaders: uploads, uploadsvc: uploads, transcode: transcodes },
      edgeFlow: {
        "viewers-cdn": views, "cdn-objstore": views * ORIGIN_MISS, "viewers-metadata": views * META_READ,
        "uploaders-uploadsvc": uploads, "uploadsvc-objstore": uploads, "objstore-transcode": uploads, "transcode-objstore": transcodes, "uploadsvc-metadata": uploads,
      },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        viewers: fmt(views) + " /s",
        cdn: "×" + state.cdn + " · " + pct(cdnUtil),
        objstore: "×" + state.objstore + " · " + pct(objUtil),
        metadata: "×" + state.metadata + " · " + pct(metaUtil),
        uploaders: fmt(uploads) + " /s",
        uploadsvc: "×" + state.uploadsvc + " · " + pct(uploadUtil),
        transcode: "×" + state.transcode + " · " + pct(transcodeUtil),
      },
      metrics: [
        { key: "v", label: "Views/s", value: fmt(views), level: "ok" },
        { key: "u", label: "Uploads/s", value: fmt(uploads), level: "ok" },
        { key: "t", label: "Transcode jobs/s", value: fmt(transcodes), level: "ok" },
        { key: "cd", label: "CDN util", value: pct(cdnUtil), level: cdnUtil >= 1 ? "danger" : cdnUtil >= TARGET ? "warn" : "ok" },
        { key: "ob", label: "Origin util", value: pct(objUtil), level: objUtil >= 1 ? "danger" : objUtil >= TARGET ? "warn" : "ok" },
        { key: "tr", label: "Transcode util", value: pct(transcodeUtil), level: transcodeUtil >= 1 ? "danger" : transcodeUtil >= TARGET ? "warn" : "ok" },
        { key: "me", label: "Metadata util", value: pct(metaUtil), level: metaUtil >= 1 ? "danger" : metaUtil >= TARGET ? "warn" : "ok" },
        { key: "up", label: "Upload util", value: pct(uploadUtil), level: uploadUtil >= 1 ? "danger" : uploadUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".youtube-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Views", default: 2,
          options: [
            { label: "10,000 /s", value: 10000 }, { label: "100,000 /s", value: 100000 }, { label: "1M /s", value: 1000000 },
            { label: "10M /s", value: 10000000 }, { label: "100M /s", value: 100000000 }, { label: "1B /s", value: 1000000000 },
          ],
        },
        target: TARGET,
        aria: "YouTube architecture under load",
        note: "Views dwarf uploads (×" + (1 / UPLOAD_RATIO) + "); playback is served from the CDN with only " + (ORIGIN_MISS * 100) + "% reaching the origin. Uploads are resumable and durable, then fan out to " + RENDITIONS + " renditions asynchronously in the transcode pipeline.",
        nodes: [
          { id: "viewers", label: "Viewers", icon: "👥", kind: "client", x: 70, y: 110, capacity: null, min: 1 },
          { id: "cdn", label: "CDN edges", icon: "🌐", kind: "cache", x: 300, y: 110, capacity: CDN_CAP, scaleLabel: "CDN edge", min: 1, count: 1,
            fail: "millions of segment requests land on the edge.", why: "Add CDN edges/regions to absorb the view load." },
          { id: "metadata", label: "Metadata", icon: "🗂️", kind: "db", x: 70, y: 300, capacity: METADATA_CAP, scaleLabel: "metadata node", min: 1, count: 1,
            fail: "metadata and manifests are read per view and written per upload.", why: "Shard metadata by videoId and add read replicas." },
          { id: "uploaders", label: "Uploaders", icon: "🎬", kind: "client", x: 70, y: 490, capacity: null, min: 1 },
          { id: "uploadsvc", label: "Upload svc", icon: "⬆️", kind: "service", x: 300, y: 490, capacity: UPLOAD_CAP, scaleLabel: "upload node", min: 1, count: 1,
            fail: "resumable uploads are large and bandwidth-heavy.", why: "Upload nodes are stateless; more nodes spread the bandwidth." },
          { id: "transcode", label: "Transcode", icon: "🎛️", kind: "worker", x: 530, y: 490, capacity: TRANSCODE_CAP, scaleLabel: "worker cluster", min: 1, count: 1,
            fail: "transcoding is CPU-heavy and asynchronous; the backlog delays publishing.", why: "Scale transcode workers on queue depth." },
          { id: "objstore", label: "Object storage", icon: "🗄️", kind: "db", x: 760, y: 300, capacity: OBJ_CAP, scaleLabel: "store shard", min: 1, count: 1,
            fail: "origin serves CDN misses and stores raw + rendition segments.", why: "Object storage scales horizontally; add shards/regions." },
        ],
        edges: [
          { from: "viewers", to: "cdn", kind: "read" },
          { from: "cdn", to: "objstore", kind: "read" },
          { from: "viewers", to: "metadata", kind: "read" },
          { from: "uploaders", to: "uploadsvc", kind: "write" },
          { from: "uploadsvc", to: "objstore", kind: "write" },
          { from: "objstore", to: "transcode", kind: "queue" },
          { from: "transcode", to: "objstore", kind: "write" },
          { from: "uploadsvc", to: "metadata", kind: "write" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
