/* Splitwise (LLD) visualizer: ledger + split strategy + debt simplification,
   with the shared LLD design lens. Prefix: swv-. No dependencies. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var USERS = ["Alice", "Bob", "Carol", "Dave"];
  var PERCENT = [50, 20, 20, 10];
  var AMOUNTS = [1000, 2000, 4000, 6000, 10000];
  var CX = 300, CY = 200, RAD = 125, NR = 36;
  var VW = 600, VH = 400;

  function money(c) { return "$" + (c / 100).toFixed(2); }
  function pos(i) {
    var ang = (-90 + i * 90) * Math.PI / 180;
    return { x: CX + RAD * Math.cos(ang), y: CY + RAD * Math.sin(ang) };
  }
  function qpoint(g, t) {
    var mt = 1 - t;
    return { x: mt * mt * g.sx + 2 * mt * t * g.cx + t * t * g.ex, y: mt * mt * g.sy + 2 * mt * t * g.cy + t * t * g.ey };
  }
  function edgeGeom(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    var sx = a.x + ux * (NR + 4), sy = a.y + uy * (NR + 4);
    var ex = b.x - ux * (NR + 12), ey = b.y - uy * (NR + 12);
    var mx = (sx + ex) / 2, my = (sy + ey) / 2;
    var px = -uy, py = ux, curve = 26;
    return { sx: sx, sy: sy, ex: ex, ey: ey, cx: mx + px * curve, cy: my + py * curve };
  }

  function build(container) {
    var uid = "swv" + build.count;
    build.count += 1;
    container.classList.add("swv");

    var inst = {
      uid: uid,
      container: container,
      expenses: [],
      log: [],
      totalSpent: 0,
      settledCount: 0,
      speed: 1,
      timer: null,
      strategy: { split: "equal", simplify: "greedy" },
      lens: null,
      lastDecision: "Add an expense, then Settle up. Or press ▶ Play.",
    };

    var payerOpts = USERS.map(function (u, i) { return '<option value="' + i + '">' + u + "</option>"; }).join("");
    var amountOpts = AMOUNTS.map(function (a) { return '<option value="' + a + '">' + money(a) + "</option>"; }).join("");

    var nodesSvg = USERS.map(function (u, i) {
      var p = pos(i);
      return (
        '<g data-node="' + i + '" transform="translate(' + p.x + "," + p.y + ')">' +
        '<circle class="swv-nodecircle" r="' + NR + '" data-circle="' + i + '"></circle>' +
        '<text class="swv-nodename" x="0" y="-2" text-anchor="middle">' + u + "</text>" +
        '<text class="swv-nodenet" x="0" y="16" text-anchor="middle" data-net="' + i + '"></text>' +
        "</g>"
      );
    }).join("");

    container.innerHTML =
      '<div class="swv-toolbar">' +
      '<button type="button" class="swv-btn swv-primary swv-play">▶ Play</button>' +
      '<button type="button" class="swv-btn swv-settle">Settle up</button>' +
      '<button type="button" class="swv-btn swv-reset">Reset</button>' +
      '<span class="swv-sep"></span>' +
      '<label class="swv-field">Paid by <select class="swv-select swv-payer">' + payerOpts + "</select></label>" +
      '<label class="swv-field">Amount <select class="swv-select swv-amount">' + amountOpts + "</select></label>" +
      '<button type="button" class="swv-btn swv-add">Add expense</button>' +
      "</div>" +
      '<div class="swv-stage"><svg class="swv-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Debt graph">' +
      '<g data-edges></g>' + nodesSvg + "</svg></div>" +
      '<div class="swv-cards">' +
      USERS.map(function (u, i) {
        return '<div class="swv-card"><span class="swv-card-name">' + u + '</span><span class="swv-card-net" data-card="' + i + '">—</span></div>';
      }).join("") +
      "</div>" +
      '<div class="swv-caption" role="status" aria-live="polite"></div>' +
      '<div class="swv-log" data-log></div>' +
      '<div class="swv-metrics">' +
      metric("Expenses", "count") + metric("Total spent", "spent") + metric("Outstanding", "out") + metric("Transfers", "xfer") +
      "</div>" +
      '<div class="swv-lens" data-lens></div>' +
      '<p class="swv-hint">Ledger rule: the payer is <b>credited</b> the amount; every participant is <b>debited</b> their split — so balances always sum to zero.</p>';

    container.querySelector(".swv-add").addEventListener("click", function () {
      addExpense(inst, parseInt(container.querySelector(".swv-payer").value, 10), parseInt(container.querySelector(".swv-amount").value, 10));
    });
    container.querySelector(".swv-settle").addEventListener("click", function () { settleUp(inst); });
    container.querySelector(".swv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".swv-reset").addEventListener("click", function () {
      pause(inst);
      inst.expenses = [];
      inst.log = [];
      inst.totalSpent = 0;
      inst.settledCount = 0;
      inst.lastDecision = "Reset. Add an expense or press ▶ Play.";
      render(inst);
    });

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="swv-metric"><span class="swv-metric-label">' + label + '</span><span class="swv-metric-value" data-metric="' + key + '">–</span></div>';
  }

  function splitsFor(inst, amount, n) {
    var i;
    if (inst.strategy.split === "percent") {
      var arr = PERCENT.map(function (p) { return Math.round(amount * p / 100); });
      var sum = arr.reduce(function (a, b) { return a + b; }, 0);
      arr[n - 1] += amount - sum; // fix rounding so splits sum exactly
      return arr;
    }
    var base = Math.floor(amount / n);
    var rem = amount - base * n;
    var out = [];
    for (i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  function addExpense(inst, payer, amount) {
    var splits = splitsFor(inst, amount, USERS.length);
    inst.expenses.push({ payer: payer, amount: amount, splits: splits });
    inst.totalSpent += amount;
    inst.lastDecision = "Group.addExpense(payer=" + USERS[payer] + ", " + money(amount) + ") → " +
      inst.strategy.split + " split [" + splits.map(function (s) { return money(s); }).join(", ") + "] → BalanceSheet.apply.";
    trace(inst, ["Expense", "SplitStrategy", "BalanceSheet"], [
      { cls: "Group", method: "addExpense" },
      { cls: "Expense", method: "new" },
      { cls: inst.strategy.split === "percent" ? "PercentSplit" : "EqualSplit", method: "compute" },
      { cls: "BalanceSheet", method: "apply" },
    ]);
    render(inst);
  }

  function net(inst) {
    var n = USERS.map(function () { return 0; });
    inst.expenses.forEach(function (e) {
      n[e.payer] += e.amount;
      e.splits.forEach(function (s, i) { n[i] -= s; });
    });
    return n;
  }

  function rawDebts(inst) {
    var debts = {};
    inst.expenses.forEach(function (e) {
      e.splits.forEach(function (s, i) {
        if (i !== e.payer && s > 0) {
          var k = i + ">" + e.payer;
          debts[k] = (debts[k] || 0) + s;
        }
      });
    });
    return Object.keys(debts).map(function (k) {
      var p = k.split(">");
      return { from: +p[0], to: +p[1], amount: debts[k] };
    });
  }

  function greedy(inst) {
    var n = net(inst);
    var debtors = [], creditors = [];
    n.forEach(function (v, i) {
      if (v < -0.5) debtors.push({ i: i, v: -v });
      else if (v > 0.5) creditors.push({ i: i, v: v });
    });
    debtors.sort(function (a, b) { return b.v - a.v; });
    creditors.sort(function (a, b) { return b.v - a.v; });
    var out = [], di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
      var pay = Math.min(debtors[di].v, creditors[ci].v);
      out.push({ from: debtors[di].i, to: creditors[ci].i, amount: pay });
      debtors[di].v -= pay; creditors[ci].v -= pay;
      if (debtors[di].v <= 0.5) di++;
      if (creditors[ci].v <= 0.5) ci++;
    }
    return out;
  }

  function settleUp(inst) {
    var transfers = greedy(inst);
    if (!transfers.length) { inst.lastDecision = "Everyone is already settled up."; render(inst); return; }
    inst.log = transfers.map(function (t) { return USERS[t.from] + " → " + USERS[t.to] + " " + money(t.amount); });
    inst.settledCount += transfers.length;
    inst.expenses = [];
    inst.lastDecision = "SettlementService.simplify → " + transfers.length + " transfer(s): " + inst.log.join(", ") + ". Balances now zero.";
    trace(inst, ["GreedySimplifier", "Settlement", "BalanceSheet"], [
      { cls: "SettlementService", method: "simplify" },
      { cls: "GreedySimplifier", method: "simplify" },
      { cls: "Settlement", method: "new" },
      { cls: "BalanceSheet", method: "apply" },
    ]);
    render(inst);
  }

  function trace(inst, _u, steps) {
    if (!inst.lens) return;
    inst._traced = true;
    inst.lens.setActive(steps.map(function (s) { return s.cls; }).filter(function (c) { return c !== "Group"; }).concat(["Group"]));
    inst.lens.setTrace(steps);
  }

  function tick(inst) {
    var payer = Math.floor(Math.random() * USERS.length);
    var amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
    addExpense(inst, payer, amount);
  }
  function play(inst) {
    if (inst.timer) return;
    var b = inst.container.querySelector(".swv-play");
    if (b) b.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 1200 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var b = inst.container.querySelector(".swv-play");
    if (b) b.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }

  function render(inst) {
    var c = inst.container;
    var n = net(inst);

    USERS.forEach(function (u, i) {
      var cls = n[i] > 0.5 ? "is-credit" : n[i] < -0.5 ? "is-debit" : "is-zero";
      var circle = c.querySelector('[data-circle="' + i + '"]');
      if (circle) circle.setAttribute("class", "swv-nodecircle " + cls);
      var netEl = c.querySelector('[data-net="' + i + '"]');
      if (netEl) {
        netEl.textContent = Math.abs(n[i]) < 0.5 ? "settled" : (n[i] > 0 ? "+" : "−") + money(Math.abs(n[i]));
        netEl.setAttribute("class", "swv-nodenet " + cls);
      }
      var card = c.querySelector('[data-card="' + i + '"]');
      if (card) {
        card.textContent = Math.abs(n[i]) < 0.5 ? "$0.00" : (n[i] > 0 ? "+" : "−") + money(Math.abs(n[i]));
        card.setAttribute("class", "swv-card-net " + cls);
      }
    });

    // edges
    var edges = inst.strategy.simplify === "raw" ? rawDebts(inst) : greedy(inst);
    var greedyView = inst.strategy.simplify !== "raw";
    var svgEdges = c.querySelector("[data-edges]");
    var html = "";
    edges.forEach(function (e) {
      if (e.amount < 1) return;
      var g = edgeGeom(pos(e.from), pos(e.to));
      var mid = qpoint(g, 0.5);
      var ang = Math.atan2(g.ey - g.cy, g.ex - g.cx);
      var tx = g.ex, ty = g.ey, L = 11, W = 8;
      var dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      var arrow = [[tx, ty], [tx - dx * L + px * W / 2, ty - dy * L + py * W / 2], [tx - dx * L - px * W / 2, ty - dy * L - py * W / 2]];
      html +=
        '<path class="swv-edge' + (greedyView ? " is-greedy" : "") + '" d="M ' + g.sx + " " + g.sy + " Q " + g.cx + " " + g.cy + " " + g.ex + " " + g.ey + '"></path>' +
        '<polygon class="swv-arrow' + (greedyView ? " is-greedy" : "") + '" points="' + arrow.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"></polygon>' +
        '<text class="swv-elabel" x="' + mid.x.toFixed(1) + '" y="' + (mid.y - 4).toFixed(1) + '" text-anchor="middle">' + money(e.amount) + "</text>";
    });
    svgEdges.innerHTML = html;

    c.querySelector(".swv-caption").textContent = inst.lastDecision;
    var log = c.querySelector("[data-log]");
    log.innerHTML = inst.log.map(function (l) { return '<span class="swv-logitem">' + l + "</span>"; }).join("");

    var outstanding = n.reduce(function (a, v) { return a + Math.max(0, v); }, 0);
    setMetric(c, "count", inst.expenses.length);
    setMetric(c, "spent", money(inst.totalSpent));
    setMetric(c, "out", money(outstanding));
    setMetric(c, "xfer", inst.settledCount);

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["Group", "BalanceSheet"]);
      inst.lens.setTrace([{ cls: "Group", method: "balances" }]);
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
        { id: "Group", label: "Group", stereotype: "class", x: 150, y: 90,
          owns: "Membership and the list of expenses; it coordinates, it does not compute splits.",
          fields: ["members: User[]", "expenses: Expense[]"], methods: ["addExpense(e)", "balances()"] },
        { id: "User", label: "User", stereotype: "class", x: 150, y: 270, owns: "Identity only.", fields: ["id", "name"] },
        { id: "Expense", label: "Expense", stereotype: "class", x: 150, y: 450,
          owns: "The immutable record of one payment and its computed splits.",
          fields: ["payer", "amount", "participants", "splits"], methods: ["splits()", "payer()"] },
        { id: "Split", label: "Split", stereotype: "class", x: 150, y: 620, owns: "One participant's share.", fields: ["user", "amount"] },
        { id: "SplitStrategy", label: "SplitStrategy", stereotype: "interface", x: 450, y: 120,
          owns: "Dividing an amount among participants.", methods: ["compute(amount, participants)"] },
        { id: "EqualSplit", label: "EqualSplit", stereotype: "class", x: 450, y: 280, owns: "Even split with an explicit rounding rule.", methods: ["compute()"] },
        { id: "PercentSplit", label: "PercentSplit", stereotype: "class", x: 450, y: 440, owns: "Percentage split (must sum to 100).", methods: ["compute()"] },
        { id: "BalanceSheet", label: "BalanceSheet", stereotype: "class", x: 730, y: 120,
          owns: "Net balance per user — the sum-to-zero invariant lives here.",
          invariant: "A group's net balances always sum to zero.",
          fields: ["net: Map<User, Money>"], methods: ["apply(expense)", "apply(settlement)"] },
        { id: "Settlement", label: "Settlement", stereotype: "class", x: 730, y: 300, owns: "A recorded payment from one user to another.", fields: ["from", "to", "amount"] },
        { id: "DebtSimplifier", label: "DebtSimplifier", stereotype: "interface", x: 730, y: 470,
          owns: "Reducing raw debts to a small transfer set.", methods: ["simplify(balances)"] },
        { id: "GreedySimplifier", label: "GreedySimplifier", stereotype: "class", x: 730, y: 630, owns: "Greedy min-transfer matching.", methods: ["simplify()"] },
      ],
      edges: [
        { from: "Group", to: "User", kind: "aggregation" },
        { from: "Group", to: "Expense", kind: "composition" },
        { from: "Expense", to: "Split", kind: "composition" },
        { from: "Expense", to: "SplitStrategy", kind: "depends" },
        { from: "EqualSplit", to: "SplitStrategy", kind: "implements" },
        { from: "PercentSplit", to: "SplitStrategy", kind: "implements" },
        { from: "BalanceSheet", to: "Expense", kind: "depends" },
        { from: "BalanceSheet", to: "Settlement", kind: "depends" },
        { from: "GreedySimplifier", to: "DebtSimplifier", kind: "implements" },
        { from: "DebtSimplifier", to: "BalanceSheet", kind: "depends" },
      ],
      patterns: [
        { id: "strategy", label: "Strategy", classes: ["SplitStrategy", "EqualSplit", "PercentSplit", "DebtSimplifier", "GreedySimplifier"],
          note: "The split rule and the simplification rule both vary. Keep them behind interfaces; the ledger never changes. Use the policy buttons to swap them." },
        { id: "ledger", label: "Ledger", classes: ["BalanceSheet", "Expense", "Settlement"],
          note: "Balances are a fold over an append-only set of expenses and settlements, which is what makes the sum-to-zero invariant checkable." },
      ],
      strategyGroups: [
        { id: "split", label: "SplitStrategy", options: [
            { id: "equal", label: "Equal", note: "Split evenly; the rounding remainder is assigned so the splits sum exactly to the amount." },
            { id: "percent", label: "Percent 50/20/20/10", note: "Weighted split; percentages must sum to 100 and the last share absorbs rounding." },
          ], default: "equal", classMap: { equal: "EqualSplit", percent: "PercentSplit" },
          onChange: function (id) { inst.strategy.split = id; inst.lastDecision = "SplitStrategy = " + id + ". New expenses use this rule."; render(inst); } },
        { id: "simplify", label: "DebtSimplifier", options: [
            { id: "raw", label: "Raw", note: "Show pairwise debts as they arose per expense — often many edges." },
            { id: "greedy", label: "Greedy", note: "Reduce to the fewest transfers from net balances (greedy min-cash-flow)." },
          ], default: "greedy", classMap: { raw: "DebtSimplifier", greedy: "GreedySimplifier" },
          onChange: function (id) { inst.strategy.simplify = id; inst.lastDecision = "DebtSimplifier = " + id + " — the graph redraws."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["Group", "User"], note: "Groups, add expense, split rules, balances, settle up — scope multi-currency out." },
        { n: 2, label: "Core Entities", classes: ["Expense", "Split", "Settlement"], note: "Nouns: user, group, expense, split, settlement; SplitType is an enum." },
        { n: 3, label: "Responsibilities", classes: ["BalanceSheet", "Expense"], note: "Ledger owns balances; expense is a record; strategies own the rules — no God class." },
        { n: 4, label: "Relationships + Interfaces", classes: ["SplitStrategy", "DebtSimplifier"], note: "Has-a for group/expense; interfaces at split rules and simplification." },
        { n: 5, label: "Class Diagram", classes: ["Group", "Expense", "BalanceSheet"], note: "Composition of group→expense→split, plus the strategy interfaces." },
        { n: 6, label: "Core Flows", classes: ["Expense", "BalanceSheet"], note: "Add expense: compute splits → apply. Settle: simplify → apply settlements." },
        { n: 7, label: "Critical Code", classes: ["EqualSplit", "GreedySimplifier"], note: "Rounding to sum exactly, and the greedy min-transfer loop." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["SplitStrategy", "DebtSimplifier"], note: "Rounding, deleted members, partial/duplicate settlement; new rules are new implementations." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".splitwise-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
