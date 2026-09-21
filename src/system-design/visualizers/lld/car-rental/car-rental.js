/* Car Rental (LLD) visualizer: availability timeline + reservation lifecycle +
   pricing/overage policies, with the shared LLD design lens. Prefix: crv-. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var DAYS = 14, LEFT = 110, TOP = 44, DAY_W = 42, ROW_H = 44;
  var VW = LEFT + DAYS * DAY_W + 20;
  var VH = TOP + 4 * ROW_H + 20;
  var VEHICLES = [
    { id: "ECON-1", type: "Economy" },
    { id: "ECON-2", type: "Economy" },
    { id: "SUV-1", type: "SUV" },
    { id: "SUV-2", type: "SUV" },
  ];
  var RATES = { Economy: 4000, SUV: 7000 };
  var DAMAGE_FEE = 15000;
  var CUSTOMERS = ["Alice", "Bob", "Carol", "Dave"];

  function money(c) { return "$" + (c / 100).toFixed(2); }
  function dayX(d) { return LEFT + (d - 1) * DAY_W; }
  function rowY(i) { return TOP + i * ROW_H; }

  function build(container) {
    var uid = "crv" + build.count;
    build.count += 1;
    container.classList.add("crv");

    var inst = {
      uid: uid,
      container: container,
      reservations: [],
      seq: 0,
      revenue: 0,
      selected: null,
      speed: 1,
      timer: null,
      strategy: { pricing: "daily", overage: "charge" },
      lens: null,
      lastDecision: "Pick a category and dates, then Reserve. Overlapping requests try another car.",
      bad: false,
    };

    var dayOpts = "";
    for (var d = 1; d <= DAYS; d++) dayOpts += '<option value="' + d + '">' + d + "</option>";

    var header = "";
    for (var i = 1; i <= DAYS; i++) header += '<text class="crv-day" x="' + (dayX(i) + DAY_W / 2) + '" y="24" text-anchor="middle">' + i + "</text>";
    var grid = "";
    for (var g = 1; g <= DAYS; g++) grid += '<line class="crv-gridline" x1="' + dayX(g) + '" y1="' + TOP + '" x2="' + dayX(g) + '" y2="' + (TOP + 4 * ROW_H) + '"></line>';
    var rows = VEHICLES.map(function (v, idx) {
      return '<rect class="crv-rowbg" x="' + LEFT + '" y="' + rowY(idx) + '" width="' + (DAYS * DAY_W) + '" height="' + ROW_H + '"></rect>' +
        '<rect class="crv-free" x="' + LEFT + '" y="' + (rowY(idx) + 6) + '" width="' + (DAYS * DAY_W) + '" height="' + (ROW_H - 12) + '" rx="4"></rect>' +
        '<text class="crv-vlabel" x="12" y="' + (rowY(idx) + 20) + '">' + v.id + "</text>" +
        '<text class="crv-vtype" x="12" y="' + (rowY(idx) + 34) + '">' + v.type + "</text>";
    }).join("");

    container.innerHTML =
      '<div class="crv-toolbar">' +
      '<button type="button" class="crv-btn crv-primary crv-play">▶ Play</button>' +
      '<button type="button" class="crv-btn crv-reset">Reset</button>' +
      '<span class="crv-sep"></span>' +
      '<label class="crv-field">Category <select class="crv-select crv-cat"><option>Economy</option><option>SUV</option></select></label>' +
      '<label class="crv-field">From <select class="crv-select crv-start">' + dayOpts + "</select></label>" +
      '<label class="crv-field">To <select class="crv-select crv-end">' + dayOpts + "</select></label>" +
      '<button type="button" class="crv-btn crv-primary crv-reserve">Reserve</button>' +
      '<span class="crv-sep"></span>' +
      '<button type="button" class="crv-btn crv-pickup">Pick up</button>' +
      '<label class="crv-field">Return <select class="crv-select crv-rmode"><option value="ontime">on time</option><option value="late">late (+1 day)</option><option value="damaged">damaged</option></select></label>' +
      '<button type="button" class="crv-btn crv-return">Return</button>' +
      "</div>" +
      '<div class="crv-stage"><svg class="crv-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Fleet availability timeline">' +
      header + grid + rows + '<g data-bars></g></svg></div>' +
      '<div class="crv-caption" role="status" aria-live="polite"></div>' +
      '<div class="crv-metrics">' +
      metric("Fleet", "fleet") + metric("Active", "active") + metric("Utilization", "util") + metric("Revenue", "rev") +
      "</div>" +
      '<div class="crv-legend">' +
      '<span><i class="crv-dot" style="background:#2563eb"></i>reserved</span>' +
      '<span><i class="crv-dot" style="background:#f59e0b"></i>picked up</span>' +
      '<span><i class="crv-dot" style="background:#16a34a"></i>returned</span>' +
      "</div>" +
      '<div class="crv-lens" data-lens></div>' +
      '<p class="crv-hint">The invariant: a vehicle has <b>at most one active reservation</b> for any date. <b>DateRange.overlaps</b> is a half-open check, so a rental ending on day 14 and one starting day 14 do not conflict.</p>';

    container.querySelector(".crv-reserve").addEventListener("click", function () {
      reserve(inst, container.querySelector(".crv-cat").value,
        parseInt(container.querySelector(".crv-start").value, 10),
        parseInt(container.querySelector(".crv-end").value, 10));
    });
    container.querySelector(".crv-pickup").addEventListener("click", function () { pickUp(inst); });
    container.querySelector(".crv-return").addEventListener("click", function () { returnRes(inst, container.querySelector(".crv-rmode").value); });
    container.querySelector(".crv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".crv-reset").addEventListener("click", function () { reset(inst); });
    container.addEventListener("click", function (e) {
      var g = e.target.closest ? e.target.closest("[data-res]") : null;
      if (g) { inst.selected = g.getAttribute("data-res"); inst.bad = false; inst.lastDecision = "Selected " + inst.selected + "."; render(inst); }
    });

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="crv-metric"><span class="crv-metric-label">' + label + '</span><span class="crv-metric-value" data-metric="' + key + '">–</span></div>';
  }
  function overlaps(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }
  function vehicleById(id) { return VEHICLES.filter(function (v) { return v.id === id; })[0]; }

  function findAvailable(inst, type, start, end) {
    var active = inst.reservations.filter(function (r) { return r.status !== "returned"; });
    var candidates = VEHICLES.filter(function (v) { return v.type === type; });
    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i];
      var clash = active.some(function (r) { return r.vehicleId === v.id && overlaps(r.start, r.end, start, end); });
      if (!clash) return v;
    }
    return null;
  }

  function reserve(inst, type, start, end) {
    if (end <= start) { inst.bad = true; inst.lastDecision = "Invalid range: return day must be after pickup day."; render(inst); return; }
    var v = findAvailable(inst, type, start, end);
    if (!v) { inst.bad = true; inst.lastDecision = "No " + type + " available for days " + start + "–" + end + " — every car overlaps."; render(inst); return; }
    inst.seq += 1;
    var res = { id: "R" + inst.seq, vehicleId: v.id, customer: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)], start: start, end: end, status: "reserved", price: 0 };
    inst.reservations.push(res);
    inst.selected = res.id;
    inst.bad = false;
    inst.lastDecision = "Reserved " + v.id + " for " + res.customer + ", days " + start + "–" + end + " (AvailabilityService found no overlap).";
    trace(inst, ["Reservation"], [
      { cls: "AvailabilityService", method: "findAvailable" },
      { cls: "DateRange", method: "overlaps" },
      { cls: "Reservation", method: "new" },
    ]);
    render(inst);
  }

  function pickUp(inst) {
    var r = inst.reservations.filter(function (x) { return x.id === inst.selected; })[0];
    if (!r) { inst.bad = true; inst.lastDecision = "Select a reservation first."; render(inst); return; }
    if (r.status !== "reserved") { inst.bad = true; inst.lastDecision = r.id + " is " + r.status + " — cannot pick up."; render(inst); return; }
    r.status = "pickedUp"; inst.bad = false;
    inst.lastDecision = r.id + " picked up (" + r.vehicleId + "). Status RESERVED → PICKED_UP.";
    trace(inst, ["Reservation"], [{ cls: "Reservation", method: "pickUp" }]);
    render(inst);
  }

  function priceOf(inst, r, late, damaged) {
    var v = vehicleById(r.vehicleId);
    var days = r.end - r.start;
    var rate = RATES[v.type];
    var base = days * rate;
    if (inst.strategy.pricing === "weekly" && days >= 7) base = Math.round(base * 0.9);
    var overage = late && inst.strategy.overage === "charge" ? rate : 0;
    var damage = damaged ? DAMAGE_FEE : 0;
    return { base: base, overage: overage, damage: damage, total: base + overage + damage };
  }

  function returnRes(inst, mode) {
    var r = inst.reservations.filter(function (x) { return x.id === inst.selected; })[0];
    if (!r) { inst.bad = true; inst.lastDecision = "Select a reservation first."; render(inst); return; }
    if (r.status !== "pickedUp") { inst.bad = true; inst.lastDecision = r.id + " is " + r.status + " — pick it up before returning."; render(inst); return; }
    var late = mode === "late", damaged = mode === "damaged";
    var p = priceOf(inst, r, late, damaged);
    r.status = "returned";
    r.price = p.total;
    inst.revenue += p.total;
    inst.bad = false;
    inst.lastDecision = "Returned " + r.id + ": base " + money(p.base) +
      (p.overage ? " + overage " + money(p.overage) : "") +
      (p.damage ? " + damage " + money(p.damage) : "") +
      " = " + money(p.total) + " (PricingStrategy = " + inst.strategy.pricing + ").";
    trace(inst, ["Reservation", "PricingStrategy"], [
      { cls: "Reservation", method: "return_" },
      { cls: "PricingStrategy", method: "priceFor" },
      { cls: "Inspection", method: "new" },
      { cls: "PaymentService", method: "charge" },
    ]);
    render(inst);
  }

  function trace(inst, _u, steps) {
    if (!inst.lens) return;
    inst._traced = true;
    var active = {};
    steps.forEach(function (s) { active[s.cls] = true; });
    inst.lens.setActive(Object.keys(active));
    inst.lens.setTrace(steps);
  }

  function tick(inst) {
    var roll = Math.random();
    var active = inst.reservations.filter(function (r) { return r.status !== "returned"; });
    if (roll < 0.55) {
      var type = Math.random() < 0.5 ? "Economy" : "SUV";
      var start = 1 + Math.floor(Math.random() * (DAYS - 3));
      var len = 2 + Math.floor(Math.random() * 5);
      reserve(inst, type, start, Math.min(DAYS, start + len));
    } else if (roll < 0.8) {
      var res = active.filter(function (r) { return r.status === "reserved"; });
      if (res.length) { inst.selected = res[Math.floor(Math.random() * res.length)].id; pickUp(inst); }
    } else {
      var picked = active.filter(function (r) { return r.status === "pickedUp"; });
      if (picked.length) {
        inst.selected = picked[Math.floor(Math.random() * picked.length)].id;
        returnRes(inst, Math.random() < 0.25 ? "late" : "ontime");
      }
    }
  }

  function play(inst) {
    if (inst.timer) return;
    var b = inst.container.querySelector(".crv-play");
    if (b) b.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 1100 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var b = inst.container.querySelector(".crv-play");
    if (b) b.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }
  function reset(inst) {
    pause(inst);
    inst.reservations = []; inst.seq = 0; inst.revenue = 0; inst.selected = null;
    inst.lastDecision = "Reset."; render(inst);
  }

  function render(inst) {
    var c = inst.container;
    var bars = c.querySelector("[data-bars]");
    bars.innerHTML = inst.reservations.map(function (r) {
      var idx = VEHICLES.map(function (v) { return v.id; }).indexOf(r.vehicleId);
      var x = dayX(r.start), w = (r.end - r.start) * DAY_W, y = rowY(idx) + 6, h = ROW_H - 12;
      var cls = r.status === "reserved" ? "is-reserved" : r.status === "pickedUp" ? "is-picked" : "is-returned";
      return '<g class="crv-bar ' + cls + (inst.selected === r.id ? " is-selected" : "") + '" data-res="' + r.id + '">' +
        '<rect class="crv-barrect" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="5"></rect>' +
        '<text class="crv-bartext" x="' + (x + 6) + '" y="' + (y + h / 2 + 4) + '">' + r.id + " " + r.customer + "</text></g>";
    }).join("");

    var active = inst.reservations.filter(function (r) { return r.status !== "returned"; });
    var bookedDays = active.reduce(function (s, r) { return s + (r.end - r.start); }, 0);
    var cap = c.querySelector(".crv-caption");
    cap.textContent = inst.lastDecision;
    cap.className = "crv-caption" + (inst.bad ? " is-bad" : "");

    setMetric(c, "fleet", VEHICLES.length);
    setMetric(c, "active", active.length);
    setMetric(c, "util", Math.round((bookedDays / (VEHICLES.length * DAYS)) * 100) + "%");
    setMetric(c, "rev", money(inst.revenue));

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["AvailabilityService", "Reservation"]);
      inst.lens.setTrace([{ cls: "AvailabilityService", method: "findAvailable" }]);
    }
    inst._traced = false;
  }

  function setMetric(c, key, value) {
    var el = c.querySelector('[data-metric="' + key + '"]');
    if (el) el.textContent = value;
  }

  function lensConfig(inst) {
    return {
      classes: [
        { id: "Branch", label: "Branch", stereotype: "class", x: 150, y: 90, owns: "Its fleet of vehicles.", fields: ["id", "vehicles: Vehicle[]"] },
        { id: "Vehicle", label: "Vehicle", stereotype: "class", x: 150, y: 260, owns: "Identity and category only — it does not know reservations.", fields: ["id", "type", "homeBranch"] },
        { id: "VehicleType", label: "VehicleType", stereotype: "enum", x: 150, y: 430, owns: "Value object.", fields: ["ECONOMY", "SUV", "VAN"] },
        { id: "Customer", label: "Customer", stereotype: "class", x: 150, y: 600, owns: "Identity.", fields: ["id", "name"] },
        { id: "Reservation", label: "Reservation", stereotype: "class", x: 440, y: 110,
          owns: "The booking record and its lifecycle.",
          fields: ["id", "vehicle", "customer", "range", "status"], methods: ["pickUp()", "return_(inspection)", "cancel()"] },
        { id: "DateRange", label: "DateRange", stereotype: "class", x: 440, y: 290, owns: "Half-open interval; owns the overlap rule.", fields: ["start", "end"], methods: ["overlaps(other)"] },
        { id: "ReservationStatus", label: "ReservationStatus", stereotype: "enum", x: 440, y: 460, owns: "Value object.", fields: ["RESERVED", "PICKED_UP", "RETURNED", "CANCELLED"] },
        { id: "Inspection", label: "Inspection", stereotype: "class", x: 440, y: 630, owns: "Return condition and damage fee.", fields: ["damaged", "notes", "fee"] },
        { id: "AvailabilityService", label: "AvailabilityService", stereotype: "class", x: 740, y: 110,
          owns: "The no-overlap invariant and vehicle assignment.",
          invariant: "No vehicle has two active reservations over overlapping dates.",
          methods: ["findAvailable(branch,type,range)"] },
        { id: "PricingStrategy", label: "PricingStrategy", stereotype: "interface", x: 740, y: 290, owns: "Prices a reservation.", methods: ["priceFor(reservation)"] },
        { id: "DailyPricing", label: "DailyPricing", stereotype: "class", x: 740, y: 460, owns: "Flat daily rate.", methods: ["priceFor()"] },
        { id: "WeeklyPricing", label: "WeeklyPricing", stereotype: "class", x: 740, y: 630, owns: "Weekly discount.", methods: ["priceFor()"] },
        { id: "PaymentService", label: "PaymentService", stereotype: "interface", x: 740, y: 800, owns: "Charge/refund boundary.", methods: ["charge(amount,key)", "refund(amount,key)"] },
      ],
      edges: [
        { from: "Branch", to: "Vehicle", kind: "composition" },
        { from: "Vehicle", to: "VehicleType", kind: "association" },
        { from: "Reservation", to: "Vehicle", kind: "association" },
        { from: "Reservation", to: "Customer", kind: "association" },
        { from: "Reservation", to: "DateRange", kind: "composition" },
        { from: "Reservation", to: "ReservationStatus", kind: "association" },
        { from: "Reservation", to: "Inspection", kind: "association" },
        { from: "AvailabilityService", to: "Reservation", kind: "depends" },
        { from: "AvailabilityService", to: "Vehicle", kind: "depends" },
        { from: "DailyPricing", to: "PricingStrategy", kind: "implements" },
        { from: "WeeklyPricing", to: "PricingStrategy", kind: "implements" },
        { from: "Reservation", to: "PricingStrategy", kind: "depends" },
        { from: "Reservation", to: "PaymentService", kind: "depends" },
      ],
      patterns: [
        { id: "state", label: "State", classes: ["Reservation", "ReservationStatus"],
          note: "A reservation's behavior depends on RESERVED / PICKED_UP / RETURNED. Illegal transitions (return before pickup) are refused by the state." },
        { id: "strategy", label: "Strategy", classes: ["PricingStrategy", "DailyPricing", "WeeklyPricing", "PaymentService"],
          note: "Pricing and payment vary independently of the lifecycle. Swap the pricing plan and watch the same reservation price differently." },
      ],
      strategyGroups: [
        { id: "pricing", label: "PricingStrategy", options: [
            { id: "daily", label: "Daily", note: "Flat daily rate: Economy $40/day, SUV $70/day." },
            { id: "weekly", label: "Weekly discount", note: "Rentals of 7+ days get 10% off the base." },
          ], default: "daily", classMap: { daily: "DailyPricing", weekly: "WeeklyPricing" },
          onChange: function (id) { inst.strategy.pricing = id; inst.lastDecision = "PricingStrategy = " + id + "."; render(inst); } },
        { id: "overage", label: "On late return", options: [
            { id: "charge", label: "Charge overage", note: "Add one extra day's rate for a late return." },
            { id: "waive", label: "Waive", note: "Goodwill policy: no late fee." },
          ], default: "charge", classMap: { charge: "Reservation", waive: "Reservation" },
          onChange: function (id) { inst.strategy.overage = id; inst.lastDecision = "Late-return policy = " + id + "."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["Branch", "Customer"], note: "Categories, date-range reservations, pickup/return, pricing, overage, damage." },
        { n: 2, label: "Core Entities", classes: ["Vehicle", "Reservation", "DateRange"], note: "Nouns: branch, vehicle, customer, reservation, inspection; enums for type/status." },
        { n: 3, label: "Responsibilities", classes: ["AvailabilityService", "Reservation"], note: "Availability owns the overlap rule; reservation owns its lifecycle; pricing is separate." },
        { n: 4, label: "Relationships + Interfaces", classes: ["PricingStrategy", "PaymentService"], note: "Has-a for fleet/reservation; interfaces at pricing and payment." },
        { n: 5, label: "Class Diagram", classes: ["Branch", "Vehicle", "Reservation", "DateRange"], note: "Fleet composition, reservation references, and the range value object." },
        { n: 6, label: "Core Flows", classes: ["AvailabilityService", "Reservation"], note: "Reserve (overlap check) → pickup → return (inspection, price, charge)." },
        { n: 7, label: "Critical Code", classes: ["DateRange", "AvailabilityService"], note: "overlaps() (half-open) and findAvailable() carry correctness." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["PricingStrategy", "PaymentService"], note: "Concurrent booking, late/damaged return, extension; new plans/providers = new implementations." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".car-rental-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
