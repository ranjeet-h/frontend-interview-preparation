/* Google Drive — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var UPLOAD_RATIO = 0.01; // uploads per sync op
  var CHUNKS = 8; // content chunks written per upload
  var SYNC_CAP = 20000; // sync ops/s per sync node
  var METADATA_CAP = 20000; // metadata ops/s per shard
  var CHANGELOG_CAP = 50000; // change-feed ops/s per partition
  var BLOB_CAP = 30000; // chunk writes/s per blob shard
  var TARGET = 0.7;

  function name(k) {
    return { syncsvc: "Sync service", metadata: "Metadata store", changelog: "Change feed", blobstore: "Blob storage" }[k] || "Component";
  }

  function compute(state, sync, h) {
    var fmt = h.fmt, pct = h.pct;
    var uploads = Math.max(1, Math.round(sync * UPLOAD_RATIO));
    var chunks = uploads * CHUNKS;

    var syncUtil = sync / (state.syncsvc * SYNC_CAP);
    var metaUtil = sync / (state.metadata * METADATA_CAP);
    var feedUtil = (sync + uploads) / (state.changelog * CHANGELOG_CAP);
    var blobUtil = chunks / (state.blobstore * BLOB_CAP);

    var utils = { syncsvc: syncUtil, metadata: metaUtil, changelog: feedUtil, blobstore: blobUtil };
    var required = {
      syncsvc: Math.max(1, Math.ceil(sync / (SYNC_CAP * TARGET))),
      metadata: Math.max(1, Math.ceil(sync / (METADATA_CAP * TARGET))),
      changelog: Math.max(1, Math.ceil((sync + uploads) / (CHANGELOG_CAP * TARGET))),
      blobstore: Math.max(1, Math.ceil(chunks / (BLOB_CAP * TARGET))),
    };

    var bottleneck = null, worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });

    var narration;
    if (bottleneck && worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(worst) + " — sync lags and uploads fail." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(sync) + " sync ops/s → " + fmt(uploads) + " uploads/s (" + fmt(chunks) + " chunk writes/s); metadata and feed stay within capacity." };

    return {
      load: { clients: sync, syncsvc: sync, metadata: sync, changelog: sync + uploads, blobstore: chunks },
      edgeFlow: { "clients-syncsvc": sync, "syncsvc-metadata": sync, "syncsvc-changelog": sync + uploads, "syncsvc-blobstore": chunks },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        clients: fmt(sync) + " ops/s",
        syncsvc: "×" + state.syncsvc + " · " + pct(syncUtil),
        metadata: "×" + state.metadata + " · " + pct(metaUtil),
        changelog: "×" + state.changelog + " · " + pct(feedUtil),
        blobstore: "×" + state.blobstore + " · " + pct(blobUtil),
      },
      metrics: [
        { key: "s", label: "Sync ops/s", value: fmt(sync), level: "ok" },
        { key: "u", label: "Uploads/s", value: fmt(uploads), level: "ok" },
        { key: "c", label: "Chunk writes/s", value: fmt(chunks), level: "ok" },
        { key: "sy", label: "Sync util", value: pct(syncUtil), level: syncUtil >= 1 ? "danger" : syncUtil >= TARGET ? "warn" : "ok" },
        { key: "me", label: "Metadata util", value: pct(metaUtil), level: metaUtil >= 1 ? "danger" : metaUtil >= TARGET ? "warn" : "ok" },
        { key: "fe", label: "Change feed util", value: pct(feedUtil), level: feedUtil >= 1 ? "danger" : feedUtil >= TARGET ? "warn" : "ok" },
        { key: "bl", label: "Blob util", value: pct(blobUtil), level: blobUtil >= 1 ? "danger" : blobUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".google-drive-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Sync ops", default: 2,
          options: [
            { label: "10,000 /s", value: 10000 }, { label: "100,000 /s", value: 100000 }, { label: "1M /s", value: 1000000 },
            { label: "10M /s", value: 10000000 }, { label: "50M /s", value: 50000000 }, { label: "200M /s", value: 200000000 },
          ],
        },
        target: TARGET,
        aria: "Google Drive architecture under load",
        note: "Metadata (tree, versions, permissions) is read-heavy and strongly consistent per file; content is content-addressed blobs in object storage. Devices sync by replaying a partitioned change feed from a cursor; concurrent edits are resolved by optimistic versioning into a conflict copy.",
        nodes: [
          { id: "clients", label: "Clients", icon: "💻", kind: "client", x: 70, y: 300, capacity: null, min: 1 },
          { id: "syncsvc", label: "Sync service", icon: "🔄", kind: "service", x: 290, y: 300, capacity: SYNC_CAP, scaleLabel: "sync node", min: 1, count: 2,
            fail: "every device polls for changes through the sync service.", why: "The sync service is stateless; more nodes split the polling." },
          { id: "metadata", label: "Metadata store", icon: "🗂️", kind: "db", x: 540, y: 180, capacity: METADATA_CAP, scaleLabel: "metadata shard", min: 1, count: 1,
            fail: "the file tree, versions, and permissions are read constantly.", why: "Shard metadata by ownerId/fileId and add read replicas." },
          { id: "changelog", label: "Change feed", icon: "📜", kind: "queue", x: 790, y: 300, capacity: CHANGELOG_CAP, scaleLabel: "feed partition", min: 1, count: 1,
            fail: "the append-only change feed is polled by every device.", why: "Partition the feed per user so polling is a cheap range read." },
          { id: "blobstore", label: "Blob storage", icon: "🗄️", kind: "db", x: 540, y: 420, capacity: BLOB_CAP, scaleLabel: "blob shard", min: 1, count: 1,
            fail: "large uploads write many content chunks.", why: "Blob storage scales horizontally and dedupes by content hash." },
        ],
        edges: [
          { from: "clients", to: "syncsvc", kind: "read" },
          { from: "syncsvc", to: "metadata", kind: "write" },
          { from: "syncsvc", to: "changelog", kind: "write" },
          { from: "syncsvc", to: "blobstore", kind: "write" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
