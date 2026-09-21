/* Elevator (LLD) visualizer: LOOK scheduling + car state machine.
   Prefix: elv-. Plain browser JS, no dependencies. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var FLOORS = 8;
  var CARS = 2;
  var TOP = 24;
  var GAP = 52;
  var GUTTER = 110;
  var SHAFT_W = 180;
  var VIEW_W = 800;
  var VIEW_H = TOP + FLOORS * GAP + 16;
  var BUILDING_W = GUTTER + CARS * SHAFT_W;
  var OFFX = (VIEW_W - BUILDING_W) / 2;
  var DWELL = 2;

  function cellTop(f) { return TOP + (FLOORS - f) * GAP; }
  function carY(f) { return cellTop(f) + GAP / 2; }
  function shaftCx(i) { return OFFX + GUTTER + i * SHAFT_W + SHAFT_W / 2; }
  function randDest(floor, dir) {
    var lo, hi;
    if (dir === "up") { lo = floor + 1; hi = FLOORS; } else { lo = 1; hi = floor - 1; }
    if (lo > hi) return null;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  function makeCar(i) {
    return {
      id: String.fromCharCode(65 + i),
      floor: 1,
      dir: "idle",
      state: "idle",
      doorTicks: 0,
      carCalls: {},
      hallCalls: [],
      distance: 0,
    };
  }

  function allStops(car) {
    var set = {};
    for (var f in car.carCalls) set[f] = true;
    car.hallCalls.forEach(function (c) { set[c.floor] = true; });
    return Object.keys(set).map(Number);
  }

  function hallAt(car, floor, dir) {
    return car.hallCalls.some(function (c) { return c.floor === floor && c.dir === dir; });
  }

  function shouldStop(car) {
    if (car.carCalls[car.floor]) return true;
    return car.hallCalls.some(function (c) {
      return c.floor === car.floor && (car.dir === "idle" || c.dir === car.dir);
    });
  }

  function pickNext(car) {
    var stops = allStops(car);
    if (stops.length === 0) { car.dir = "idle"; return null; }
    if (car.dir === "idle") {
      var best = null, bd = Infinity;
      stops.forEach(function (f) { var d = Math.abs(f - car.floor); if (d < bd && d > 0) { bd = d; best = f; } });
      if (best == null) { car.dir = "idle"; return null; }
      car.dir = best > car.floor ? "up" : "down";
      return best;
    }
    var ahead = stops.filter(function (f) { return car.dir === "up" ? f > car.floor : f < car.floor; });
    if (ahead.length) return car.dir === "up" ? Math.min.apply(null, ahead) : Math.max.apply(null, ahead);
    car.dir = car.dir === "up" ? "down" : "up";
    var ahead2 = stops.filter(function (f) { return car.dir === "up" ? f > car.floor : f < car.floor; });
    if (ahead2.length) return car.dir === "up" ? Math.min.apply(null, ahead2) : Math.max.apply(null, ahead2);
    car.dir = "idle";
    return null;
  }

  function serveFloor(inst, car) {
    if (car.carCalls[car.floor]) { delete car.carCalls[car.floor]; inst.served += 1; }
    var remaining = [];
    car.hallCalls.forEach(function (call) {
      if (call.floor === car.floor && (car.dir === "idle" || call.dir === car.dir)) {
        inst.served += 1;
        inst.waitSum += inst.ticks - call.raisedAt;
        inst.waitCount += 1;
        var dest = randDest(call.floor, call.dir);
        if (dest != null) car.carCalls[dest] = true;
      } else {
        remaining.push(call);
      }
    });
    car.hallCalls = remaining;
  }

  function stepCar(inst, car) {
    if (car.doorTicks > 0) {
      car.doorTicks -= 1;
      if (car.doorTicks === 0) car.state = car.dir === "idle" ? "idle" : car.dir;
      return;
    }
    if (shouldStop(car)) {
      car.state = "doors";
      car.doorTicks = DWELL;
      inst.lastDecision = "Car " + car.id + " stopped at floor " + car.floor + " — doors open, serving requests.";
      serveFloor(inst, car);
      return;
    }
    var target = pickNext(car);
    if (target == null) { car.state = "idle"; return; }
    car.floor += car.dir === "up" ? 1 : -1;
    car.distance += 1;
    car.state = car.dir === "up" ? "up" : "down";
  }

  function tick(inst) {
    inst.ticks += 1;
    inst.cars.forEach(function (car) { stepCar(inst, car); });
    render(inst);
  }

  function chooseCar(inst, call) {
    var best = null, bestScore = Infinity;
    inst.cars.forEach(function (car) {
      var dist = Math.abs(car.floor - call.floor);
      var score;
      if (inst.strategy === "nearest") {
        // Naive policy: closest car answers, regardless of where it is heading.
        score = dist + Object.keys(car.carCalls).length * 0.5;
      } else if (car.dir === "idle") {
        score = dist + 2;
      } else if (car.dir === call.dir && ((call.dir === "up" && car.floor <= call.floor) || (call.dir === "down" && car.floor >= call.floor))) {
        score = dist - 2;
      } else {
        score = dist * 3 + car.hallCalls.length * 2 + Object.keys(car.carCalls).length;
      }
      if (score < bestScore) { bestScore = score; best = car; }
    });
    return best;
  }

  function raiseHallCall(inst, floor, dir) {
    if ((dir === "up" && floor >= FLOORS) || (dir === "down" && floor <= 1)) return;
    var exists = inst.cars.some(function (car) { return hallAt(car, floor, dir); });
    if (exists) return;
    var car = chooseCar(inst, { floor: floor, dir: dir });
    car.hallCalls.push({ floor: floor, dir: dir, raisedAt: inst.ticks });
    var why = callDirWord(car, floor, dir);
    inst.lastDecision =
      "Car " + car.id + " ← floor " + floor + " " + (dir === "up" ? "▲" : "▼") + " (" + why + ").";
    render(inst);
    setAssignmentTrace(inst, car.id, floor, dir);
  }

  function callDirWord(car, floor, dir) {
    if (car.dir === "idle") return "nearest idle car";
    if (car.dir === dir && ((dir === "up" && car.floor <= floor) || (dir === "down" && car.floor >= floor))) return "already heading " + dir;
    return "least loaded";
  }

  // ---- geometry helpers for the SVG ------------------------------------------
  function floorLabelX() { return OFFX + 24; }
  function upBtnX() { return OFFX + 68; }
  function downBtnX() { return OFFX + 92; }

  function build(container) {
    var uid = "elv" + build.count;
    build.count += 1;
    container.classList.add("elv");

    var inst = {
      uid: uid,
      container: container,
      cars: [],
      ticks: 0,
      served: 0,
      waitSum: 0,
      waitCount: 0,
      lastDecision: "Press a floor's ▲/▼ button to raise a hall call, then Play or Step.",
      speed: 1,
      timer: null,
      strategy: "look",
      lens: null,
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
    for (var i = 0; i < CARS; i++) inst.cars.push(makeCar(i));

    // ---- static SVG ---------------------------------------------------------
    var floorsSvg = "";
    for (var f = FLOORS; f >= 1; f--) {
      var y = carY(f);
      floorsSvg +=
        '<line class="elv-floor-line" x1="' + OFFX + '" y1="' + cellTop(f) + '" x2="' + (OFFX + BUILDING_W) + '" y2="' + cellTop(f) + '"></line>' +
        '<text class="elv-floor-label" x="' + floorLabelX() + '" y="' + (y + 4) + '">' + f + "</text>";
      if (f < FLOORS) {
        floorsSvg +=
          '<g class="elv-hallbtn" data-floor="' + f + '" data-dir="up" role="button" tabindex="0" aria-label="Floor ' + f + ' up">' +
          '<circle class="elv-hallbtn-bg" cx="' + upBtnX() + '" cy="' + y + '" r="11"></circle>' +
          '<text class="elv-hallbtn-ico" x="' + upBtnX() + '" y="' + (y + 4) + '" text-anchor="middle">▲</text></g>';
      }
      if (f > 1) {
        floorsSvg +=
          '<g class="elv-hallbtn" data-floor="' + f + '" data-dir="down" role="button" tabindex="0" aria-label="Floor ' + f + ' down">' +
          '<circle class="elv-hallbtn-bg" cx="' + downBtnX() + '" cy="' + y + '" r="11"></circle>' +
          '<text class="elv-hallbtn-ico" x="' + downBtnX() + '" y="' + (y + 4) + '" text-anchor="middle">▼</text></g>';
      }
    }

    var carsSvg = "";
    for (var c = 0; c < CARS; c++) {
      carsSvg +=
        '<g transform="translate(' + shaftCx(c) + ',0)">' +
        '<rect class="elv-shaft-bg" x="-58" y="' + (TOP + 4) + '" width="116" height="' + (FLOORS * GAP - 8) + '" rx="10"></rect>' +
        '<g class="elv-car" data-car="' + c + '" style="transform: translateY(' + carY(inst.cars[c].floor) + 'px)">' +
        '<rect class="elv-cab" x="-52" y="-19" width="104" height="38" rx="8"></rect>' +
        '<rect class="elv-door elv-door-l" x="-24" y="-17" width="24" height="34" rx="4"></rect>' +
        '<rect class="elv-door elv-door-r" x="0" y="-17" width="24" height="34" rx="4"></rect>' +
        '<text class="elv-car-id" x="-44" y="5">' + inst.cars[c].id + "</text>" +
        '<text class="elv-car-dir" x="44" y="5" text-anchor="end" data-dir="' + c + '">•</text>' +
        "</g>" +
        '<g data-stops-layer="' + c + '"></g>' +
        "</g>";
    }

    var panels = "";
    for (var p = 0; p < CARS; p++) {
      panels +=
        '<div class="elv-panel"><div class="elv-carhead">Car ' + inst.cars[p].id +
        ' <span data-head="' + p + '"></span></div>' +
        '<div class="elv-states">' +
        '<span class="elv-chip" data-chip="' + p + '-idle">Idle</span>' +
        '<span class="elv-chip" data-chip="' + p + '-up">▲ Up</span>' +
        '<span class="elv-chip" data-chip="' + p + '-down">▼ Down</span>' +
        '<span class="elv-chip is-open" data-chip="' + p + '-doors">◧ Doors</span>' +
        "</div>" +
        '<div class="elv-stops" data-stops="' + p + '"></div></div>';
    }

    container.innerHTML =
      '<div class="elv-toolbar">' +
      '<button type="button" class="elv-btn elv-primary elv-play">▶ Play</button>' +
      '<button type="button" class="elv-btn elv-step">Step</button>' +
      '<button type="button" class="elv-btn elv-reset">Reset</button>' +
      '<label class="elv-field">Speed <select class="elv-select elv-speed"><option value="1">1×</option><option value="2">2×</option><option value="0.5">0.5×</option></select></label>' +
      '<span class="elv-sep"></span>' +
      '<button type="button" class="elv-btn" data-scenario="single">Single call</button>' +
      '<button type="button" class="elv-btn" data-scenario="morning">Morning rush</button>' +
      '<button type="button" class="elv-btn" data-scenario="lunch">Lunch mix</button>' +
      "</div>" +
      '<div class="elv-stage"><svg class="elv-svg" viewBox="0 0 ' + VIEW_W + " " + VIEW_H + '" role="img" aria-label="Elevator building with cars and hall calls">' +
      floorsSvg + carsSvg + "</svg></div>" +
      '<div class="elv-lens" data-lens></div>' +
      '<div class="elv-panels">' + panels + "</div>" +
      '<div class="elv-caption" role="status" aria-live="polite"></div>' +
      '<div class="elv-metrics">' +
      metric("Ticks", "ticks") + metric("Passengers served", "served") +
      metric("Pending calls", "pending") + metric("Avg wait", "wait") +
      "</div>" +
      '<p class="elv-hint">▲/▼ on a floor raises a hall call. Cars run the <b>LOOK</b> policy: serve everything in the current direction, then reverse. Filled cab = doors closed; parted doors = open.</p>';

    // ---- events -------------------------------------------------------------
    container.addEventListener("click", function (e) {
      var hall = e.target.closest ? e.target.closest(".elv-hallbtn") : null;
      if (hall) {
        raiseHallCall(inst, parseInt(hall.getAttribute("data-floor"), 10), hall.getAttribute("data-dir"));
      }
    });
    container.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var hall = e.target.closest ? e.target.closest(".elv-hallbtn") : null;
      if (hall) {
        e.preventDefault();
        raiseHallCall(inst, parseInt(hall.getAttribute("data-floor"), 10), hall.getAttribute("data-dir"));
      }
    });

    container.querySelector(".elv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".elv-step").addEventListener("click", function () { pause(inst); tick(inst); });
    container.querySelector(".elv-reset").addEventListener("click", function () { reset(inst); });
    container.querySelector(".elv-speed").addEventListener("change", function (e) {
      inst.speed = parseFloat(e.target.value);
      if (inst.timer) { pause(inst); play(inst); }
    });
    container.querySelectorAll("[data-scenario]").forEach(function (btn) {
      btn.addEventListener("click", function () { scenario(inst, btn.getAttribute("data-scenario")); });
    });

    if (window.SDLLDLens) {
      inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    }
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="elv-metric"><span class="elv-metric-label">' + label + '</span><span class="elv-metric-value" data-metric="' + key + '">–</span></div>';
  }

  function play(inst) {
    if (inst.timer) return;
    var btn = inst.container.querySelector(".elv-play");
    btn.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 640 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var btn = inst.container.querySelector(".elv-play");
    if (btn) btn.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }

  function reset(inst) {
    pause(inst);
    inst.cars = [];
    for (var i = 0; i < CARS; i++) inst.cars.push(makeCar(i));
    inst.ticks = 0;
    inst.served = 0;
    inst.waitSum = 0;
    inst.waitCount = 0;
    inst.lastDecision = "Reset. Press a floor's ▲/▼ button to raise a hall call.";
    render(inst);
  }

  function scenario(inst, name) {
    if (name === "single") raiseHallCall(inst, 4, "up");
    else if (name === "morning") { for (var f = 1; f <= FLOORS - 2; f++) raiseHallCall(inst, f, "up"); }
    else if (name === "lunch") { raiseHallCall(inst, 3, "up"); raiseHallCall(inst, 6, "down"); raiseHallCall(inst, 1, "up"); raiseHallCall(inst, 8, "down"); }
    render(inst);
  }

  function render(inst) {
    var c = inst.container;

    inst.cars.forEach(function (car, i) {
      var g = c.querySelector('[data-car="' + i + '"]');
      if (g) {
        g.style.transform = "translateY(" + carY(car.floor) + "px)";
        g.classList.toggle("is-open", car.state === "doors");
      }
      var dirEl = c.querySelector('[data-dir="' + i + '"]');
      if (dirEl) dirEl.textContent = car.dir === "up" ? "▲" : car.dir === "down" ? "▼" : "•";

      var head = c.querySelector('[data-head="' + i + '"]');
      if (head) head.textContent = "· floor " + car.floor + " · " + car.dir;

      ["idle", "up", "down", "doors"].forEach(function (s) {
        var chip = c.querySelector('[data-chip="' + i + "-" + s + '"]');
        if (chip) chip.classList.toggle("is-on", car.state === s);
      });

      var stops = allStops(car).sort(function (a, b) { return a - b; });
      var stopsEl = c.querySelector('[data-stops="' + i + '"]');
      if (stopsEl) stopsEl.innerHTML = "stops: <b>" + (stops.length ? stops.join(", ") : "none") + "</b>";

      var layer = c.querySelector('[data-stops-layer="' + i + '"]');
      if (layer) {
        var mk = "";
        stops.forEach(function (f) {
          var isCar = !!car.carCalls[f];
          mk += '<rect class="elv-stop' + (isCar ? " is-car" : "") + '" x="62" y="' + (carY(f) - 4) + '" width="8" height="8" rx="2"></rect>';
        });
        layer.innerHTML = mk;
      }
    });

    c.querySelectorAll(".elv-hallbtn").forEach(function (btn) {
      var f = parseInt(btn.getAttribute("data-floor"), 10);
      var d = btn.getAttribute("data-dir");
      var active = inst.cars.some(function (car) { return hallAt(car, f, d); });
      btn.classList.toggle("is-active", active);
    });

    var cap = c.querySelector(".elv-caption");
    if (cap) cap.textContent = inst.lastDecision;

    var pending = inst.cars.reduce(function (n, car) { return n + car.hallCalls.length; }, 0);
    setMetric(c, "ticks", inst.ticks);
    setMetric(c, "served", inst.served);
    setMetric(c, "pending", pending);
    setMetric(c, "wait", inst.waitCount ? (inst.waitSum / inst.waitCount).toFixed(1) + " ticks" : "–");
    if (inst.lens) updateLens(inst);
  }

  function setMetric(c, key, value) {
    var el = c.querySelector('[data-metric="' + key + '"]');
    if (el) el.textContent = value;
  }

  function lensConfig(inst) {
    return {
      classes: [
        { id: "Building", label: "Building", stereotype: "class", x: 120, y: 80,
          owns: "Composition root: owns the floors and the cars.",
          fields: ["floors: Floor[]", "cars: ElevatorCar[]"] },
        { id: "Floor", label: "Floor", stereotype: "class", x: 120, y: 240,
          owns: "Only its own hall buttons; it never knows which car answers.",
          fields: ["number: int", "upButton", "downButton"],
          methods: ["raiseHallCall(dir)"] },
        { id: "ElevatorCar", label: "ElevatorCar", stereotype: "class", x: 380, y: 160,
          owns: "Its own floor, direction, doors, and assigned stops.",
          invariant: "Never moves while doors are open.",
          fields: ["id", "currentFloor", "direction", "state", "carCalls", "hallCalls"],
          methods: ["step()", "shouldStop()", "serveFloor()", "openDoors()"] },
        { id: "Dispatcher", label: "Dispatcher", stereotype: "class", x: 380, y: 360,
          owns: "Assignment and fairness across cars.",
          fields: ["cars", "scheduler", "pending"],
          methods: ["raiseHallCall()", "tick()", "assign()"] },
        { id: "Motor", label: "Motor", stereotype: "interface", x: 620, y: 70,
          owns: "Hardware abstraction for motion (testable, swappable).",
          methods: ["moveUp()", "moveDown()", "stop()"] },
        { id: "DoorDrive", label: "DoorDrive", stereotype: "interface", x: 620, y: 200,
          owns: "Hardware abstraction for the doors.",
          methods: ["open()", "close()"] },
        { id: "Direction", label: "Direction", stereotype: "enum", x: 620, y: 330,
          owns: "Value object.", fields: ["UP", "DOWN", "IDLE"] },
        { id: "CarState", label: "CarState", stereotype: "enum", x: 620, y: 460,
          owns: "Drives behaviour through the State pattern.",
          fields: ["IDLE", "MOVING_UP", "MOVING_DOWN", "DOORS_OPEN"] },
        { id: "Scheduler", label: "Scheduler", stereotype: "interface", x: 860, y: 250,
          owns: "Policy only — holds no car state.",
          methods: ["chooseCar(call, cars)", "nextStop(car)"] },
        { id: "LookScheduler", label: "LookScheduler", stereotype: "class", x: 860, y: 400,
          owns: "Concrete LOOK policy.", methods: ["chooseCar()"] },
        { id: "NearestCarScheduler", label: "NearestCarScheduler", stereotype: "class", x: 860, y: 520,
          owns: "Baseline nearest-car policy.", methods: ["chooseCar()"] },
      ],
      edges: [
        { from: "Building", to: "Floor", kind: "composition" },
        { from: "Building", to: "ElevatorCar", kind: "composition" },
        { from: "ElevatorCar", to: "Motor", kind: "composition" },
        { from: "ElevatorCar", to: "DoorDrive", kind: "composition" },
        { from: "ElevatorCar", to: "Direction", kind: "association" },
        { from: "ElevatorCar", to: "CarState", kind: "association" },
        { from: "Dispatcher", to: "ElevatorCar", kind: "aggregation" },
        { from: "Dispatcher", to: "Scheduler", kind: "depends" },
        { from: "LookScheduler", to: "Scheduler", kind: "implements" },
        { from: "NearestCarScheduler", to: "Scheduler", kind: "implements" },
      ],
      patterns: [
        { id: "state", label: "State", classes: ["ElevatorCar", "CarState"],
          note: "CarState drives per-state behaviour; \u201cmove while doors open\u201d becomes an unreachable transition guard, not a runtime hope." },
        { id: "strategy", label: "Strategy", classes: ["Dispatcher", "Scheduler", "LookScheduler", "NearestCarScheduler"],
          note: "Assignment policy is an interface, so LOOK and nearest-car swap without editing ElevatorCar. Use the Scheduler buttons and compare avg wait." },
      ],
      strategies: [
        { id: "look", label: "LOOK", note: "Serve every stop in the current direction, then reverse. Fewer reversals; usually lower average wait under load." },
        { id: "nearest", label: "Nearest-car", note: "Answer each call with the closest car. Simple, but more reversals and worse under heavy load." },
      ],
      strategyClasses: { look: "LookScheduler", nearest: "NearestCarScheduler" },
      defaultStrategy: inst.strategy,
      onStrategyChange: function (id) {
        inst.strategy = id;
        inst.served = 0;
        inst.waitSum = 0;
        inst.waitCount = 0;
        inst.lastDecision = "Scheduler = " + (id === "nearest" ? "nearest-car" : "LOOK") + ". Metrics reset — raise calls and compare avg wait.";
        render(inst);
      },
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["Building", "Floor"], note: "State the use cases, then scope: N floors, M cars, hall + car calls, low wait, no starvation." },
        { n: 2, label: "Core Entities", classes: ["ElevatorCar", "Floor", "Dispatcher"], note: "Objects with identity vs value objects (Direction, CarState, HallCall)." },
        { n: 3, label: "Responsibilities", classes: ["ElevatorCar", "Dispatcher"], note: "Car owns its own safe state; Dispatcher owns assignment and fairness; Scheduler owns policy only." },
        { n: 4, label: "Relationships + Interfaces", classes: ["Building", "Scheduler", "Motor", "DoorDrive"], note: "Composition for ownership; interfaces at the points that change (policy, hardware)." },
        { n: 5, label: "Class Diagram", classes: ["ElevatorCar", "Dispatcher", "Scheduler"], note: "Assemble classes, interfaces, enums, relationships; show key methods, not getters." },
        { n: 6, label: "Core Flows", classes: ["Dispatcher", "ElevatorCar", "Motor", "DoorDrive"], note: "Walk a hall call from button press to arrival, including the reversal." },
        { n: 7, label: "Critical Code", classes: ["ElevatorCar"], note: "step(), shouldStop(), serveFloor(), and LookScheduler.chooseCar() carry the design decisions." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["Scheduler", "ElevatorCar"], note: "Dedupe, car full, reversal, obstruction; a new policy is a new Scheduler, not a car rewrite." },
      ],
    };
  }

  function updateLens(inst) {
    if (!inst.lens) return;
    var anyDoors = false, anyMove = false;
    inst.cars.forEach(function (car) {
      if (car.state === "doors") anyDoors = true;
      else if (car.state === "up" || car.state === "down") anyMove = true;
    });
    var stratCls = inst.strategy === "nearest" ? "NearestCarScheduler" : "LookScheduler";
    if (anyDoors) {
      inst.lens.setActive(["Dispatcher", "ElevatorCar", "DoorDrive"]);
      inst.lens.setTrace([
        { cls: "Dispatcher", method: "tick" },
        { cls: "ElevatorCar", method: "step" },
        { cls: "ElevatorCar", method: "shouldStop" },
        { cls: "DoorDrive", method: "open" },
      ]);
    } else if (anyMove) {
      inst.lens.setActive(["Dispatcher", "ElevatorCar", "Motor", stratCls]);
      inst.lens.setTrace([
        { cls: "Dispatcher", method: "tick" },
        { cls: "ElevatorCar", method: "step" },
        { cls: stratCls, method: "nextStop" },
        { cls: "Motor", method: "move" },
      ]);
    } else {
      inst.lens.setActive(["Dispatcher", "ElevatorCar"]);
      inst.lens.setTrace([{ cls: "Dispatcher", method: "tick" }, { cls: "ElevatorCar", method: "step" }]);
    }
  }

  function setAssignmentTrace(inst) {
    if (!inst.lens) return;
    var stratCls = inst.strategy === "nearest" ? "NearestCarScheduler" : "LookScheduler";
    inst.lens.setActive(["Dispatcher", "Scheduler", stratCls, "ElevatorCar"]);
    inst.lens.setTrace([
      { cls: "Dispatcher", method: "raiseHallCall" },
      { cls: stratCls, method: "chooseCar" },
      { cls: "ElevatorCar", method: "addHallCall" },
    ]);
  }

  function initialize() {
    document.querySelectorAll(".elevator-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
