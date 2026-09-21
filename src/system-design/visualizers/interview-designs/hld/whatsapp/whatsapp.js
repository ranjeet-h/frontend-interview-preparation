/* WhatsApp — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var FANOUT = 3; // average recipient devices per accepted message
  var GATEWAY_CAP = 5000; // messages/s per WebSocket gateway node
  var DIRECTORY_CAP = 100000; // connection lookups/s per Redis node
  var API_CAP = 5000; // messages/s per message-API node
  var STORE_CAP = 4000; // durable writes/s per message-store partition
  var WORKER_CAP = 8000; // deliveries/s per delivery worker
  var TARGET = 0.7;

  function name(k) {
    return { gateway: "WebSocket gateways", directory: "Connection directory", api: "Message API", store: "Message store", workers: "Delivery workers" }[k] || "Component";
  }

  function compute(state, rps, h) {
    var fmt = h.fmt, pct = h.pct;
    var deliveries = rps * FANOUT;

    var gatewayUtil = rps / (state.gateway * GATEWAY_CAP);
    var directoryUtil = rps / (state.directory * DIRECTORY_CAP);
    var apiUtil = rps / (state.api * API_CAP);
    var storeUtil = rps / (state.store * STORE_CAP);
    var workerUtil = deliveries / (state.workers * WORKER_CAP);

    var utils = { gateway: gatewayUtil, directory: directoryUtil, api: apiUtil, store: storeUtil, workers: workerUtil };
    var required = {
      gateway: Math.max(1, Math.ceil(rps / (GATEWAY_CAP * TARGET))),
      directory: Math.max(1, Math.ceil(rps / (DIRECTORY_CAP * TARGET))),
      api: Math.max(1, Math.ceil(rps / (API_CAP * TARGET))),
      store: Math.max(1, Math.ceil(rps / (STORE_CAP * TARGET))),
      workers: Math.max(1, Math.ceil(deliveries / (WORKER_CAP * TARGET))),
    };

    var bottleneck = null, worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });

    var narration;
    if (bottleneck && worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(worst) + " — sends are queuing and deliveries are delayed." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(rps) + " messages/s accepted → " + fmt(deliveries) + " device deliveries/s, all within capacity." };

    return {
      load: { senders: rps, gateway: rps, directory: rps, api: rps, store: rps, workers: deliveries, recipients: deliveries },
      edgeFlow: { "senders-gateway": rps, "gateway-directory": rps, "gateway-api": rps, "api-store": rps, "store-workers": rps, "workers-recipients": deliveries },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        senders: fmt(rps) + " /s",
        gateway: "×" + state.gateway + " · " + pct(gatewayUtil),
        directory: "×" + state.directory + " · " + pct(directoryUtil),
        api: "×" + state.api + " · " + pct(apiUtil),
        store: "×" + state.store + " · " + pct(storeUtil),
        workers: "×" + state.workers + " · " + pct(workerUtil),
        recipients: fmt(deliveries) + " /s",
      },
      metrics: [
        { key: "m", label: "Messages/s", value: fmt(rps), level: "ok" },
        { key: "d", label: "Deliveries/s", value: fmt(deliveries), level: "ok" },
        { key: "gw", label: "Gateway util", value: pct(gatewayUtil), level: gatewayUtil >= 1 ? "danger" : gatewayUtil >= TARGET ? "warn" : "ok" },
        { key: "dir", label: "Directory util", value: pct(directoryUtil), level: directoryUtil >= 1 ? "danger" : directoryUtil >= TARGET ? "warn" : "ok" },
        { key: "api", label: "API util", value: pct(apiUtil), level: apiUtil >= 1 ? "danger" : apiUtil >= TARGET ? "warn" : "ok" },
        { key: "st", label: "Store util", value: pct(storeUtil), level: storeUtil >= 1 ? "danger" : storeUtil >= TARGET ? "warn" : "ok" },
        { key: "wrk", label: "Workers util", value: pct(workerUtil), level: workerUtil >= 1 ? "danger" : workerUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".whatsapp-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Messages", default: 2,
          options: [
            { label: "1,000 /s", value: 1000 }, { label: "10,000 /s", value: 10000 }, { label: "50,000 /s", value: 50000 },
            { label: "100,000 /s", value: 100000 }, { label: "500,000 /s", value: 500000 }, { label: "2M /s", value: 2000000 },
          ],
        },
        target: TARGET,
        aria: "WhatsApp architecture under load",
        note: "Messages are persisted once and assigned a conversation position, then delivered at least once (clients dedupe). The message store partitions by conversation; delivery fan-out multiplies by the average recipient devices (" + FANOUT + ").",
        nodes: [
          { id: "senders", label: "Senders", icon: "👥", kind: "client", x: 70, y: 300, capacity: null, min: 1 },
          { id: "directory", label: "Connection dir", icon: "⚡", kind: "cache", x: 270, y: 110, capacity: DIRECTORY_CAP, scaleLabel: "Redis node", min: 1, count: 1,
            fail: "every accepted message looks up a recipient's live connection.", why: "Shard the connection directory across more Redis nodes." },
          { id: "gateway", label: "WS gateways", icon: "🔌", kind: "service", x: 270, y: 300, capacity: GATEWAY_CAP, scaleLabel: "gateway node", min: 1, count: 2,
            fail: "gateways terminate every device connection and pass every message.", why: "Gateways are stateless for messaging; more nodes spread sockets and throughput." },
          { id: "api", label: "Message API", icon: "⚙️", kind: "service", x: 490, y: 300, capacity: API_CAP, scaleLabel: "API node", min: 1, count: 2,
            fail: "every send is validated, ordered, and persisted here.", why: "The API is stateless; more nodes split the writes." },
          { id: "store", label: "Message store", icon: "🗄️", kind: "db", x: 710, y: 300, capacity: STORE_CAP, scaleLabel: "store partition", min: 1, count: 1,
            fail: "durable writes per conversation are the source of truth.", why: "Partition by conversationId so writes spread across store partitions." },
          { id: "workers", label: "Delivery workers", icon: "🛠️", kind: "worker", x: 930, y: 300, capacity: WORKER_CAP, scaleLabel: "worker", min: 1, count: 1,
            fail: "fan-out deliveries multiply by recipients and can lag.", why: "More workers drain the outbox and fan out deliveries faster." },
          { id: "recipients", label: "Recipients", icon: "📲", kind: "client", x: 1140, y: 300, capacity: null, min: 1 },
        ],
        edges: [
          { from: "senders", to: "gateway", kind: "read" },
          { from: "gateway", to: "directory", kind: "cache" },
          { from: "gateway", to: "api", kind: "read" },
          { from: "api", to: "store", kind: "write" },
          { from: "store", to: "workers", kind: "queue" },
          { from: "workers", to: "recipients", kind: "write" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
