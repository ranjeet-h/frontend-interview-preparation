/* Payment System — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var LEDGER_ENTRIES = 2; // double-entry: debit + credit per payment
  var RECON_RATIO = 0.1; // reconciliation sweeps per payment
  var PAY_CAP = 2000; // payments/s per payment-service node
  var IDEM_CAP = 50000; // idempotency lookups/s per node
  var LEDGER_CAP = 5000; // ledger writes/s per shard
  var GATEWAY_CAP = 1000; // gateway charges/s per connection
  var WEBHOOK_CAP = 5000; // webhooks/s per worker
  var RECON_CAP = 10000; // reconciliation ops/s per worker
  var TARGET = 0.7;

  function name(k) {
    return { paymentsvc: "Payment service", idem: "Idempotency store", ledger: "Ledger", gateway: "Gateway", webhook: "Webhook handler", reconcile: "Reconciliation" }[k] || "Component";
  }

  function compute(state, pay, h) {
    var fmt = h.fmt, pct = h.pct;
    var recon = Math.max(1, Math.round(pay * RECON_RATIO));

    var svcUtil = pay / (state.paymentsvc * PAY_CAP);
    var idemUtil = pay / (state.idem * IDEM_CAP);
    var ledgerUtil = (pay * LEDGER_ENTRIES) / (state.ledger * LEDGER_CAP);
    var gatewayUtil = pay / (state.gateway * GATEWAY_CAP);
    var webhookUtil = pay / (state.webhook * WEBHOOK_CAP);
    var reconUtil = recon / (state.reconcile * RECON_CAP);

    var utils = { paymentsvc: svcUtil, idem: idemUtil, ledger: ledgerUtil, gateway: gatewayUtil, webhook: webhookUtil, reconcile: reconUtil };
    var required = {
      paymentsvc: Math.max(1, Math.ceil(pay / (PAY_CAP * TARGET))),
      idem: Math.max(1, Math.ceil(pay / (IDEM_CAP * TARGET))),
      ledger: Math.max(1, Math.ceil((pay * LEDGER_ENTRIES) / (LEDGER_CAP * TARGET))),
      gateway: Math.max(1, Math.ceil(pay / (GATEWAY_CAP * TARGET))),
      webhook: Math.max(1, Math.ceil(pay / (WEBHOOK_CAP * TARGET))),
      reconcile: Math.max(1, Math.ceil(recon / (RECON_CAP * TARGET))),
    };

    var bottleneck = null, worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });

    var narration;
    if (bottleneck && worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(worst) + " — charges time out and the pending backlog grows." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(pay) + " payments/s → " + fmt(pay * LEDGER_ENTRIES) + " ledger entries/s; idempotency, gateway, and ledger within capacity." };

    return {
      load: { clients: pay, paymentsvc: pay, idem: pay, ledger: pay * LEDGER_ENTRIES, gateway: pay, webhook: pay, reconcile: recon },
      edgeFlow: {
        "clients-paymentsvc": pay, "paymentsvc-idem": pay, "paymentsvc-ledger": pay, "paymentsvc-gateway": pay,
        "gateway-webhook": pay, "webhook-ledger": pay, "reconcile-ledger": recon, "reconcile-gateway": recon,
      },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        clients: fmt(pay) + " /s",
        paymentsvc: "×" + state.paymentsvc + " · " + pct(svcUtil),
        idem: "×" + state.idem + " · " + pct(idemUtil),
        ledger: "×" + state.ledger + " · " + pct(ledgerUtil),
        gateway: "×" + state.gateway + " · " + pct(gatewayUtil),
        webhook: "×" + state.webhook + " · " + pct(webhookUtil),
        reconcile: "×" + state.reconcile + " · " + pct(reconUtil),
      },
      metrics: [
        { key: "p", label: "Payments/s", value: fmt(pay), level: "ok" },
        { key: "l", label: "Ledger writes/s", value: fmt(pay * LEDGER_ENTRIES), level: "ok" },
        { key: "sv", label: "Payment svc util", value: pct(svcUtil), level: svcUtil >= 1 ? "danger" : svcUtil >= TARGET ? "warn" : "ok" },
        { key: "id", label: "Idempotency util", value: pct(idemUtil), level: idemUtil >= 1 ? "danger" : idemUtil >= TARGET ? "warn" : "ok" },
        { key: "le", label: "Ledger util", value: pct(ledgerUtil), level: ledgerUtil >= 1 ? "danger" : ledgerUtil >= TARGET ? "warn" : "ok" },
        { key: "gw", label: "Gateway util", value: pct(gatewayUtil), level: gatewayUtil >= 1 ? "danger" : gatewayUtil >= TARGET ? "warn" : "ok" },
        { key: "wh", label: "Webhook util", value: pct(webhookUtil), level: webhookUtil >= 1 ? "danger" : webhookUtil >= TARGET ? "warn" : "ok" },
        { key: "rc", label: "Recon util", value: pct(reconUtil), level: reconUtil >= 1 ? "danger" : reconUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".payment-system-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Payments", default: 2,
          options: [
            { label: "100 /s", value: 100 }, { label: "1,000 /s", value: 1000 }, { label: "5,000 /s", value: 5000 },
            { label: "10,000 /s", value: 10000 }, { label: "50,000 /s", value: 50000 }, { label: "200,000 /s", value: 200000 },
          ],
        },
        target: TARGET,
        aria: "Payment system under load",
        note: "Correctness over throughput: an idempotency key makes retries safe, the ledger is append-only double-entry and strongly consistent, and the gateway sits behind an adapter with a rate limit. Webhooks settle asynchronously; reconciliation is the backstop against timeouts and duplicates.",
        nodes: [
          { id: "clients", label: "Clients", icon: "👤", kind: "client", x: 70, y: 300, capacity: null, min: 1 },
          { id: "idem", label: "Idempotency", icon: "🔑", kind: "cache", x: 300, y: 100, capacity: IDEM_CAP, scaleLabel: "idempotency node", min: 1, count: 1,
            fail: "every request checks and stores an idempotency key.", why: "Shard the idempotency store; it is a fast, highly available KV." },
          { id: "paymentsvc", label: "Payment svc", icon: "💳", kind: "service", x: 300, y: 300, capacity: PAY_CAP, scaleLabel: "payment node", min: 1, count: 2,
            fail: "each payment runs the state machine and calls the gateway.", why: "The payment service is stateless; more nodes split the workflow." },
          { id: "ledger", label: "Ledger", icon: "📒", kind: "db", x: 540, y: 300, capacity: LEDGER_CAP, scaleLabel: "ledger shard", min: 1, count: 1,
            fail: "the append-only, strongly-consistent ledger takes every money movement.", why: "Shard the ledger by account so entries stay ordered and consistent." },
          { id: "gateway", label: "Gateway", icon: "🏦", kind: "external", x: 780, y: 300, capacity: GATEWAY_CAP, scaleLabel: "gateway connection", min: 1, count: 1,
            fail: "the external gateway enforces a charge rate and can time out.", why: "Add gateway connections/accounts or route across providers." },
          { id: "webhook", label: "Webhooks", icon: "🔔", kind: "service", x: 780, y: 100, capacity: WEBHOOK_CAP, scaleLabel: "webhook worker", min: 1, count: 1,
            fail: "gateway callbacks arrive in bursts and can duplicate.", why: "Queue and dedupe webhooks by eventId across more workers." },
          { id: "reconcile", label: "Reconciliation", icon: "🧾", kind: "worker", x: 780, y: 500, capacity: RECON_CAP, scaleLabel: "recon worker", min: 1, count: 1,
            fail: "drift between the gateway and the ledger must be swept.", why: "More reconciliation workers sweep drift faster." },
        ],
        edges: [
          { from: "clients", to: "paymentsvc", kind: "write" },
          { from: "paymentsvc", to: "idem", kind: "cache" },
          { from: "paymentsvc", to: "ledger", kind: "write" },
          { from: "paymentsvc", to: "gateway", kind: "write" },
          { from: "gateway", to: "webhook", kind: "read" },
          { from: "webhook", to: "ledger", kind: "write" },
          { from: "reconcile", to: "ledger", kind: "read" },
          { from: "reconcile", to: "gateway", kind: "read" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
