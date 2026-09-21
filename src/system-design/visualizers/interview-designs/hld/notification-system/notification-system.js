/* Notification System — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var CHANNELS = 3; // fan-out: email + sms + push per notification
  var SERVICE_CAP = 5000; // orchestrations/s per notification-service node
  var DEDUP_CAP = 50000; // dedup/preference lookups/s per Redis node
  var WORKER_CAP = 3000; // messages/s per delivery worker
  var EMAIL_CAP = 5000, SMS_CAP = 2000, PUSH_CAP = 30000; // provider rate limits per account
  var TARGET = 0.7;

  function name(k) {
    return { service: "Notification service", dedup: "Dedup/preferences (Redis)", workers: "Delivery workers", email: "Email provider", sms: "SMS provider", push: "Push provider" }[k] || "Component";
  }

  function compute(state, rps, h) {
    var fmt = h.fmt, pct = h.pct;
    var messages = rps * CHANNELS; // fan-out to every channel

    var serviceUtil = rps / (state.service * SERVICE_CAP);
    var dedupUtil = rps / (state.dedup * DEDUP_CAP);
    var workerUtil = messages / (state.workers * WORKER_CAP);
    var emailUtil = rps / (state.email * EMAIL_CAP);
    var smsUtil = rps / (state.sms * SMS_CAP);
    var pushUtil = rps / (state.push * PUSH_CAP);

    var utils = { service: serviceUtil, dedup: dedupUtil, workers: workerUtil, email: emailUtil, sms: smsUtil, push: pushUtil };
    var required = {
      service: Math.max(1, Math.ceil(rps / (SERVICE_CAP * TARGET))),
      dedup: Math.max(1, Math.ceil(rps / (DEDUP_CAP * TARGET))),
      workers: Math.max(1, Math.ceil(messages / (WORKER_CAP * TARGET))),
      email: Math.max(1, Math.ceil(rps / (EMAIL_CAP * TARGET))),
      sms: Math.max(1, Math.ceil(rps / (SMS_CAP * TARGET))),
      push: Math.max(1, Math.ceil(rps / (PUSH_CAP * TARGET))),
    };

    var bottleneck = null, worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });

    var narration;
    if (bottleneck && worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(worst) + " — sends are throttled or failing." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(rps) + " notifications/s → " + fmt(messages) + " provider messages/s, all providers within limits." };

    return {
      load: { events: rps, service: rps, dedup: rps, queue: messages, workers: messages, email: rps, sms: rps, push: rps },
      edgeFlow: { "events-service": rps, "service-dedup": rps, "service-queue": messages, "queue-workers": messages, "workers-email": rps, "workers-sms": rps, "workers-push": rps },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        events: fmt(rps) + " /s",
        service: "×" + state.service + " · " + pct(serviceUtil),
        dedup: "×" + state.dedup + " · " + pct(dedupUtil),
        queue: fmt(messages) + " msg/s",
        workers: "×" + state.workers + " · " + pct(workerUtil),
        email: "×" + state.email + " · " + pct(emailUtil),
        sms: "×" + state.sms + " · " + pct(smsUtil),
        push: "×" + state.push + " · " + pct(pushUtil),
      },
      metrics: [
        { key: "n", label: "Notifications/s", value: fmt(rps), level: "ok" },
        { key: "m", label: "Provider msg/s", value: fmt(messages), level: "ok" },
        { key: "svc", label: "Service util", value: pct(serviceUtil), level: serviceUtil >= 1 ? "danger" : serviceUtil >= TARGET ? "warn" : "ok" },
        { key: "wrk", label: "Workers util", value: pct(workerUtil), level: workerUtil >= 1 ? "danger" : workerUtil >= TARGET ? "warn" : "ok" },
        { key: "em", label: "Email util", value: pct(emailUtil), level: emailUtil >= 1 ? "danger" : emailUtil >= TARGET ? "warn" : "ok" },
        { key: "sms", label: "SMS util", value: pct(smsUtil), level: smsUtil >= 1 ? "danger" : smsUtil >= TARGET ? "warn" : "ok" },
        { key: "push", label: "Push util", value: pct(pushUtil), level: pushUtil >= 1 ? "danger" : pushUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".notification-system-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Events", default: 2,
          options: [
            { label: "100 /s", value: 100 }, { label: "1,000 /s", value: 1000 }, { label: "5,000 /s", value: 5000 },
            { label: "10,000 /s", value: 10000 }, { label: "50,000 /s", value: 50000 }, { label: "200,000 /s", value: 200000 },
          ],
        },
        target: TARGET,
        aria: "Notification system under load",
        note: "Each notification fans out to email + SMS + push. The service and dedup run once per notification; workers process the fan-out messages; the real ceiling is usually a provider's rate limit, which scales by adding provider accounts.",
        nodes: [
          { id: "events", label: "Events", icon: "🔔", kind: "client", x: 80, y: 300, capacity: null, min: 1 },
          { id: "service", label: "Notification svc", icon: "⚙️", kind: "service", x: 300, y: 300, capacity: SERVICE_CAP, scaleLabel: "service node", min: 1, count: 2,
            fail: "every notification is orchestrated once here (dedup, preferences, render).", why: "The service is stateless; more nodes split the orchestration." },
          { id: "dedup", label: "Dedup/prefs", icon: "⚡", kind: "cache", x: 300, y: 90, capacity: DEDUP_CAP, scaleLabel: "Redis node", min: 1, count: 1,
            fail: "every notification does a dedup + preference lookup.", why: "Shard the dedup/preference store across more Redis nodes." },
          { id: "queue", label: "Queue", icon: "📥", kind: "queue", x: 540, y: 300, capacity: null, min: 1 },
          { id: "workers", label: "Workers", icon: "🛠️", kind: "worker", x: 760, y: 300, capacity: WORKER_CAP, scaleLabel: "worker", min: 1, count: 1,
            fail: "workers process the fan-out messages and can fall behind.", why: "More workers drain the queue faster." },
          { id: "email", label: "Email", icon: "✉️", kind: "external", x: 1010, y: 130, capacity: EMAIL_CAP, scaleLabel: "email account", min: 1, count: 1,
            fail: "the email provider enforces a send rate.", why: "Add provider accounts / warm more sending capacity." },
          { id: "sms", label: "SMS", icon: "📱", kind: "external", x: 1010, y: 300, capacity: SMS_CAP, scaleLabel: "SMS account", min: 1, count: 1,
            fail: "SMS has the lowest provider rate limit, so it saturates first.", why: "Add SMS provider accounts, or route by priority to protect critical messages." },
          { id: "push", label: "Push", icon: "📲", kind: "external", x: 1010, y: 470, capacity: PUSH_CAP, scaleLabel: "push account", min: 1, count: 1,
            fail: "the push provider enforces a send rate.", why: "Add push provider accounts / connections." },
        ],
        edges: [
          { from: "events", to: "service", kind: "read" },
          { from: "service", to: "dedup", kind: "cache" },
          { from: "service", to: "queue", kind: "queue" },
          { from: "queue", to: "workers", kind: "queue" },
          { from: "workers", to: "email", kind: "write" },
          { from: "workers", to: "sms", kind: "write" },
          { from: "workers", to: "push", kind: "write" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
