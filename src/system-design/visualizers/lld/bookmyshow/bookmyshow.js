/* BookMyShow (LLD) visualizer: seat holds, TTL expiry, atomic race, booking,
   with the shared LLD design lens. Prefix: bmv-. No dependencies. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var ROWS = 6, COLS = 8, SEAT_W = 44, SEAT_H = 34, GAP_X = 8, GAP_Y = 10, LEFT = 44, TOP = 34;
  var VW = LEFT + COLS * SEAT_W + (COLS - 1) * GAP_X + 44;
  var VH = TOP + ROWS * SEAT_H + (ROWS - 1) * GAP_Y + 20;
  var HOLD_TTL = 4;
  var USERS = { A: { name: "User A", color: "#2563eb" }, B: { name: "User B", color: "#16a34a" } };
  var ROW_LETTERS = "ABCDEF";

  function seatX(c) { return LEFT + c * (SEAT_W + GAP_X); }
  function seatY(r) { return TOP + r * (SEAT_H + GAP_Y); }
  function money(c) { return "$" + (c / 100).toFixed(2); }

  function makeSeats() {
    var seats = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        seats.push({ id: ROW_LETTERS[r] + (c + 1), row: r, col: c, status: "available", holder: null, expiresAt: 0 });
      }
    }
    return seats;
  }

  function build(container) {
    var uid = "bmv" + build.count;
    build.count += 1;
    container.classList.add("bmv");

    var inst = {
      uid: uid,
      container: container,
      seats: makeSeats(),
      clock: 0,
      acting: "A",
      selected: {},
      revenue: 0,
      bookings: 0,
      conflicts: 0,
      speed: 1,
      timer: null,
      strategy: { pricing: "standard", payment: "card" },
      lens: null,
      lastDecision: "Pick a user, click seats, then Hold → Pay & book. Holds expire on the clock.",
      bad: false,
    };

    var seatsSvg = inst.seats.map(function (s) {
      return (
        '<g class="bmv-seat" data-seat="' + s.id + '" transform="translate(' + seatX(s.col) + "," + seatY(s.row) + ')">' +
        '<rect class="bmv-seatrect" width="' + SEAT_W + '" height="' + SEAT_H + '" rx="7" fill="' + "var(--bmv-seat)" + '" data-seatrect="' + s.id + '"></rect>' +
        '<text class="bmv-seattext" x="' + SEAT_W / 2 + '" y="' + (SEAT_H / 2 + 4) + '" text-anchor="middle" data-seattext="' + s.id + '"></text>' +
        "</g>"
      );
    }).join("");

    var rowLabels = "";
    for (var r = 0; r < ROWS; r++) rowLabels += '<text class="bmv-rowlabel" x="20" y="' + (seatY(r) + 22) + '">' + ROW_LETTERS[r] + "</text>";

    container.innerHTML =
      '<div class="bmv-toolbar">' +
      '<button type="button" class="bmv-btn bmv-primary bmv-play">▶ Play</button>' +
      '<button type="button" class="bmv-btn bmv-hold">Hold</button>' +
      '<button type="button" class="bmv-btn bmv-primary bmv-pay">Pay &amp; book</button>' +
      '<button type="button" class="bmv-btn bmv-race">Race demo</button>' +
      '<button type="button" class="bmv-btn bmv-reset">Reset</button>' +
      '<span class="bmv-sep"></span>' +
      '<label class="bmv-field">Acting as <select class="bmv-select bmv-user"><option value="A">User A</option><option value="B">User B</option></select></label>' +
      "</div>" +
      '<div class="bmv-stage"><svg class="bmv-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Seat map">' +
      '<rect class="bmv-screen" x="' + LEFT + '" y="6" width="' + (COLS * SEAT_W + (COLS - 1) * GAP_X) + '" height="8" rx="4"></rect>' +
      '<text class="bmv-screen-text" x="' + (LEFT + (COLS * SEAT_W + (COLS - 1) * GAP_X) / 2) + '" y="28" text-anchor="middle">SCREEN</text>' +
      rowLabels + seatsSvg + "</svg></div>" +
      '<div class="bmv-readout">' +
      '<span class="bmv-userchip"><i class="bmv-dot" style="background:#2563eb"></i>User A</span>' +
      '<span class="bmv-userchip"><i class="bmv-dot" style="background:#16a34a"></i>User B</span>' +
      '<span>Clock <b data-clock>0</b> · hold TTL ' + HOLD_TTL + ' ticks</span>' +
      '<span>Selected <b data-selected>—</b></span>' +
      "</div>" +
      '<div class="bmv-caption" role="status" aria-live="polite"></div>' +
      '<div class="bmv-metrics">' +
      metric("Available", "avail") + metric("Held", "held") + metric("Booked", "booked") + metric("Revenue", "rev") + metric("Conflicts", "conf") +
      "</div>" +
      '<div class="bmv-legend"><span><i class="bmv-dot" style="background:var(--bmv-seat);border:1px solid var(--bmv-border)"></i>available</span>' +
      '<span><i class="bmv-dot" style="background:var(--bmv-held)"></i>held (dashed, expires)</span>' +
      '<span><i class="bmv-dot" style="background:#2563eb"></i>booked by A</span>' +
      '<span><i class="bmv-dot" style="background:#16a34a"></i>booked by B</span></div>' +
      '<div class="bmv-lens" data-lens></div>' +
      '<p class="bmv-hint"><b>tryHold</b> is an atomic compare-and-set: if the seat is not AVAILABLE the whole hold fails. That single check is the oversell guarantee.</p>';

    // ---- events -------------------------------------------------------------
    container.addEventListener("click", function (e) {
      var g = e.target.closest ? e.target.closest("[data-seat]") : null;
      if (g) selectSeat(inst, g.getAttribute("data-seat"));
    });
    container.querySelector(".bmv-user").addEventListener("change", function (e) {
      inst.acting = e.target.value; inst.selected = {}; inst.lastDecision = "Acting as " + USERS[inst.acting].name + "."; render(inst);
    });
    container.querySelector(".bmv-hold").addEventListener("click", function () { holdSelected(inst); });
    container.querySelector(".bmv-pay").addEventListener("click", function () { payAndBook(inst); });
    container.querySelector(".bmv-race").addEventListener("click", function () { raceDemo(inst); });
    container.querySelector(".bmv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".bmv-reset").addEventListener("click", function () {
      pause(inst);
      inst.seats = makeSeats(); inst.clock = 0; inst.selected = {}; inst.revenue = 0; inst.bookings = 0; inst.conflicts = 0;
      inst.lastDecision = "Reset."; render(inst);
    });

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="bmv-metric"><span class="bmv-metric-label">' + label + '</span><span class="bmv-metric-value" data-metric="' + key + '">–</span></div>';
  }
  function seatById(inst, id) { return inst.seats.filter(function (s) { return s.id === id; })[0]; }

  function selectSeat(inst, id) {
    var s = seatById(inst, id);
    if (!s) return;
    if (s.status === "booked") { inst.bad = true; inst.lastDecision = s.id + " is already BOOKED."; render(inst); return; }
    if (s.status === "held" && s.holder !== inst.acting) { inst.bad = true; inst.lastDecision = s.id + " is HELD by " + USERS[s.holder].name + " — not selectable."; render(inst); return; }
    inst.bad = false;
    if (inst.selected[id]) delete inst.selected[id]; else inst.selected[id] = true;
    render(inst);
  }

  // atomic compare-and-set — the oversell guarantee
  function tryHold(inst, seat, user) {
    if (seat.status !== "available") return false;
    seat.status = "held"; seat.holder = user; seat.expiresAt = inst.clock + HOLD_TTL;
    return true;
  }

  function holdSelected(inst) {
    var ids = Object.keys(inst.selected);
    if (!ids.length) { inst.bad = true; inst.lastDecision = "Select at least one seat first."; render(inst); return; }
    var held = [];
    for (var i = 0; i < ids.length; i++) {
      var s = seatById(inst, ids[i]);
      if (tryHold(inst, s, inst.acting)) held.push(s.id);
      else { held.forEach(function (id) { var h = seatById(inst, id); h.status = "available"; h.holder = null; }); inst.conflicts += 1; inst.bad = true; inst.lastDecision = "Hold failed: " + s.id + " was taken. All-or-nothing, released " + held.length + " seat(s)."; render(inst); return; }
    }
    inst.selected = {};
    inst.lastDecision = USERS[inst.acting].name + " held " + held.join(", ") + " for " + HOLD_TTL + " ticks (SeatHold created).";
    trace(inst, ["ShowSeat"], [
      { cls: "BookingService", method: "holdSeats" },
      { cls: "SeatReservationStore", method: "tryHold" },
      { cls: "ShowSeat", method: "tryHold" },
      { cls: "SeatHold", method: "new" },
    ]);
    render(inst);
  }

  function priceFor(inst, seats) {
    if (inst.strategy.pricing === "premium") {
      return seats.reduce(function (sum, s) { return sum + (s.row <= 1 ? 250 : 150); }, 0);
    }
    return seats.length * 150;
  }

  function payAndBook(inst) {
    var held = inst.seats.filter(function (s) { return s.status === "held" && s.holder === inst.acting; });
    if (!held.length) { inst.bad = true; inst.lastDecision = "No held seats for " + USERS[inst.acting].name + ". Hold seats first."; render(inst); return; }
    var amount = priceFor(inst, held);
    var ok = Math.random() > 0.1; // ~90% payment success
    inst.bad = !ok;
    if (!ok) {
      held.forEach(function (s) { s.status = "available"; s.holder = null; });
      inst.lastDecision = "PaymentGateway.charge(" + money(amount) + ") declined → released " + held.length + " seat(s).";
      render(inst);
      return;
    }
    held.forEach(function (s) { s.status = "booked"; });
    inst.revenue += amount;
    inst.bookings += 1;
    inst.lastDecision = "PricingStrategy → " + money(amount) + "; " + inst.strategy.payment + " paid; " + held.map(function (s) { return s.id; }).join(", ") + " BOOKED.";
    trace(inst, ["PaymentGateway"], [
      { cls: "BookingService", method: "confirm" },
      { cls: "PricingStrategy", method: "priceFor" },
      { cls: "PaymentGateway", method: "charge" },
      { cls: "ShowSeat", method: "book" },
      { cls: "Booking", method: "new" },
    ]);
    render(inst);
  }

  function raceDemo(inst) {
    var free = inst.seats.filter(function (s) { return s.status === "available"; });
    if (!free.length) { inst.bad = true; inst.lastDecision = "No free seats to race for."; render(inst); return; }
    var target = free[Math.floor(Math.random() * free.length)];
    var aWon = tryHold(inst, target, "A");
    var bWon = tryHold(inst, target, "B");
    inst.conflicts += 1;
    inst.bad = true;
    inst.lastDecision = "Race for " + target.id + ": A " + (aWon ? "HELD" : "failed") + ", B " + (bWon ? "HELD" : "failed") +
      " — tryHold is atomic, so exactly one wins. The loser sees 'seat taken'.";
    trace(inst, ["ShowSeat"], [
      { cls: "BookingService", method: "holdSeats" },
      { cls: "SeatReservationStore", method: "tryHold" },
      { cls: "ShowSeat", method: "tryHold" },
    ]);
    render(inst);
  }

  function expireHolds(inst) {
    var released = 0;
    inst.seats.forEach(function (s) {
      if (s.status === "held" && s.expiresAt <= inst.clock) { s.status = "available"; s.holder = null; released += 1; }
    });
    if (released) inst.lastDecision = "expireHolds: released " + released + " expired hold seat(s).";
    return released;
  }

  function tick(inst) {
    inst.clock += 1;
    expireHolds(inst);
    ["A", "B"].forEach(function (u) {
      var held = inst.seats.filter(function (s) { return s.status === "held" && s.holder === u; });
      if (held.length && Math.random() < 0.6) {
        var prev = inst.acting; inst.acting = u; payAndBook(inst); inst.acting = prev;
      }
    });
    if (Math.random() < 0.7) {
      var free = inst.seats.filter(function (s) { return s.status === "available"; });
      if (free.length) {
        var u2 = Math.random() < 0.5 ? "A" : "B";
        var n = 1 + Math.floor(Math.random() * 2);
        var got = [];
        for (var i = 0; i < n && free.length; i++) {
          var pick = free.splice(Math.floor(Math.random() * free.length), 1)[0];
          if (tryHold(inst, pick, u2)) got.push(pick.id);
        }
        if (got.length) inst.lastDecision = USERS[u2].name + " held " + got.join(", ") + " (t=" + inst.clock + "h).";
      }
    }
    render(inst);
  }

  function play(inst) {
    if (inst.timer) return;
    var b = inst.container.querySelector(".bmv-play");
    if (b) b.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 1100 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var b = inst.container.querySelector(".bmv-play");
    if (b) b.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }

  function trace(inst, _u, steps) {
    if (!inst.lens) return;
    inst._traced = true;
    var active = {};
    steps.forEach(function (s) { active[s.cls] = true; });
    inst.lens.setActive(Object.keys(active));
    inst.lens.setTrace(steps);
  }

  function render(inst) {
    var c = inst.container;
    var avail = 0, held = 0, booked = 0;

    inst.seats.forEach(function (s) {
      var rect = c.querySelector('[data-seatrect="' + s.id + '"]');
      var text = c.querySelector('[data-seattext="' + s.id + '"]');
      var g = c.querySelector('[data-seat="' + s.id + '"]');
      var fill = "var(--bmv-seat)", txt = s.id, on = false, cls = "bmv-seat";

      if (s.status === "booked") {
        booked += 1; fill = USERS[s.holder].color; txt = s.holder; on = true; cls += " is-booked";
      } else if (s.status === "held") {
        held += 1; fill = "color-mix(in srgb, " + USERS[s.holder].color + " 45%, var(--bmv-bg))"; txt = s.holder; on = true; cls += " is-held";
      } else {
        avail += 1;
        if (inst.selected[s.id]) { cls += " is-selected"; }
      }
      if (g) g.setAttribute("class", cls);
      if (rect) rect.setAttribute("fill", fill);
      if (text) { text.textContent = txt; text.setAttribute("class", "bmv-seattext" + (on ? " is-on" : "")); }
    });

    var sel = Object.keys(inst.selected);
    c.querySelector("[data-clock]").textContent = inst.clock;
    c.querySelector("[data-selected]").textContent = sel.length ? sel.join(", ") : "—";
    var cap = c.querySelector(".bmv-caption");
    cap.textContent = inst.lastDecision;
    cap.className = "bmv-caption" + (inst.bad ? " is-bad" : "");

    setMetric(c, "avail", avail);
    setMetric(c, "held", held);
    setMetric(c, "booked", booked);
    setMetric(c, "rev", money(inst.revenue));
    setMetric(c, "conf", inst.conflicts);

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["BookingService", "ShowSeat"]);
      inst.lens.setTrace([{ cls: "BookingService", method: "holdSeats" }]);
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
        { id: "Show", label: "Show", stereotype: "class", x: 150, y: 90, owns: "Owns its seat map.", fields: ["id", "startsAt", "seats: ShowSeat[]"], methods: ["available()"] },
        { id: "ShowSeat", label: "ShowSeat", stereotype: "class", x: 150, y: 270,
          owns: "Its status and the atomic tryHold/book/release.",
          invariant: "A seat has at most one active booking per show.",
          fields: ["id", "status", "holder", "holdExpiresAt"], methods: ["tryHold(user,ttl)", "book()", "release()"] },
        { id: "SeatStatus", label: "SeatStatus", stereotype: "enum", x: 150, y: 450, owns: "Value object.", fields: ["AVAILABLE", "HELD", "BOOKED"] },
        { id: "User", label: "User", stereotype: "class", x: 150, y: 620, owns: "Identity.", fields: ["id", "name"] },
        { id: "SeatHold", label: "SeatHold", stereotype: "class", x: 450, y: 90, owns: "The TTL lease on seats.", fields: ["id", "user", "seatIds", "expiresAt"], methods: ["isExpired(now)"] },
        { id: "Booking", label: "Booking", stereotype: "class", x: 450, y: 270, owns: "The immutable confirmation.", fields: ["id", "user", "show", "seatIds", "amount"] },
        { id: "BookingService", label: "BookingService", stereotype: "class", x: 450, y: 470,
          owns: "Coordinates hold → pay → confirm and expiry sweeps.",
          methods: ["holdSeats()", "confirm()", "expireHolds()"] },
        { id: "SeatReservationStore", label: "SeatReservationStore", stereotype: "interface", x: 740, y: 90, owns: "Atomic hold/book/release.", methods: ["tryHold()", "book()", "release()"] },
        { id: "PricingStrategy", label: "PricingStrategy", stereotype: "interface", x: 740, y: 270, owns: "Prices a set of seats.", methods: ["priceFor(show,seats)"] },
        { id: "PaymentGateway", label: "PaymentGateway", stereotype: "interface", x: 740, y: 450, owns: "Payment boundary; idempotent charge.", methods: ["charge(amount,key)"] },
      ],
      edges: [
        { from: "Show", to: "ShowSeat", kind: "composition" },
        { from: "ShowSeat", to: "SeatStatus", kind: "association" },
        { from: "SeatHold", to: "ShowSeat", kind: "association" },
        { from: "Booking", to: "Show", kind: "association" },
        { from: "BookingService", to: "SeatReservationStore", kind: "depends" },
        { from: "BookingService", to: "PricingStrategy", kind: "depends" },
        { from: "BookingService", to: "PaymentGateway", kind: "depends" },
        { from: "BookingService", to: "SeatHold", kind: "depends" },
        { from: "BookingService", to: "Booking", kind: "depends" },
      ],
      patterns: [
        { id: "state", label: "State", classes: ["ShowSeat", "SeatStatus"],
          note: "A seat's behavior depends on AVAILABLE / HELD / BOOKED. The legal transitions are tryHold → book, or release on expiry/payment failure." },
        { id: "strategy", label: "Strategy", classes: ["PricingStrategy", "PaymentGateway", "SeatReservationStore"],
          note: "Pricing, payment, and the reservation mechanism vary independently. Swap pricing/payment with the buttons; the seat state machine is untouched." },
      ],
      strategyGroups: [
        { id: "pricing", label: "PricingStrategy", options: [
            { id: "standard", label: "Standard", note: "Flat $1.50 per seat." },
            { id: "premium", label: "Premium rows", note: "Front rows (A–B) cost more than the rest." },
          ], default: "standard", classMap: { standard: "PricingStrategy", premium: "PricingStrategy" },
          onChange: function (id) { inst.strategy.pricing = id; inst.lastDecision = "PricingStrategy = " + id + "."; render(inst); } },
        { id: "payment", label: "PaymentGateway", options: [
            { id: "card", label: "Card", note: "PaymentGateway.charge via card." },
            { id: "wallet", label: "Wallet", note: "PaymentGateway.charge via wallet." },
          ], default: "card", classMap: { card: "PaymentGateway", wallet: "PaymentGateway" },
          onChange: function (id) { inst.strategy.payment = id; inst.lastDecision = "PaymentGateway = " + id + "."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["Show", "User"], note: "Seat map, hold, pay, confirm, expiry — scope refunds and waitlists out." },
        { n: 2, label: "Core Entities", classes: ["ShowSeat", "SeatHold", "Booking"], note: "Nouns: show, show-seat, hold, booking, payment; SeatStatus is the enum." },
        { n: 3, label: "Responsibilities", classes: ["ShowSeat", "BookingService"], note: "Seat owns its status and atomic hold; the service coordinates the workflow." },
        { n: 4, label: "Relationships + Interfaces", classes: ["SeatReservationStore", "PricingStrategy", "PaymentGateway"], note: "Show has-a seats; interfaces at pricing, payment, and the reservation mechanism." },
        { n: 5, label: "Class Diagram", classes: ["Show", "ShowSeat", "SeatHold", "Booking"], note: "Composition show→seat, plus the hold lease and booking record." },
        { n: 6, label: "Core Flows", classes: ["BookingService", "SeatHold"], note: "Hold: atomic tryHold. Confirm: price → charge → book. Expire: release." },
        { n: 7, label: "Critical Code", classes: ["ShowSeat"], note: "tryHold (compare-and-set) and idempotent confirm carry correctness." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["PricingStrategy", "PaymentGateway"], note: "The race, pay-then-book failure, expiry during payment; new pricing/provider = new implementation." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".bookmyshow-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
