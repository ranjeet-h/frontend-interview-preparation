/* Vending Machine (LLD) visualizer: state machine + payment/change policies,
   with the shared LLD design lens. Prefix: vmv-. No dependencies. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var COLS = 3, ROWS = 3, SLOT_W = 150, SLOT_H = 90, GAP = 16, LEFT = 20, TOP = 20;
  var VW = LEFT + COLS * SLOT_W + (COLS - 1) * GAP + 20;
  var VH = TOP + ROWS * SLOT_H + (ROWS - 1) * GAP + 10 + 34 + 20;

  var CATALOG = [
    { id: "A1", name: "Cola", price: 150, stock: 3 },
    { id: "A2", name: "Chips", price: 200, stock: 2 },
    { id: "A3", name: "Candy", price: 125, stock: 0 },
    { id: "B1", name: "Water", price: 100, stock: 4 },
    { id: "B2", name: "Coffee", price: 250, stock: 1 },
    { id: "B3", name: "Gum", price: 75, stock: 2 },
    { id: "C1", name: "Juice", price: 175, stock: 0 },
    { id: "C2", name: "Cookies", price: 225, stock: 3 },
    { id: "C3", name: "Nuts", price: 300, stock: 1 },
  ];

  function money(cents) { return "$" + (cents / 100).toFixed(2); }
  function slotX(i) { return LEFT + (i % COLS) * (SLOT_W + GAP); }
  function slotY(i) { return TOP + Math.floor(i / COLS) * (SLOT_H + GAP); }
  function trayY() { return TOP + ROWS * SLOT_H + (ROWS - 1) * GAP + 10; }

  function makeSlots() {
    return CATALOG.map(function (p) { return { id: p.id, name: p.name, price: p.price, stock: p.stock }; });
  }

  function build(container) {
    var uid = "vmv" + build.count;
    build.count += 1;
    container.classList.add("vmv");

    var inst = {
      uid: uid,
      container: container,
      slots: makeSlots(),
      state: "idle",
      selected: null,
      balance: 0,
      sales: 0,
      revenue: 0,
      tray: null,
      speed: 1,
      timer: null,
      strategy: { payment: "cash", change: "greedy" },
      lens: null,
      lastDecision: "Click a slot, insert money, then Buy. Or press ▶ Play to run customers.",
      bad: false,
    };

    var slotsSvg = inst.slots.map(function (s, i) {
      return (
        '<g class="vmv-slot" data-slot="' + s.id + '" transform="translate(' + slotX(i) + "," + slotY(i) + ')">' +
        '<rect class="vmv-slotrect" x="0" y="0" width="' + SLOT_W + '" height="' + SLOT_H + '" rx="10" fill="' + "var(--vmv-bg)" + '"></rect>' +
        '<text class="vmv-id" x="10" y="20">' + s.id + "</text>" +
        '<text class="vmv-name" x="' + SLOT_W / 2 + '" y="50" text-anchor="middle">' + s.name + "</text>" +
        '<text class="vmv-price" x="10" y="80">' + money(s.price) + "</text>" +
        '<text class="vmv-stock" x="' + (SLOT_W - 10) + '" y="80" text-anchor="end" data-stock="' + s.id + '"></text>' +
        "</g>"
      );
    }).join("");

    container.innerHTML =
      '<div class="vmv-toolbar">' +
      '<button type="button" class="vmv-btn vmv-primary vmv-play">▶ Play</button>' +
      '<button type="button" class="vmv-btn vmv-reset">Reset</button>' +
      '<span class="vmv-sep"></span>' +
      '<button type="button" class="vmv-btn vmv-money" data-coin="100">+$1</button>' +
      '<button type="button" class="vmv-btn vmv-money" data-coin="200">+$2</button>' +
      '<button type="button" class="vmv-btn vmv-money" data-coin="500">+$5</button>' +
      '<button type="button" class="vmv-btn vmv-primary vmv-buy">Buy</button>' +
      '<button type="button" class="vmv-btn vmv-refund">Refund</button>' +
      "</div>" +
      '<div class="vmv-stage"><svg class="vmv-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Vending machine slots">' +
      slotsSvg +
      '<rect class="vmv-tray" x="' + LEFT + '" y="' + trayY() + '" width="' + (VW - 2 * LEFT) + '" height="34" rx="8"></rect>' +
      '<text class="vmv-tray-text" x="' + (LEFT + 12) + '" y="' + (trayY() + 22) + '" data-tray>tray: —</text>' +
      "</svg></div>" +
      '<div class="vmv-readout">' +
      '<span>State <span class="vmv-states">' +
      '<span class="vmv-chip" data-state="idle">IDLE</span>' +
      '<span class="vmv-chip" data-state="hasMoney">HAS_MONEY</span>' +
      '<span class="vmv-chip is-disp" data-state="dispensing">DISPENSING</span>' +
      '<span class="vmv-chip" data-state="refunding">REFUNDING</span>' +
      "</span></span>" +
      '<span>Balance <b data-balance>$0.00</b></span>' +
      '<span>Selected <b data-selected>—</b></span>' +
      "</div>" +
      '<div class="vmv-caption" role="status" aria-live="polite"></div>' +
      '<div class="vmv-metrics">' +
      metric("Sales", "sales") + metric("Revenue", "rev") + metric("Items left", "left") +
      "</div>" +
      '<div class="vmv-lens" data-lens></div>' +
      '<p class="vmv-hint">Actions are handled by the current <b>State</b>: <b>IDLE.select</b> → <b>insert</b> → <b>HAS_MONEY.dispense</b> → <b>DISPENSING</b> → <b>IDLE</b>. A jam or cancel routes to <b>REFUNDING</b>.</p>';

    // ---- events -------------------------------------------------------------
    container.addEventListener("click", function (e) {
      var g = e.target.closest ? e.target.closest("[data-slot]") : null;
      if (g) select(inst, g.getAttribute("data-slot"));
    });
    container.querySelectorAll("[data-coin]").forEach(function (b) {
      b.addEventListener("click", function () { insert(inst, parseInt(b.getAttribute("data-coin"), 10)); });
    });
    container.querySelector(".vmv-buy").addEventListener("click", function () { buy(inst); });
    container.querySelector(".vmv-refund").addEventListener("click", function () { refund(inst); });
    container.querySelector(".vmv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".vmv-reset").addEventListener("click", function () {
      pause(inst);
      inst.slots = makeSlots();
      inst.state = "idle";
      inst.selected = null;
      inst.balance = 0;
      inst.sales = 0;
      inst.revenue = 0;
      inst.tray = null;
      inst.lastDecision = "Machine reset.";
      render(inst);
    });

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="vmv-metric"><span class="vmv-metric-label">' + label + '</span><span class="vmv-metric-value" data-metric="' + key + '">–</span></div>';
  }
  function slotById(inst, id) { return inst.slots.filter(function (s) { return s.id === id; })[0]; }

  function select(inst, id) {
    if (inst.state === "dispensing" || inst.state === "refunding") return;
    var s = slotById(inst, id);
    if (!s) return;
    if (s.stock <= 0) { inst.bad = true; inst.lastDecision = "Out of stock: " + s.name + " (" + id + "). IdleState.select refuses it."; render(inst); return; }
    inst.selected = id;
    inst.bad = false;
    inst.lastDecision = "IdleState.select(" + id + "): " + s.name + " costs " + money(s.price) + ". Insert money.";
    trace(inst, ["IdleState"], [{ cls: "IdleState", method: "select" }], ["IdleState", "Slot"]);
    render(inst);
  }

  function insert(inst, cents) {
    if (inst.state === "dispensing" || inst.state === "refunding") return;
    if (!inst.selected) { inst.bad = true; inst.lastDecision = "Select a product first."; render(inst); return; }
    inst.bad = false;
    inst.balance += cents;
    inst.state = "hasMoney";
    inst.lastDecision = "insert(" + money(cents) + ") → balance " + money(inst.balance) + ". State → HAS_MONEY.";
    trace(inst, ["HasMoneyState"], [{ cls: "HasMoneyState", method: "insert" }, { cls: "CashAcceptor", method: "insert" }], ["HasMoneyState", "CashAcceptor"]);
    render(inst);
  }

  function buy(inst) {
    if (inst.state !== "hasMoney") {
      if (inst.state === "idle" && inst.strategy.payment === "card") {
        // card can start a purchase directly
      } else {
        inst.bad = true; inst.lastDecision = "Buy only works in HAS_MONEY. Select and insert money first."; render(inst); return;
      }
    }
    var s = slotById(inst, inst.selected);
    if (!s) { inst.bad = true; inst.lastDecision = "No product selected."; render(inst); return; }
    if (s.stock <= 0) { inst.bad = true; inst.lastDecision = "Out of stock: " + s.name + "."; render(inst); return; }

    if (inst.strategy.payment === "card") inst.balance = s.price;
    if (inst.balance < s.price) {
      inst.bad = true; inst.lastDecision = "Insufficient funds: " + money(inst.balance) + " < " + money(s.price) + ". HasMoneyState.dispense refuses."; render(inst); return;
    }
    var change = inst.balance - s.price;
    if (inst.strategy.change === "exact" && change > 0) {
      inst.bad = true; inst.lastDecision = "Exact-change policy: needs exactly " + money(s.price) + " but has " + money(inst.balance) + ". Refusing the sale."; render(inst); return;
    }

    inst.bad = false;
    inst.state = "dispensing";
    inst.tray = s.name;
    inst.lastDecision = "HasMoneyState.dispense → DISPENSING: " + s.name + " for " + money(s.price) +
      (change > 0 ? " · change " + money(change) : "") + ".";
    trace(inst, ["DispensingState"], [
      { cls: "HasMoneyState", method: "dispense" },
      { cls: "Inventory", method: "decrement" },
      { cls: "Dispenser", method: "dispense" },
      { cls: "ChangeCalculator", method: "changeFor" },
    ], ["DispensingState", "Inventory", "Dispenser", "ChangeCalculator"]);
    render(inst);

    setTimeout(function () {
      s.stock -= 1;
      inst.sales += 1;
      inst.revenue += s.price;
      inst.balance = 0;
      inst.selected = null;
      inst.state = "idle";
      inst.lastDecision = "Dispensed " + s.name + " for " + money(s.price) + (change > 0 ? " · change " + money(change) + " returned" : "") + ". Back to IDLE.";
      render(inst);
    }, 720);
  }

  function refund(inst) {
    if (inst.state !== "hasMoney") { inst.bad = true; inst.lastDecision = "Nothing to refund — not in HAS_MONEY."; render(inst); return; }
    inst.bad = false;
    var amt = inst.balance;
    inst.state = "refunding";
    inst.balance = 0;
    inst.selected = null;
    inst.lastDecision = "HasMoneyState.refund → REFUNDING: returning " + money(amt) + ".";
    trace(inst, ["RefundingState"], [{ cls: "HasMoneyState", method: "refund" }, { cls: "CashAcceptor", method: "refund" }], ["RefundingState", "CashAcceptor"]);
    render(inst);
    setTimeout(function () { inst.state = "idle"; render(inst); }, 520);
  }

  function trace(inst, _unused, steps, active) {
    if (!inst.lens) return;
    inst._traced = true;
    inst.lens.setActive(active);
    inst.lens.setTrace(steps);
  }

  function randomInStock(inst) {
    var inStock = inst.slots.filter(function (s) { return s.stock > 0; });
    if (!inStock.length) return null;
    return inStock[Math.floor(Math.random() * inStock.length)];
  }
  function pickCoin() { var c = [100, 200, 500]; return c[Math.floor(Math.random() * c.length)]; }

  function tick(inst) {
    if (inst.state === "dispensing" || inst.state === "refunding") return;
    if (inst.state === "idle") {
      if (!inst.selected) {
        var s = randomInStock(inst);
        if (!s) { inst.lastDecision = "All slots empty."; render(inst); return; }
        select(inst, s.id);
      } else if (inst.strategy.payment === "card") {
        buy(inst);
      } else {
        insert(inst, pickCoin());
      }
      return;
    }
    if (inst.state === "hasMoney") {
      var s2 = slotById(inst, inst.selected);
      if (!s2) { refund(inst); return; }
      if (inst.strategy.payment === "cash" && inst.balance < s2.price) { insert(inst, pickCoin()); return; }
      if (Math.random() < 0.08) { refund(inst); return; }
      buy(inst);
    }
  }

  function play(inst) {
    if (inst.timer) return;
    var b = inst.container.querySelector(".vmv-play");
    if (b) b.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 1150 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var b = inst.container.querySelector(".vmv-play");
    if (b) b.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }

  function render(inst) {
    var c = inst.container;
    var left = 0;
    inst.slots.forEach(function (s) {
      left += s.stock;
      var g = c.querySelector('[data-slot="' + s.id + '"]');
      var st = c.querySelector('[data-stock="' + s.id + '"]');
      if (g) {
        g.classList.toggle("is-selected", inst.selected === s.id);
        g.classList.toggle("is-empty", s.stock <= 0);
        g.classList.toggle("is-dispensing", inst.state === "dispensing" && inst.selected === s.id);
      }
      if (st) {
        st.textContent = s.stock > 0 ? "×" + s.stock : "SOLD OUT";
        st.setAttribute("class", "vmv-stock" + (s.stock > 0 ? "" : " is-out"));
      }
    });

    ["idle", "hasMoney", "dispensing", "refunding"].forEach(function (s) {
      var chip = c.querySelector('[data-state="' + s + '"]');
      if (chip) chip.classList.toggle("is-on", inst.state === s);
    });
    c.querySelector("[data-balance]").textContent = money(inst.balance);
    c.querySelector("[data-selected]").textContent = inst.selected || "—";
    var tray = c.querySelector("[data-tray]");
    tray.textContent = "tray: " + (inst.tray || "—");
    tray.setAttribute("class", "vmv-tray-text" + (inst.tray ? " is-on" : ""));

    var cap = c.querySelector(".vmv-caption");
    cap.textContent = inst.lastDecision;
    cap.className = "vmv-caption" + (inst.bad ? " is-bad" : "");

    setMetric(c, "sales", inst.sales);
    setMetric(c, "rev", money(inst.revenue));
    setMetric(c, "left", left);

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["VendingMachine", "IdleState"]);
      inst.lens.setTrace([{ cls: "VendingMachine", method: "select" }]);
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
        { id: "VendingMachine", label: "VendingMachine", stereotype: "class", x: 160, y: 120,
          owns: "Holds the current State and delegates actions to it; owns inventory, cash, dispenser, change.",
          fields: ["inventory", "cash", "dispenser", "changeCalculator", "state"],
          methods: ["select(id)", "insert(amount)", "dispense()", "refund()", "setState(s)"] },
        { id: "Inventory", label: "Inventory", stereotype: "class", x: 160, y: 300,
          owns: "The set of slots and stock checks.", fields: ["slots: Slot[]"], methods: ["isAvailable(id)", "decrement(id)"] },
        { id: "Slot", label: "Slot", stereotype: "class", x: 160, y: 470,
          owns: "One position: its product and stock count.", fields: ["product", "stock"] },
        { id: "Product", label: "Product", stereotype: "class", x: 160, y: 620,
          owns: "A sellable item (value object).", fields: ["id", "name", "price"] },
        { id: "CashAcceptor", label: "CashAcceptor", stereotype: "class", x: 430, y: 120,
          owns: "The inserted balance.", fields: ["balance"], methods: ["insert(amount)", "refund()"] },
        { id: "Dispenser", label: "Dispenser", stereotype: "interface", x: 430, y: 300,
          owns: "Hardware seam; it can fail (jam).", methods: ["dispense(product)"] },
        { id: "ChangeCalculator", label: "ChangeCalculator", stereotype: "class", x: 430, y: 470,
          owns: "Change composition; it holds no balance.", methods: ["changeFor(amount)"] },
        { id: "SelectionPanel", label: "SelectionPanel", stereotype: "class", x: 430, y: 620,
          owns: "The buttons/keypad.", methods: ["onSelect(id)", "onInsert(amount)"] },
        { id: "State", label: "State", stereotype: "interface", x: 700, y: 110,
          owns: "Per-state rules and legal transitions.", methods: ["select/insert/dispense/refund"] },
        { id: "IdleState", label: "IdleState", stereotype: "class", x: 700, y: 250, owns: "Waiting for a selection.", methods: ["select()", "insert()"] },
        { id: "HasMoneyState", label: "HasMoneyState", stereotype: "class", x: 700, y: 390, owns: "Money inserted; can dispense or refund.", methods: ["insert()", "dispense()", "refund()"] },
        { id: "DispensingState", label: "DispensingState", stereotype: "class", x: 700, y: 530, owns: "Product leaving; refund on jam.", methods: ["(auto) → IDLE"] },
        { id: "RefundingState", label: "RefundingState", stereotype: "class", x: 700, y: 670, owns: "Returning inserted money.", methods: ["(auto) → IDLE"] },
        { id: "PaymentMethod", label: "PaymentMethod", stereotype: "interface", x: 950, y: 120,
          owns: "How money enters (cash, card).", methods: ["collect(amount)"] },
        { id: "ChangeStrategy", label: "ChangeStrategy", stereotype: "interface", x: 950, y: 300,
          owns: "How change is composed.", methods: ["changeFor(amount)"] },
      ],
      edges: [
        { from: "VendingMachine", to: "Inventory", kind: "composition" },
        { from: "VendingMachine", to: "CashAcceptor", kind: "composition" },
        { from: "VendingMachine", to: "Dispenser", kind: "composition" },
        { from: "VendingMachine", to: "ChangeCalculator", kind: "composition" },
        { from: "VendingMachine", to: "State", kind: "association" },
        { from: "Inventory", to: "Slot", kind: "composition" },
        { from: "Slot", to: "Product", kind: "association" },
        { from: "SelectionPanel", to: "VendingMachine", kind: "depends" },
        { from: "IdleState", to: "State", kind: "implements" },
        { from: "HasMoneyState", to: "State", kind: "implements" },
        { from: "DispensingState", to: "State", kind: "implements" },
        { from: "RefundingState", to: "State", kind: "implements" },
        { from: "ChangeCalculator", to: "ChangeStrategy", kind: "depends" },
        { from: "CashAcceptor", to: "PaymentMethod", kind: "depends" },
      ],
      patterns: [
        { id: "state", label: "State", classes: ["VendingMachine", "State", "IdleState", "HasMoneyState", "DispensingState", "RefundingState"],
          note: "Behavior depends on the current state, so each state owns its legal transitions. 'Never dispense without full payment' becomes a guard in HasMoneyState, not a hope." },
        { id: "strategy", label: "Strategy", classes: ["PaymentMethod", "ChangeStrategy", "CashAcceptor", "ChangeCalculator"],
          note: "Payment and change vary independently of the state machine. Swap them with the policy buttons and watch the same states behave differently." },
      ],
      strategyGroups: [
        { id: "payment", label: "Payment", options: [
            { id: "cash", label: "Cash", note: "Coins/notes enter through CashAcceptor.insert(amount); the customer must cover the price." },
            { id: "card", label: "Card", note: "PaymentMethod.collect(price) settles instantly, so Buy works without inserting coins." },
          ], default: "cash", classMap: { cash: "PaymentMethod", card: "PaymentMethod" },
          onChange: function (id) { inst.strategy.payment = id; inst.lastDecision = "PaymentMethod = " + id + "."; render(inst); } },
        { id: "change", label: "Change", options: [
            { id: "greedy", label: "Greedy", note: "Return whatever change is owed from the machine's coins." },
            { id: "exact", label: "Exact-only", note: "Refuse the sale unless the customer inserted exactly the price." },
          ], default: "greedy", classMap: { greedy: "ChangeStrategy", exact: "ChangeStrategy" },
          onChange: function (id) { inst.strategy.change = id; inst.lastDecision = "ChangeStrategy = " + id + "."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["VendingMachine", "SelectionPanel"], note: "Select, insert, dispense, change, refund, out-of-stock — then scope restocking out." },
        { n: 2, label: "Core Entities", classes: ["Slot", "Product", "Inventory"], note: "Slots and products are the nouns; Money and the state names are value objects." },
        { n: 3, label: "Responsibilities", classes: ["VendingMachine", "CashAcceptor"], note: "States own transitions; inventory owns stock; cash owns the balance — not one God class." },
        { n: 4, label: "Relationships + Interfaces", classes: ["PaymentMethod", "ChangeStrategy", "Dispenser"], note: "Has-a for parts; interfaces at payment, change, and the dispenser hardware seam." },
        { n: 5, label: "Class Diagram", classes: ["VendingMachine", "State"], note: "Composition of parts plus the State hierarchy and policy interfaces." },
        { n: 6, label: "Core Flows", classes: ["IdleState", "HasMoneyState", "DispensingState"], note: "Walk select → insert → dispense → change → IDLE, and the refund path." },
        { n: 7, label: "Critical Code", classes: ["HasMoneyState", "DispensingState"], note: "The dispense guard and the jam-refund path carry the correctness." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["PaymentMethod", "ChangeStrategy", "Dispenser"], note: "Jam, exact change, decline, double press; new payment/change = new implementation." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".vending-machine-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
