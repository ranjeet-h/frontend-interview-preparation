/* ATM (LLD) visualizer: state machine + money-atomic withdraw + rollback,
   with the shared LLD design lens. Prefix: atv-. No dependencies. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var VW = 520, VH = 300;
  var ACCOUNTS = [
    { name: "Alice", pin: "1234", balance: 50000 },
    { name: "Bob", pin: "5678", balance: 30000 },
  ];
  var AMOUNTS = [2000, 5000, 10000, 20000];
  var MAX_RETRIES = 3;

  function money(c) { return "$" + (c / 100).toFixed(2); }

  function build(container) {
    var uid = "atv" + build.count;
    build.count += 1;
    container.classList.add("atv");

    var inst = {
      uid: uid,
      container: container,
      state: "idle",
      accounts: ACCOUNTS.map(function (a) { return { name: a.name, pin: a.pin, balance: a.balance }; }),
      cash: { 10000: 5, 5000: 10, 2000: 20 },
      session: null,
      pin: "",
      retries: 0,
      txn: null,
      amount: 0,
      tray: [],
      dispensed: 0,
      txns: 0,
      speed: 1,
      timer: null,
      strategy: { dispense: "largest", failure: "rollback" },
      lens: null,
      lastDecision: "Insert a card to start: IDLE → CARD_INSERTED → AUTHENTICATED → DISPENSING → DONE.",
      bad: false,
    };

    var acctOpts = inst.accounts.map(function (a, i) { return '<option value="' + i + '">' + a.name + "</option>"; }).join("");
    var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(function (d) { return '<button type="button" class="atv-key" data-key="' + d + '">' + d + "</button>"; }).join("");

    container.innerHTML =
      '<div class="atv-toolbar">' +
      '<button type="button" class="atv-btn atv-primary atv-play">▶ Play</button>' +
      '<button type="button" class="atv-btn atv-reset">Reset</button>' +
      '<span class="atv-sep"></span>' +
      '<span data-when="idle"><label class="atv-field">Account <select class="atv-select atv-acct">' + acctOpts + "</select></label>" +
      '<button type="button" class="atv-btn atv-primary atv-insert">Insert card</button></span>' +
      '<span data-when="pin"><span class="atv-pinbox" data-pin>____</span>' +
      '<span class="atv-keypad">' + keys + '<button type="button" class="atv-key atv-wide" data-key="0">0</button>' +
      '<button type="button" class="atv-key atv-wide" data-key="clr">Clear</button>' +
      '<button type="button" class="atv-key atv-wide" data-key="ent">Enter</button></span></span>' +
      '<span data-when="menu"><button type="button" class="atv-btn atv-primary" data-txn="withdraw">Withdraw</button>' +
      '<button type="button" class="atv-btn" data-txn="deposit">Deposit</button>' +
      '<button type="button" class="atv-btn" data-txn="balance">Balance</button>' +
      '<button type="button" class="atv-btn atv-eject">Eject card</button></span>' +
      '<span data-when="amount">' + AMOUNTS.map(function (a) { return '<button type="button" class="atv-btn" data-amount="' + a + '">' + money(a) + "</button>"; }).join("") +
      '<button type="button" class="atv-btn atv-primary atv-confirm">Confirm</button>' +
      '<button type="button" class="atv-btn atv-cancel">Cancel</button></span>' +
      '<span data-when="done"><button type="button" class="atv-btn atv-primary atv-eject">Eject card</button></span>' +
      "</div>" +
      '<div class="atv-stage"><svg class="atv-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="ATM">' +
      '<rect class="atv-body" x="16" y="10" width="488" height="280" rx="16"></rect>' +
      '<rect class="atv-screen" x="56" y="30" width="408" height="96" rx="8"></rect>' +
      '<text class="atv-screen-state" x="72" y="54" data-screen-state></text>' +
      '<text class="atv-screen-msg" x="72" y="80" data-screen-msg></text>' +
      '<text class="atv-screen-msg" x="72" y="104" data-screen-msg2></text>' +
      '<rect class="atv-slot" x="56" y="150" width="130" height="42" rx="8"></rect>' +
      '<text class="atv-slot-text" x="66" y="176">CARD</text>' +
      '<rect class="atv-card" x="96" y="158" width="80" height="26" rx="4" data-card style="display:none"></rect>' +
      '<rect class="atv-tray" x="212" y="150" width="252" height="110" rx="8"></rect>' +
      '<text class="atv-tray-text" x="224" y="172" data-tray-text>cash tray</text>' +
      '<g data-notes></g>' +
      "</svg></div>" +
      '<div class="atv-readout">' +
      '<span>State <span class="atv-states">' +
      ["idle", "pin", "menu", "amount", "processing", "done"].map(function (s) {
        return '<span class="atv-chip" data-state="' + s + '">' + s.toUpperCase() + "</span>";
      }).join("") +
      "</span></span>" +
      '<span>Balance <b data-balance>—</b></span>' +
      '<span>PIN tries <b data-retries>0</b></span>' +
      "</div>" +
      '<div class="atv-caption" role="status" aria-live="polite"></div>' +
      '<div class="atv-metrics">' +
      metric("Transactions", "txns") + metric("Dispensed", "disp") + metric("Cash in ATM", "cash") +
      "</div>" +
      '<div class="atv-lens" data-lens></div>' +
      '<p class="atv-hint">Withdraw debits the account <b>first</b>, then dispenses; a jam runs <b>AccountService.reverse</b> so the customer is never charged without cash.</p>';

    // ---- events -------------------------------------------------------------
    container.querySelector(".atv-insert").addEventListener("click", function () {
      insertCard(inst, parseInt(container.querySelector(".atv-acct").value, 10));
    });
    container.querySelectorAll("[data-key]").forEach(function (b) {
      b.addEventListener("click", function () { pressKey(inst, b.getAttribute("data-key")); });
    });
    container.querySelectorAll("[data-txn]").forEach(function (b) {
      b.addEventListener("click", function () { chooseTxn(inst, b.getAttribute("data-txn")); });
    });
    container.querySelectorAll("[data-amount]").forEach(function (b) {
      b.addEventListener("click", function () { inst.amount = parseInt(b.getAttribute("data-amount"), 10); inst.lastDecision = "Amount " + money(inst.amount) + " — press Confirm."; render(inst); });
    });
    container.querySelector(".atv-confirm").addEventListener("click", function () { confirmTxn(inst); });
    container.querySelector(".atv-cancel").addEventListener("click", function () { inst.txn = null; inst.state = "menu"; inst.lastDecision = "Cancelled. Choose a transaction."; render(inst); });
    container.querySelectorAll(".atv-eject").forEach(function (b) { b.addEventListener("click", function () { eject(inst); }); });
    container.querySelector(".atv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".atv-reset").addEventListener("click", function () { reset(inst); });

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="atv-metric"><span class="atv-metric-label">' + label + '</span><span class="atv-metric-value" data-metric="' + key + '">–</span></div>';
  }

  function insertCard(inst, idx) {
    inst.session = { accountIdx: idx, account: inst.accounts[idx] };
    inst.pin = ""; inst.retries = 0; inst.tray = [];
    inst.state = "pin"; inst.bad = false;
    inst.lastDecision = "Card inserted (" + inst.accounts[idx].name + "). Enter PIN.";
    trace(inst, ["CardInsertedState"], [
      { cls: "ATM", method: "insertCard" },
      { cls: "CardReader", method: "read" },
      { cls: "CardInsertedState", method: "enterPin" },
    ]);
    render(inst);
  }

  function pressKey(inst, k) {
    if (inst.state !== "pin") return;
    if (k === "clr") { inst.pin = ""; }
    else if (k === "ent") { enterPin(inst); return; }
    else if (inst.pin.length < 4) inst.pin += k;
    render(inst);
  }

  function enterPin(inst) {
    var acct = inst.accounts[inst.session.accountIdx];
    if (inst.pin === acct.pin) {
      inst.state = "menu"; inst.bad = false;
      inst.lastDecision = "PIN accepted. Choose a transaction.";
      trace(inst, ["AuthenticatedState"], [
        { cls: "CardInsertedState", method: "enterPin" },
        { cls: "AccountService", method: "authenticate" },
        { cls: "AuthenticatedState", method: "select" },
      ]);
    } else {
      inst.retries += 1; inst.bad = true;
      if (inst.retries >= MAX_RETRIES) { inst.lastDecision = "Too many wrong PINs — card ejected."; eject(inst); return; }
      inst.lastDecision = "Invalid PIN (" + inst.retries + "/" + MAX_RETRIES + ").";
      inst.pin = "";
    }
    render(inst);
  }

  function chooseTxn(inst, t) {
    inst.txn = t; inst.bad = false;
    if (t === "balance") {
      inst.txns += 1;
      inst.state = "done";
      inst.lastDecision = "Balance enquiry: " + money(inst.session.account.balance) + ".";
      trace(inst, ["AuthenticatedState"], [
        { cls: "AuthenticatedState", method: "select" },
        { cls: "BalanceTransaction", method: "execute" },
        { cls: "AccountService", method: "balance" },
      ]);
      render(inst); return;
    }
    inst.state = "amount"; inst.amount = 0;
    inst.lastDecision = (t === "withdraw" ? "Withdraw" : "Deposit") + ": choose an amount, then Confirm.";
    render(inst);
  }

  function computeNotes(inst, amount) {
    var inv = { 10000: inst.cash[10000], 5000: inst.cash[5000], 2000: inst.cash[2000] };
    var denoms = inst.strategy.dispense === "smallest" ? [2000, 5000, 10000] : [10000, 5000, 2000];
    var notes = [];
    denoms.forEach(function (d) {
      var take = Math.min(inv[d], Math.floor(amount / d));
      if (take > 0) { amount -= take * d; inv[d] -= take; for (var i = 0; i < take; i++) notes.push(d); }
    });
    if (amount !== 0) return null;
    return { notes: notes, inv: inv };
  }

  function confirmTxn(inst) {
    if (!inst.amount) { inst.bad = true; inst.lastDecision = "Choose an amount first."; render(inst); return; }
    var amount = inst.amount, acct = inst.session.account;
    inst.state = "processing"; render(inst);

    setTimeout(function () {
      if (inst.txn === "deposit") {
        acct.balance += amount; inst.txns += 1; inst.state = "done"; inst.bad = false;
        inst.lastDecision = "DepositTransaction.execute → AccountService.credit(" + money(amount) + "). New balance " + money(acct.balance) + ".";
        trace(inst, ["DepositTransaction"], [
          { cls: "AuthenticatedState", method: "select" },
          { cls: "DepositTransaction", method: "execute" },
          { cls: "AccountService", method: "credit" },
        ]);
        render(inst); return;
      }

      // withdraw: money-atomic path
      if (acct.balance < amount) {
        inst.state = "done"; inst.bad = true;
        inst.lastDecision = "Insufficient funds: balance " + money(acct.balance) + " < " + money(amount) + ". Nothing debited.";
        render(inst); return;
      }
      var plan = computeNotes(inst, amount);
      if (!plan) {
        inst.state = "done"; inst.bad = true;
        inst.lastDecision = "CashDispenser.canDispense(" + money(amount) + ") = false — the ATM cannot make that amount. Nothing debited.";
        render(inst); return;
      }

      acct.balance -= amount; // 1. debit first
      var jam = Math.random() < 0.15;
      if (jam && inst.strategy.failure === "retry") {
        inst.lastDecision = "Dispenser jammed — failure policy = retry…";
        render(inst);
        jam = Math.random() < 0.35; // retry may also fail
      }
      if (jam) {
        acct.balance += amount; // 3. compensating reverse
        inst.state = "done"; inst.bad = true;
        inst.txns += 1;
        inst.lastDecision = "Dispenser jammed → AccountService.reverse(" + money(amount) + "). Account restored to " + money(acct.balance) + ".";
        trace(inst, ["WithdrawTransaction", "AccountService"], [
          { cls: "WithdrawTransaction", method: "execute" },
          { cls: "AccountService", method: "debit" },
          { cls: "CashDispenser", method: "dispense" },
          { cls: "AccountService", method: "reverse" },
        ]);
        render(inst); return;
      }

      inst.cash = plan.inv;
      inst.tray = plan.notes;
      inst.dispensed += 1;
      inst.txns += 1;
      inst.state = "done"; inst.bad = false;
      inst.lastDecision = "WithdrawTransaction.execute → debit " + money(amount) + " → dispense " + plan.notes.map(money).join(" + ") + ". Balance " + money(acct.balance) + ".";
      trace(inst, ["WithdrawTransaction", "CashDispenser", "AccountService"], [
        { cls: "WithdrawTransaction", method: "execute" },
        { cls: "AccountService", method: "debit" },
        { cls: "CashDispenser", method: "dispense" },
      ]);
      render(inst);
    }, 520);
  }

  function eject(inst) {
    inst.state = "idle"; inst.session = null; inst.pin = ""; inst.txn = null; inst.amount = 0; inst.retries = 0;
    inst.lastDecision = "Card ejected. Session ended → IDLE.";
    render(inst);
  }

  function reset(inst) {
    pause(inst);
    inst.state = "idle";
    inst.accounts = ACCOUNTS.map(function (a) { return { name: a.name, pin: a.pin, balance: a.balance }; });
    inst.cash = { 10000: 5, 5000: 10, 2000: 20 };
    inst.session = null; inst.pin = ""; inst.retries = 0; inst.txn = null; inst.amount = 0; inst.tray = [];
    inst.dispensed = 0; inst.txns = 0;
    inst.lastDecision = "Reset.";
    render(inst);
  }

  function tick(inst) {
    if (inst.state === "processing") return;
    if (inst.state === "idle") { insertCard(inst, Math.floor(Math.random() * inst.accounts.length)); return; }
    if (inst.state === "pin") {
      var acct = inst.accounts[inst.session.accountIdx];
      inst.pin = acct.pin; enterPin(inst); return;
    }
    if (inst.state === "menu") { chooseTxn(inst, Math.random() < 0.75 ? "withdraw" : "deposit"); return; }
    if (inst.state === "amount") {
      if (!inst.amount) inst.amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
      confirmTxn(inst); return;
    }
    if (inst.state === "done") { eject(inst); return; }
  }

  function play(inst) {
    if (inst.timer) return;
    var b = inst.container.querySelector(".atv-play");
    if (b) b.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 1250 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var b = inst.container.querySelector(".atv-play");
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

  function cashTotal(inst) { return inst.cash[10000] * 10000 + inst.cash[5000] * 5000 + inst.cash[2000] * 2000; }

  function render(inst) {
    var c = inst.container;
    c.dataset.state = inst.state;

    var stateLabel = inst.state === "pin" ? "CARD_INSERTED" : inst.state === "menu" || inst.state === "amount" ? "AUTHENTICATED" : inst.state.toUpperCase();
    c.querySelector("[data-screen-state]").textContent = stateLabel;
    c.querySelector("[data-screen-msg]").textContent = inst.lastDecision.length > 52 ? inst.lastDecision.slice(0, 52) + "…" : inst.lastDecision;
    c.querySelector("[data-screen-msg2]").textContent = inst.session ? "Account: " + inst.session.account.name + " · " + money(inst.session.account.balance) : "";
    c.querySelector("[data-pin]").textContent = (inst.pin + "____").slice(0, 4);
    c.querySelector("[data-card]").style.display = inst.session ? "" : "none";

    ["idle", "pin", "menu", "amount", "processing", "done"].forEach(function (s) {
      var chip = c.querySelector('[data-state="' + s + '"]');
      if (chip) chip.classList.toggle("is-on", inst.state === s);
    });

    // tray notes
    var notes = c.querySelector("[data-notes]");
    notes.innerHTML = inst.tray.map(function (v, i) {
      var x = 226 + (i % 5) * 46, y = 186 + Math.floor(i / 5) * 30;
      return '<g><rect class="atv-note" x="' + x + '" y="' + y + '" width="42" height="24" rx="4"></rect>' +
        '<text class="atv-note-text" x="' + (x + 21) + '" y="' + (y + 16) + '" text-anchor="middle">$' + (v / 100) + "</text></g>";
    }).join("");
    c.querySelector("[data-tray-text]").textContent = inst.tray.length ? inst.tray.length + " note(s) dispensed" : "cash tray";

    c.querySelector("[data-balance]").textContent = inst.session ? money(inst.session.account.balance) : "—";
    c.querySelector("[data-retries]").textContent = inst.retries;

    var cap = c.querySelector(".atv-caption");
    cap.textContent = inst.lastDecision;
    cap.className = "atv-caption" + (inst.bad ? " is-bad" : "");

    setMetric(c, "txns", inst.txns);
    setMetric(c, "disp", inst.dispensed);
    setMetric(c, "cash", money(cashTotal(inst)));

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["ATM", "IdleState"]);
      inst.lens.setTrace([{ cls: "ATM", method: "insertCard" }]);
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
        { id: "ATM", label: "ATM", stereotype: "class", x: 150, y: 90,
          owns: "Holds the current State and delegates; owns reader, dispenser, account service, session.",
          fields: ["state", "reader", "dispenser", "accountService", "session"],
          methods: ["insertCard(card)", "enterPin(pin)", "select(txn)", "setState(s)"] },
        { id: "Session", label: "Session", stereotype: "class", x: 150, y: 270, owns: "The current customer context.", fields: ["card", "account"] },
        { id: "Card", label: "Card", stereotype: "class", x: 150, y: 440, owns: "A reference to an account.", fields: ["id", "accountRef"] },
        { id: "Account", label: "Account", stereotype: "class", x: 150, y: 610, owns: "Balance and owner.", fields: ["id", "balance"] },
        { id: "CardReader", label: "CardReader", stereotype: "interface", x: 440, y: 90, owns: "Hardware seam for the card.", methods: ["read()", "eject()"] },
        { id: "CashDispenser", label: "CashDispenser", stereotype: "interface", x: 440, y: 270, owns: "Note inventory; can fail (jam).", methods: ["canDispense(amt)", "dispense(amt)"] },
        { id: "AccountService", label: "AccountService", stereotype: "interface", x: 440, y: 450, owns: "The bank boundary; debit/credit/reverse.", methods: ["authenticate()", "debit()", "credit()", "reverse()"] },
        { id: "Transaction", label: "Transaction", stereotype: "interface", x: 440, y: 630, owns: "One operation.", methods: ["execute(session, amount)"] },
        { id: "ATMState", label: "ATMState", stereotype: "interface", x: 740, y: 90, owns: "Per-state rules and legal transitions.", methods: ["insertCard/enterPin/select/eject"] },
        { id: "IdleState", label: "IdleState", stereotype: "class", x: 740, y: 240, owns: "Waiting for a card.", methods: ["insertCard()"] },
        { id: "CardInsertedState", label: "CardInsertedState", stereotype: "class", x: 740, y: 390, owns: "Waiting for a PIN.", methods: ["enterPin()"] },
        { id: "AuthenticatedState", label: "AuthenticatedState", stereotype: "class", x: 740, y: 540, owns: "Menu and transaction selection.", methods: ["select()"] },
        { id: "DispensingState", label: "DispensingState", stereotype: "class", x: 740, y: 690, owns: "Cash leaving; reverse on jam.", methods: ["(auto) → DONE"] },
        { id: "WithdrawTransaction", label: "WithdrawTransaction", stereotype: "class", x: 1010, y: 260, owns: "Debit → dispense → reverse on failure.", methods: ["execute()"] },
        { id: "DepositTransaction", label: "DepositTransaction", stereotype: "class", x: 1010, y: 430, owns: "Credit only.", methods: ["execute()"] },
        { id: "BalanceTransaction", label: "BalanceTransaction", stereotype: "class", x: 1010, y: 600, owns: "Read-only.", methods: ["execute()"] },
      ],
      edges: [
        { from: "ATM", to: "CardReader", kind: "composition" },
        { from: "ATM", to: "CashDispenser", kind: "composition" },
        { from: "ATM", to: "AccountService", kind: "composition" },
        { from: "ATM", to: "ATMState", kind: "association" },
        { from: "ATM", to: "Session", kind: "composition" },
        { from: "Session", to: "Card", kind: "association" },
        { from: "Session", to: "Account", kind: "association" },
        { from: "IdleState", to: "ATMState", kind: "implements" },
        { from: "CardInsertedState", to: "ATMState", kind: "implements" },
        { from: "AuthenticatedState", to: "ATMState", kind: "implements" },
        { from: "DispensingState", to: "ATMState", kind: "implements" },
        { from: "WithdrawTransaction", to: "Transaction", kind: "implements" },
        { from: "DepositTransaction", to: "Transaction", kind: "implements" },
        { from: "BalanceTransaction", to: "Transaction", kind: "implements" },
        { from: "WithdrawTransaction", to: "AccountService", kind: "depends" },
        { from: "WithdrawTransaction", to: "CashDispenser", kind: "depends" },
      ],
      patterns: [
        { id: "state", label: "State", classes: ["ATM", "ATMState", "IdleState", "CardInsertedState", "AuthenticatedState", "DispensingState"],
          note: "Behavior depends on the session state, so each state owns its legal transitions. 'Never dispense without auth' becomes a guard, not a hope." },
        { id: "strategy", label: "Strategy", classes: ["Transaction", "WithdrawTransaction", "DepositTransaction", "BalanceTransaction"],
          note: "Each operation is a Transaction strategy; adding a transfer does not touch the ATM states. The dispense order and failure policy are also swappable." },
      ],
      strategyGroups: [
        { id: "dispense", label: "Dispense order", options: [
            { id: "largest", label: "Largest first", note: "Prefer $100s, then $50s, then $20s — fewest notes." },
            { id: "smallest", label: "Smallest first", note: "Prefer $20s upward — different note mix for the same amount." },
          ], default: "largest", classMap: { largest: "CashDispenser", smallest: "CashDispenser" },
          onChange: function (id) { inst.strategy.dispense = id; inst.lastDecision = "Dispense order = " + id + "."; render(inst); } },
        { id: "failure", label: "On jam", options: [
            { id: "rollback", label: "Reverse", note: "Compensate: AccountService.reverse restores the debit. The customer is never charged without cash." },
            { id: "retry", label: "Retry", note: "Attempt the dispense again; only reverse if the retry also fails. Simpler, but a retry can double-dispense if not idempotent." },
          ], default: "rollback", classMap: { rollback: "WithdrawTransaction", retry: "WithdrawTransaction" },
          onChange: function (id) { inst.strategy.failure = id; inst.lastDecision = "Failure policy = " + id + "."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["ATM", "Account"], note: "Insert card, PIN, withdraw/deposit/balance, dispense, eject — scope transfers out." },
        { n: 2, label: "Core Entities", classes: ["Card", "Account", "Session"], note: "Nouns: ATM, card, account, dispenser, reader, session, transaction." },
        { n: 3, label: "Responsibilities", classes: ["ATM", "AccountService"], note: "States own transitions; bank owns money; dispenser owns notes — no God class." },
        { n: 4, label: "Relationships + Interfaces", classes: ["CardReader", "CashDispenser", "AccountService", "Transaction"], note: "Has-a for hardware; interfaces at hardware and operations." },
        { n: 5, label: "Class Diagram", classes: ["ATM", "ATMState", "Transaction"], note: "The state hierarchy plus the transaction strategy hierarchy." },
        { n: 6, label: "Core Flows", classes: ["AuthenticatedState", "WithdrawTransaction"], note: "Auth flow, and the withdraw path with reverse on jam." },
        { n: 7, label: "Critical Code", classes: ["WithdrawTransaction"], note: "Debit → dispense → reverse is the whole correctness story." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["CashDispenser", "AccountService"], note: "Jam, insufficient cash/funds, timeout, partial dispense; new ops/hardware = new implementations." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".atm-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
