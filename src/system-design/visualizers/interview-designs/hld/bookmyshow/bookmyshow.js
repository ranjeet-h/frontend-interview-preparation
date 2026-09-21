/* BookMyShow — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var BOOKING_RATIO = 1 / 500; // bookings per browse read
  var SEATS_PER_BOOKING = 3; // seat ops per booking (hold + confirm)
  var MISS_RATIO = 0.02; // cache-miss reads that reach the inventory store
  var CACHE_CAP = 100000; // browse reads/s per Redis node
  var BOOKING_CAP = 5000; // booking ops/s per booking-service node
  var INVENTORY_CAP = 20000; // seat ops/s per inventory partition
  var PAYMENT_CAP = 2000; // payment calls/s per payment connection
  var SWEEPER_CAP = 50000; // expiry checks/s per sweeper node
  var TARGET = 0.7;

  function name(k) {
    return { cache: "Discovery cache", booking: "Booking service", inventory: "Seat inventory", payment: "Payment gateway", sweeper: "Hold-expiry sweeper" }[k] || "Component";
  }

  function compute(state, reads, h) {
    var fmt = h.fmt, pct = h.pct;
    var bookings = Math.max(1, Math.round(reads * BOOKING_RATIO));
    var seatOps = bookings * SEATS_PER_BOOKING;
    var missReads = reads * MISS_RATIO;

    var cacheUtil = reads / (state.cache * CACHE_CAP);
    var bookingUtil = (bookings * SEATS_PER_BOOKING) / (state.booking * BOOKING_CAP);
    var inventoryUtil = (seatOps + missReads) / (state.inventory * INVENTORY_CAP);
    var paymentUtil = bookings / (state.payment * PAYMENT_CAP);
    var sweeperUtil = seatOps / (state.sweeper * SWEEPER_CAP);

    var utils = { cache: cacheUtil, booking: bookingUtil, inventory: inventoryUtil, payment: paymentUtil, sweeper: sweeperUtil };
    var required = {
      cache: Math.max(1, Math.ceil(reads / (CACHE_CAP * TARGET))),
      booking: Math.max(1, Math.ceil((bookings * SEATS_PER_BOOKING) / (BOOKING_CAP * TARGET))),
      inventory: Math.max(1, Math.ceil((seatOps + missReads) / (INVENTORY_CAP * TARGET))),
      payment: Math.max(1, Math.ceil(bookings / (PAYMENT_CAP * TARGET))),
      sweeper: Math.max(1, Math.ceil(seatOps / (SWEEPER_CAP * TARGET))),
    };

    var bottleneck = null, worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });

    var narration;
    if (bottleneck && worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(worst) + " — discovery lags or bookings fail." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(reads) + " browse reads/s → " + fmt(bookings) + " bookings/s (" + fmt(seatOps) + " seat ops/s); inventory stays atomic." };

    return {
      load: { users: reads, cache: reads, booking: bookings * SEATS_PER_BOOKING, inventory: seatOps + missReads, sweeper: seatOps, payment: bookings },
      edgeFlow: { "users-cache": reads, "cache-inventory": missReads, "users-booking": bookings, "booking-inventory": seatOps, "inventory-sweeper": seatOps, "booking-payment": bookings },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        users: fmt(reads) + " reads/s",
        cache: "×" + state.cache + " · " + pct(cacheUtil),
        booking: "×" + state.booking + " · " + pct(bookingUtil),
        inventory: "×" + state.inventory + " · " + pct(inventoryUtil),
        sweeper: "×" + state.sweeper + " · " + pct(sweeperUtil),
        payment: "×" + state.payment + " · " + pct(paymentUtil),
      },
      metrics: [
        { key: "r", label: "Browse reads/s", value: fmt(reads), level: "ok" },
        { key: "b", label: "Bookings/s", value: fmt(bookings), level: "ok" },
        { key: "s", label: "Seat ops/s", value: fmt(seatOps), level: "ok" },
        { key: "ca", label: "Cache util", value: pct(cacheUtil), level: cacheUtil >= 1 ? "danger" : cacheUtil >= TARGET ? "warn" : "ok" },
        { key: "bk", label: "Booking util", value: pct(bookingUtil), level: bookingUtil >= 1 ? "danger" : bookingUtil >= TARGET ? "warn" : "ok" },
        { key: "inv", label: "Inventory util", value: pct(inventoryUtil), level: inventoryUtil >= 1 ? "danger" : inventoryUtil >= TARGET ? "warn" : "ok" },
        { key: "pay", label: "Payment util", value: pct(paymentUtil), level: paymentUtil >= 1 ? "danger" : paymentUtil >= TARGET ? "warn" : "ok" },
        { key: "sw", label: "Sweeper util", value: pct(sweeperUtil), level: sweeperUtil >= 1 ? "danger" : sweeperUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".bookmyshow-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Browse reads", default: 2,
          options: [
            { label: "10,000 /s", value: 10000 }, { label: "100,000 /s", value: 100000 }, { label: "500,000 /s", value: 500000 },
            { label: "1M /s", value: 1000000 }, { label: "5M /s", value: 5000000 }, { label: "20M /s", value: 20000000 },
          ],
        },
        target: TARGET,
        aria: "BookMyShow architecture under load",
        note: "Discovery is read-heavy and served from cache; bookings are rare but must be atomic. A seat hold is a short lease on the inventory partition (atomic compare-and-set prevents oversell); the sweeper releases expired holds. Payment is a separate boundary called only after a hold succeeds.",
        nodes: [
          { id: "users", label: "Users", icon: "👥", kind: "client", x: 70, y: 300, capacity: null, min: 1 },
          { id: "cache", label: "Discovery cache", icon: "⚡", kind: "cache", x: 300, y: 130, capacity: CACHE_CAP, scaleLabel: "Redis node", min: 1, count: 1,
            fail: "browse traffic dwarfs booking traffic.", why: "Serve discovery reads from more Redis nodes." },
          { id: "booking", label: "Booking svc", icon: "🎟️", kind: "service", x: 300, y: 300, capacity: BOOKING_CAP, scaleLabel: "booking node", min: 1, count: 2,
            fail: "each booking holds seats atomically before payment.", why: "The booking service is stateless; more nodes split holds." },
          { id: "inventory", label: "Seat inventory", icon: "🗄️", kind: "db", x: 570, y: 300, capacity: INVENTORY_CAP, scaleLabel: "inventory partition", min: 1, count: 1,
            fail: "seat state must be atomic to prevent oversell.", why: "Partition inventory by showId so seat ops spread across shards." },
          { id: "sweeper", label: "Hold sweeper", icon: "⏱️", kind: "worker", x: 570, y: 130, capacity: SWEEPER_CAP, scaleLabel: "sweeper node", min: 1, count: 1,
            fail: "expired holds must be released to free seats.", why: "More sweepers release expired leases faster." },
          { id: "payment", label: "Payment", icon: "💳", kind: "external", x: 830, y: 300, capacity: PAYMENT_CAP, scaleLabel: "payment connection", min: 1, count: 1,
            fail: "the gateway enforces its own call rate.", why: "Add payment connections / use multiple gateways." },
        ],
        edges: [
          { from: "users", to: "cache", kind: "read" },
          { from: "cache", to: "inventory", kind: "read" },
          { from: "users", to: "booking", kind: "write" },
          { from: "booking", to: "inventory", kind: "write" },
          { from: "inventory", to: "sweeper", kind: "queue" },
          { from: "booking", to: "payment", kind: "write" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
