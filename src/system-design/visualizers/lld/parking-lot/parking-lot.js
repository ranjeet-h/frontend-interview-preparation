/* Parking Lot (LLD) visualizer: allocation + pricing + payment policies,
   with the shared LLD design lens. Prefix: plv-. No dependencies. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var FLOORS = 3;
  var SPOTS = 6;
  var PATTERN = ["compact", "compact", "large", "large", "bike", "compact"];
  var SPOT_W = 74, SPOT_H = 48, GAP = 12, ROW_H = 74, TOP = 30, LEFT = 110;
  var VW = LEFT + SPOTS * SPOT_W + (SPOTS - 1) * GAP + 40;
  var VH = TOP + FLOORS * ROW_H + 20;

  var SPOT_FILL = { compact: "#e5e7eb", large: "#dbeafe", bike: "#dcfce7" };
  var SPOT_LETTER = { compact: "C", large: "L", bike: "B" };
  var VEH_FILL = { car: "#2563eb", bike: "#16a34a", truck: "#d97706" };
  var VEH_LETTER = { car: "C", bike: "B", truck: "T" };
  var FIT = { compact: ["bike", "car"], large: ["car", "truck"], bike: ["bike"] };
  var RATE_HOURLY = { bike: 1, car: 2, truck: 4 };
  var RATE_FLAT = { bike: 2, car: 5, truck: 10 };

  function spotX(i) { return LEFT + i * (SPOT_W + GAP); }
  function rowY(fi) { return TOP + fi * ROW_H; }
  function fits(spotType, vehType) { return FIT[spotType].indexOf(vehType) !== -1; }
  function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function makeFloors() {
    var floors = [];
    for (var fi = 0; fi < FLOORS; fi++) {
      var spots = [];
      for (var i = 0; i < SPOTS; i++) {
        spots.push({ id: "F" + (fi + 1) + "-" + (i + 1), floor: fi + 1, index: i, type: PATTERN[i], vehicle: null });
      }
      floors.push({ level: fi + 1, spots: spots });
    }
    return floors;
  }

  function build(container) {
    var uid = "plv" + build.count;
    build.count += 1;
    container.classList.add("plv");

    var inst = {
      uid: uid,
      container: container,
      floors: makeFloors(),
      parked: [],
      revenue: 0,
      served: 0,
      ticketSeq: 0,
      clock: 0,
      speed: 1,
      timer: null,
      strategy: { spotFinder: "nearest", fee: "hourly", pay: "card" },
      lens: null,
      lastDecision: "Press ▶ Play: vehicles arrive and leave on their own, or add one manually.",
    };

    // ---- static SVG ---------------------------------------------------------
    var spotsSvg = "";
    for (var fi = 0; fi < FLOORS; fi++) {
      spotsSvg += '<text class="plv-floor-label" x="16" y="' + (rowY(fi) + 30) + '">Floor ' + (fi + 1) + "</text>";
      for (var i = 0; i < SPOTS; i++) {
        var s = inst.floors[fi].spots[i];
        spotsSvg +=
          '<g data-spot="' + s.id + '" transform="translate(' + spotX(i) + "," + rowY(fi) + ')">' +
          '<rect class="plv-spot" x="0" y="0" width="' + SPOT_W + '" height="' + SPOT_H + '" rx="8" data-spotrect="' + s.id + '"></rect>' +
          '<text class="plv-spot-text" x="' + SPOT_W / 2 + '" y="30" text-anchor="middle" data-spottext="' + s.id + '"></text>' +
          "</g>";
      }
    }

    container.innerHTML =
      '<div class="plv-toolbar">' +
      '<button type="button" class="plv-btn plv-primary plv-play">▶ Play</button>' +
      '<button type="button" class="plv-btn plv-step">Step</button>' +
      '<button type="button" class="plv-btn plv-reset">Clear lot</button>' +
      '<label class="plv-field">Speed <select class="plv-select plv-speed"><option value="1">1×</option><option value="2">2×</option><option value="0.5">0.5×</option></select></label>' +
      '<span class="plv-sep"></span>' +
      '<button type="button" class="plv-btn" data-arrive="car">🚗 Car</button>' +
      '<button type="button" class="plv-btn" data-arrive="bike">🏍️ Bike</button>' +
      '<button type="button" class="plv-btn" data-arrive="truck">🚚 Truck</button>' +
      '<button type="button" class="plv-btn" data-scenario="rush">Morning rush</button>' +
      "</div>" +
      '<div class="plv-stage"><svg class="plv-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Parking lot floors and spots">' + spotsSvg + "</svg></div>" +
      '<div class="plv-parked" data-parked></div>' +
      '<div class="plv-caption" role="status" aria-live="polite"></div>' +
      '<div class="plv-metrics">' +
      metric("Available", "avail") + metric("Occupancy", "occ") + metric("Time", "time") + metric("Revenue", "rev") + metric("Served", "served") +
      "</div>" +
      '<div class="plv-legend">' +
      '<span><i class="plv-swatch" style="background:#2563eb"></i>car</span>' +
      '<span><i class="plv-swatch" style="background:#16a34a"></i>bike</span>' +
      '<span><i class="plv-swatch" style="background:#d97706"></i>truck</span>' +
      '<span>spot letters: C compact · L large · B bike</span>' +
      "</div>" +
      '<div class="plv-lens" data-lens></div>' +
      '<p class="plv-hint">Entry: <b>EntryGate → ParkingLot.parkVehicle → SpotFinder.findSpot → ParkingSpot.park → Ticket</b>. Exit: <b>ExitGate.checkout → FeeStrategy.calculate → PaymentProcessor.pay → ParkingSpot.vacate</b>.</p>';

    // ---- events -------------------------------------------------------------
    container.querySelectorAll("[data-arrive]").forEach(function (b) {
      b.addEventListener("click", function () { arrive(inst, b.getAttribute("data-arrive")); });
    });
    container.querySelector(".plv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".plv-step").addEventListener("click", function () { pause(inst); tick(inst); });
    container.querySelector(".plv-speed").addEventListener("change", function (e) {
      inst.speed = parseFloat(e.target.value);
      if (inst.timer) { pause(inst); play(inst); }
    });
    container.querySelector("[data-scenario]").addEventListener("click", function () {
      ["car", "car", "bike", "truck", "car", "car"].forEach(function (t) { arrive(inst, t, true); });
      play(inst);
    });
    container.querySelector(".plv-reset").addEventListener("click", function () {
      pause(inst);
      inst.floors = makeFloors();
      inst.parked = [];
      inst.revenue = 0;
      inst.served = 0;
      inst.clock = 0;
      inst.lastDecision = "Lot cleared.";
      render(inst);
    });
    container.addEventListener("click", function (e) {
      var g = e.target.closest ? e.target.closest("[data-spot]") : null;
      if (g) {
        var spot = findSpotById(inst, g.getAttribute("data-spot"));
        if (spot && spot.vehicle) exitSpot(inst, spot);
      }
    });

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="plv-metric"><span class="plv-metric-label">' + label + '</span><span class="plv-metric-value" data-metric="' + key + '">–</span></div>';
  }

  function findSpotById(inst, id) {
    for (var fi = 0; fi < inst.floors.length; fi++) {
      var s = inst.floors[fi].spots.filter(function (x) { return x.id === id; })[0];
      if (s) return s;
    }
    return null;
  }

  function findSpot(inst, vehType) {
    if (inst.strategy.spotFinder === "balanced") {
      var best = null, bestFree = -1;
      inst.floors.forEach(function (fl) {
        var free = fl.spots.filter(function (s) { return !s.vehicle && fits(s.type, vehType); });
        if (free.length > bestFree) { bestFree = free.length; best = free[0] || null; }
      });
      return best;
    }
    for (var fi = 0; fi < inst.floors.length; fi++) {
      var spots = inst.floors[fi].spots;
      for (var i = 0; i < spots.length; i++) {
        if (!spots[i].vehicle && fits(spots[i].type, vehType)) return spots[i];
      }
    }
    return null;
  }

  function parkVehicle(inst, vehType, spot) {
    inst.ticketSeq += 1;
    var duration = rand(2, 6); // hours of stay
    var ticket = { id: "T" + inst.ticketSeq, type: vehType, duration: duration, departAt: inst.clock + duration };
    spot.vehicle = { type: vehType };
    var entry = { spot: spot, ticket: ticket };
    inst.parked.push(entry);
    return entry;
  }

  function arrive(inst, vehType, quiet) {
    var spot = findSpot(inst, vehType);
    if (!spot) {
      inst.lastDecision = "🚫 Lot full — SpotFinder returned null, so no ticket is issued for the " + vehType + ".";
      render(inst);
      return null;
    }
    var entry = parkVehicle(inst, vehType, spot);
    inst.lastDecision = "🚗 " + cap(vehType) + " parked at Floor " + spot.floor + " · " + spot.type + " " + spot.id +
      " (SpotFinder: " + (inst.strategy.spotFinder === "balanced" ? "most-free floor" : "nearest first") + "). Ticket " + entry.ticket.id + " · leaves in " + entry.ticket.duration + "h.";
    if (!quiet) {
      setEntryTrace(inst, spot, vehType);
      render(inst);
    }
    return entry;
  }

  function calcFee(inst, ticket) {
    if (inst.strategy.fee === "flat") return RATE_FLAT[ticket.type];
    return RATE_HOURLY[ticket.type] * ticket.duration;
  }

  function exitSpot(inst, spot, quiet) {
    var entry = inst.parked.filter(function (p) { return p.spot.id === spot.id; })[0];
    if (!entry) return null;
    var fee = calcFee(inst, entry.ticket);
    spot.vehicle = null;
    inst.parked = inst.parked.filter(function (p) { return p.spot.id !== spot.id; });
    inst.revenue += fee;
    inst.served += 1;
    if (!quiet) {
      inst.lastDecision = "💳 ExitGate.checkout(" + entry.ticket.id + "): " + cap(entry.ticket.type) + " stayed " + entry.ticket.duration +
        "h → " + (inst.strategy.fee === "flat" ? "flat" : "hourly") + " fee $" + fee + " paid by " + inst.strategy.pay + ". Spot " + spot.id + " vacated.";
      setExitTrace(inst, entry.ticket, fee);
      render(inst);
    }
    return { entry: entry, fee: fee };
  }

  function pickVehicleType() {
    var r = Math.random();
    if (r < 0.6) return "car";
    if (r < 0.85) return "bike";
    return "truck";
  }

  function tick(inst) {
    inst.clock += 1;
    var messages = [];
    var departures = inst.parked.filter(function (p) { return p.ticket.departAt <= inst.clock; });
    departures.forEach(function (p) {
      var res = exitSpot(inst, p.spot, true);
      if (res) messages.push(cap(res.entry.ticket.type) + " " + res.entry.ticket.id + " left " + res.entry.spot.id + " ($" + res.fee + " " + (inst.strategy.fee === "flat" ? "flat" : "hourly") + ")");
    });

    var arrived = null;
    if (Math.random() < 0.8) {
      var t = pickVehicleType();
      var spot = findSpot(inst, t);
      if (spot) {
        arrived = parkVehicle(inst, t, spot);
        messages.push(cap(t) + " parked " + spot.id + " (leaves " + arrived.ticket.departAt + "h)");
      } else {
        messages.push("🚫 Full — no spot for the " + t);
      }
    }

    if (messages.length) inst.lastDecision = "t=" + inst.clock + "h · " + messages.join(" · ");
    if (departures.length) setExitTrace(inst, departures[departures.length - 1].ticket, 0);
    else if (arrived) setEntryTrace(inst, arrived.spot, arrived.ticket.type);
    render(inst);
  }

  function play(inst) {
    if (inst.timer) return;
    var btn = inst.container.querySelector(".plv-play");
    if (btn) btn.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 820 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var btn = inst.container.querySelector(".plv-play");
    if (btn) btn.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }

  function render(inst) {
    var c = inst.container;
    var used = 0, total = 0;

    inst.floors.forEach(function (fl) {
      fl.spots.forEach(function (s) {
        total += 1;
        var rect = c.querySelector('[data-spotrect="' + s.id + '"]');
        var text = c.querySelector('[data-spottext="' + s.id + '"]');
        if (s.vehicle) {
          used += 1;
          rect.setAttribute("fill", VEH_FILL[s.vehicle.type]);
          rect.setAttribute("class", "plv-spot is-occupied");
          text.setAttribute("fill", "#ffffff");
          text.textContent = VEH_LETTER[s.vehicle.type];
        } else {
          rect.setAttribute("fill", SPOT_FILL[s.type]);
          rect.setAttribute("class", "plv-spot");
          text.setAttribute("fill", "var(--plv-muted)");
          text.textContent = SPOT_LETTER[s.type];
        }
      });
    });

    var parked = c.querySelector("[data-parked]");
    parked.innerHTML = inst.parked.map(function (p) {
      var left = Math.max(0, p.ticket.departAt - inst.clock);
      return '<span class="plv-ticket"><b>' + VEH_LETTER[p.ticket.type] + "</b> " + p.spot.id + " · " + p.ticket.id + " · leaves " + left + "h " +
        '<button type="button" class="plv-exit" data-exit="' + p.spot.id + '">Exit</button></span>';
    }).join("");
    parked.querySelectorAll("[data-exit]").forEach(function (b) {
      b.addEventListener("click", function () {
        var spot = findSpotById(inst, b.getAttribute("data-exit"));
        if (spot) exitSpot(inst, spot);
      });
    });

    c.querySelector(".plv-caption").textContent = inst.lastDecision;
    setMetric(c, "avail", (total - used) + " / " + total);
    setMetric(c, "occ", Math.round((used / total) * 100) + "%");
    setMetric(c, "time", inst.clock + "h");
    setMetric(c, "rev", "$" + inst.revenue);
    setMetric(c, "served", inst.served);

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["ParkingLot"]);
      inst.lens.setTrace([{ cls: "ParkingLot", method: "parkVehicle" }]);
    }
    inst._traced = false;
  }

  function setMetric(c, key, value) {
    var el = c.querySelector('[data-metric="' + key + '"]');
    if (el) el.textContent = value;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function setEntryTrace(inst, spot, vehType) {
    if (!inst.lens) return;
    inst._traced = true;
    inst.lens.setActive(["EntryGate", "ParkingLot", "SpotFinder", "ParkingSpot", "Ticket"]);
    inst.lens.setTrace([
      { cls: "EntryGate", method: "issueTicket" },
      { cls: "ParkingLot", method: "parkVehicle" },
      { cls: "SpotFinder", method: "findSpot" },
      { cls: "ParkingSpot", method: "park" },
      { cls: "Ticket", method: "new" },
    ]);
  }
  function setExitTrace(inst, ticket, fee) {
    if (!inst.lens) return;
    inst._traced = true;
    inst.lens.setActive(["ExitGate", "FeeStrategy", "PaymentProcessor", "ParkingSpot"]);
    inst.lens.setTrace([
      { cls: "ExitGate", method: "checkout" },
      { cls: "FeeStrategy", method: "calculate" },
      { cls: "PaymentProcessor", method: "pay" },
      { cls: "ParkingSpot", method: "vacate" },
    ]);
  }

  function lensConfig(inst) {
    return {
      classes: [
        { id: "ParkingLot", label: "ParkingLot", stereotype: "class", x: 150, y: 90,
          owns: "Coordinates entry/exit; owns the floors. Delegates allocation, pricing, payment.",
          fields: ["floors: ParkingFloor[]", "spotFinder: SpotFinder"],
          methods: ["parkVehicle(v)", "exit(ticket)"] },
        { id: "ParkingFloor", label: "ParkingFloor", stereotype: "class", x: 150, y: 250,
          owns: "Its own spots and whether a vehicle type fits on this floor.",
          fields: ["level", "spots: ParkingSpot[]"],
          methods: ["hasSpace(vehicleType)", "findSpot(vehicle)"] },
        { id: "ParkingSpot", label: "ParkingSpot", stereotype: "class", x: 150, y: 410,
          owns: "Its own occupancy — the class that guards the one-vehicle invariant.",
          invariant: "At most one vehicle occupies a spot.",
          fields: ["id", "type", "vehicle"],
          methods: ["isAvailable()", "canFit(v)", "park(v)", "vacate()"] },
        { id: "Ticket", label: "Ticket", stereotype: "class", x: 150, y: 560,
          owns: "The immutable record of a session; a record, not a calculator.",
          fields: ["id", "vehicle", "spot", "duration"] },
        { id: "EntryGate", label: "EntryGate", stereotype: "class", x: 410, y: 90,
          owns: "The entry boundary: issues the ticket.", methods: ["issueTicket(vehicle)"] },
        { id: "ExitGate", label: "ExitGate", stereotype: "class", x: 410, y: 250,
          owns: "The exit boundary: runs checkout.", methods: ["checkout(ticket)"] },
        { id: "Vehicle", label: "Vehicle", stereotype: "class", x: 410, y: 430,
          owns: "Identity and type shared by all vehicles.",
          fields: ["id", "type: VehicleType"] },
        { id: "VehicleType", label: "VehicleType", stereotype: "enum", x: 660, y: 210,
          owns: "Value object.", fields: ["BIKE", "CAR", "TRUCK"] },
        { id: "Car", label: "Car", stereotype: "class", x: 660, y: 360, owns: "A vehicle subtype.", fields: ["type = CAR"] },
        { id: "Bike", label: "Bike", stereotype: "class", x: 660, y: 480, owns: "A vehicle subtype.", fields: ["type = BIKE"] },
        { id: "Truck", label: "Truck", stereotype: "class", x: 660, y: 600, owns: "A vehicle subtype.", fields: ["type = TRUCK"] },
        { id: "SpotFinder", label: "SpotFinder", stereotype: "interface", x: 900, y: 90,
          owns: "Allocation policy only — holds no lot state.", methods: ["findSpot(vehicle, lot)"] },
        { id: "FeeStrategy", label: "FeeStrategy", stereotype: "interface", x: 900, y: 250,
          owns: "Pricing policy only.", methods: ["calculate(ticket)"] },
        { id: "PaymentProcessor", label: "PaymentProcessor", stereotype: "interface", x: 900, y: 410,
          owns: "Payment boundary only.", methods: ["pay(amount)"] },
        { id: "SpotType", label: "SpotType", stereotype: "enum", x: 900, y: 560,
          owns: "Value object.", fields: ["COMPACT", "LARGE", "BIKE"] },
      ],
      edges: [
        { from: "ParkingLot", to: "ParkingFloor", kind: "composition" },
        { from: "ParkingFloor", to: "ParkingSpot", kind: "composition" },
        { from: "ParkingSpot", to: "Vehicle", kind: "association" },
        { from: "Ticket", to: "Vehicle", kind: "association" },
        { from: "Ticket", to: "ParkingSpot", kind: "association" },
        { from: "EntryGate", to: "ParkingLot", kind: "depends" },
        { from: "ExitGate", to: "ParkingLot", kind: "depends" },
        { from: "ParkingLot", to: "SpotFinder", kind: "depends" },
        { from: "ExitGate", to: "FeeStrategy", kind: "depends" },
        { from: "ExitGate", to: "PaymentProcessor", kind: "depends" },
        { from: "Car", to: "Vehicle", kind: "inheritance" },
        { from: "Bike", to: "Vehicle", kind: "inheritance" },
        { from: "Truck", to: "Vehicle", kind: "inheritance" },
        { from: "Vehicle", to: "VehicleType", kind: "association" },
        { from: "ParkingSpot", to: "SpotType", kind: "association" },
      ],
      patterns: [
        { id: "strategy", label: "Strategy", classes: ["SpotFinder", "FeeStrategy", "PaymentProcessor"],
          note: "Three independent policies — allocation, pricing, payment — each behind an interface. Change any one without editing ParkingLot. Use the policy buttons and watch allocation and revenue change." },
        { id: "polymorphism", label: "Polymorphism", classes: ["Vehicle", "Car", "Bike", "Truck"],
          note: "Vehicle subtypes share one contract, so fit and pricing rules dispatch on type instead of a growing if/else. Inheritance here is a requirement, not decoration." },
      ],
      strategyGroups: [
        { id: "spotfinder", label: "SpotFinder", options: [
            { id: "nearest", label: "Nearest", note: "Scan floors nearest-first and take the first compatible spot. Simple, but can fill one floor while others stay empty." },
            { id: "balanced", label: "Balanced", note: "Pick the floor with the most free compatible spots. Spreads load, so one gate rarely fills a whole floor." },
          ], default: "nearest", classMap: { nearest: "SpotFinder", balanced: "SpotFinder" },
          onChange: function (id) { inst.strategy.spotFinder = id; inst.lastDecision = "SpotFinder = " + id + ". Allocation changes as new vehicles arrive."; render(inst); } },
        { id: "fee", label: "FeeStrategy", options: [
            { id: "hourly", label: "Hourly", note: "rate(vehicleType) × hours. Fair for long stays; revenue scales with time." },
            { id: "flat", label: "Flat", note: "One price per vehicle type. Predictable, but short stays overpay and long stays underpay." },
          ], default: "hourly", classMap: { hourly: "FeeStrategy", flat: "FeeStrategy" },
          onChange: function (id) { inst.strategy.fee = id; inst.lastDecision = "FeeStrategy = " + id + ". New exits are priced with this policy."; render(inst); } },
        { id: "pay", label: "Payment", options: [
            { id: "card", label: "Card", note: "PaymentProcessor.pay(amount) via card." },
            { id: "upi", label: "UPI", note: "PaymentProcessor.pay(amount) via UPI." },
          ], default: "card", classMap: { card: "PaymentProcessor", upi: "PaymentProcessor" },
          onChange: function (id) { inst.strategy.pay = id; inst.lastDecision = "PaymentProcessor = " + id + "."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["ParkingLot", "EntryGate", "ExitGate"], note: "Vehicles, floors, spot types, entry/exit, ticket, fee, payment — then scope reservations out." },
        { n: 2, label: "Core Entities", classes: ["ParkingSpot", "Vehicle", "Ticket"], note: "Nouns first: spot, vehicle, ticket, floor; enums for VehicleType and SpotType." },
        { n: 3, label: "Responsibilities", classes: ["ParkingLot", "ParkingSpot"], note: "Spot guards its own occupancy; the lot coordinates; policies own allocation/pricing/payment." },
        { n: 4, label: "Relationships + Interfaces", classes: ["SpotFinder", "FeeStrategy", "PaymentProcessor"], note: "Has-a for ownership; interfaces at the three points that change." },
        { n: 5, label: "Class Diagram", classes: ["ParkingLot", "ParkingFloor", "ParkingSpot", "Ticket"], note: "Composition chain, vehicle inheritance, and the policy interfaces." },
        { n: 6, label: "Core Flows", classes: ["EntryGate", "ExitGate", "ParkingSpot"], note: "Entry: find → park → ticket. Exit: price → pay → vacate." },
        { n: 7, label: "Critical Code", classes: ["ParkingSpot"], note: "park/vacate/canFit carry the invariant; SpotFinder and FeeStrategy carry the policies." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["SpotFinder", "FeeStrategy", "PaymentProcessor"], note: "Two cars, one spot; pay-then-vacate failure; new pricing/provider/vehicle = new implementation." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".parking-lot-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
