import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config, validateRequiredConfig } from "./config.js";
import { JsonStore } from "./store.js";
import {
  currentFailureRate,
  evaluateSendEligibility,
  isStartKeyword,
  isStopKeyword,
  randomInt,
  recordDeliveryOutcome,
  recordInbound,
  recordOutboundSuccess,
  sanitizePhone,
} from "./guardrails.js";
import { DispatchQueue } from "./queue.js";
import { WhatsAppClient } from "./whatsapp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

const missing = validateRequiredConfig();
if (missing.length) {
  console.warn(
    `[WARN] Missing env variables: ${missing.join(", ")}. Server will still start.`,
  );
}

const store = new JsonStore(path.join(__dirname, "..", "data", "store.json"));
await store.init();

const whatsapp = new WhatsAppClient({
  accessToken: config.whatsappAccessToken,
  phoneNumberId: config.whatsappPhoneNumberId,
  apiVersion: config.whatsappApiVersion,
});

const queue = new DispatchQueue({
  concurrency: 1,
  maxRetries: config.maxRetries,
  baseRetryDelayMs: config.baseRetryDelayMs,
  worker: async (payload) => {
    const phone = sanitizePhone(payload.phone);
    if (!phone) throw new Error("invalid_phone");

    const jitterMs = randomInt(config.sendJitterMinMs, config.sendJitterMaxMs);
    await new Promise((resolve) => setTimeout(resolve, jitterMs));

    const data = await store.read();
    const check = evaluateSendEligibility({ data, phone, config });
    if (!check.allowed) {
      await store.update((state) => {
        state.outboundEvents.unshift({
          at: new Date().toISOString(),
          phone,
          payload,
          status: "blocked_by_guardrail",
          reason: check.reason,
        });
        state.outboundEvents = state.outboundEvents.slice(0, 2000);
        return state;
      });
      return;
    }

    let sendResult;
    if (payload.type === "template") {
      sendResult = await whatsapp.sendTemplate({
        to: phone,
        name: payload.template.name,
        languageCode: payload.template.languageCode || "en",
        components: payload.template.components || [],
      });
    } else {
      sendResult = await whatsapp.sendText({
        to: phone,
        body: payload.text,
        previewUrl: Boolean(payload.previewUrl),
      });
    }

    await store.update((state) => {
      recordOutboundSuccess({
        data: state,
        phone,
        messageId: sendResult.id,
        payload,
      });
      return state;
    });
  },
});

const authMiddleware = (req, res, next) => {
  const publicPaths = ["/health", "/webhook"];
  if (publicPaths.includes(req.path)) return next();

  const apiKey = req.header("x-api-key") || "";
  if (!config.adminApiKey || apiKey !== config.adminApiKey) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
};

app.use(authMiddleware);

app.get("/health", async (_req, res) => {
  const data = await store.read();
  res.json({
    ok: true,
    env: config.nodeEnv,
    queue: queue.stats(),
    killSwitch: data.killSwitch,
    contacts: Object.keys(data.contacts).length,
  });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === config.whatsappWebhookVerifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send("Forbidden");
});

app.post("/webhook", async (req, res) => {
  const entries = req.body?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      for (const msg of value.messages || []) {
        const phone = sanitizePhone(msg.from);
        if (!phone) continue;
        const text = msg.text?.body || "";

        await store.update((state) => {
          recordInbound({ data: state, phone, text });

          const normalized = text.trim().toLowerCase();
          if (isStopKeyword(normalized)) {
            state.contacts[phone].optIn = false;
            state.contacts[phone].blocked = true;
            state.contacts[phone].unsubscribeAt = new Date().toISOString();
          } else if (isStartKeyword(normalized)) {
            state.contacts[phone].optIn = true;
            state.contacts[phone].blocked = false;
            state.contacts[phone].optInAt = new Date().toISOString();
          }
          return state;
        });
      }

      for (const status of value.statuses || []) {
        const outcome = status.status || "unknown";
        const ok = outcome === "sent" || outcome === "delivered" || outcome === "read";

        await store.update((state) => {
          recordDeliveryOutcome({
            data: state,
            ok,
            statusEvent: {
              at: new Date().toISOString(),
              messageId: status.id || "",
              recipientId: sanitizePhone(status.recipient_id),
              status: outcome,
              errors: status.errors || [],
            },
            windowSize: config.failureWindowSize,
          });

          const failureRate = currentFailureRate(
            state.stats.recentDeliveryOutcomes,
          );
          if (failureRate >= config.maxFailureRatePercent) {
            state.killSwitch.enabled = true;
            state.killSwitch.reason = `Auto-enabled: failure rate ${failureRate.toFixed(
              1,
            )}%`;
            state.killSwitch.updatedAt = new Date().toISOString();
          }

          return state;
        });
      }
    }
  }

  res.status(200).json({ received: true });
});

app.post("/api/contacts/opt-in", async (req, res) => {
  const phone = sanitizePhone(req.body?.phone);
  const name = (req.body?.name || "").trim();
  if (!phone) return res.status(400).json({ error: "invalid_phone" });

  await store.update((state) => {
    const existing = state.contacts[phone] || {
      phone,
      blocked: false,
      dailySent: {},
    };
    state.contacts[phone] = {
      ...existing,
      name: name || existing.name || "",
      optIn: true,
      blocked: false,
      optInAt: new Date().toISOString(),
    };
    return state;
  });

  res.json({ ok: true, phone, optIn: true });
});

app.post("/api/contacts/block", async (req, res) => {
  const phone = sanitizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: "invalid_phone" });

  await store.update((state) => {
    const existing = state.contacts[phone] || {
      phone,
      optIn: false,
      dailySent: {},
    };
    state.contacts[phone] = {
      ...existing,
      blocked: true,
      optIn: false,
      blockedAt: new Date().toISOString(),
    };
    return state;
  });

  res.json({ ok: true, phone, blocked: true });
});

app.post("/api/kill-switch", async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const reason = (req.body?.reason || "").toString().slice(0, 300);

  await store.update((state) => {
    state.killSwitch.enabled = enabled;
    state.killSwitch.reason = reason;
    state.killSwitch.updatedAt = new Date().toISOString();
    return state;
  });

  res.json({ ok: true, enabled, reason });
});

const validatePayload = (body) => {
  const phone = sanitizePhone(body?.phone);
  if (!phone) return { ok: false, error: "invalid_phone" };

  const type = body?.type === "template" ? "template" : "text";
  if (type === "text") {
    const text = (body?.text || "").toString().trim();
    if (!text) return { ok: false, error: "missing_text" };
    return { ok: true, payload: { phone, type, text, previewUrl: !!body?.previewUrl } };
  }

  const templateName = (body?.template?.name || "").toString().trim();
  if (!templateName) return { ok: false, error: "missing_template_name" };

  return {
    ok: true,
    payload: {
      phone,
      type,
      template: {
        name: templateName,
        languageCode: (body?.template?.languageCode || "en").toString(),
        components: Array.isArray(body?.template?.components)
          ? body.template.components
          : [],
      },
    },
  };
};

app.post("/api/messages/send", async (req, res) => {
  const validated = validatePayload(req.body);
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const jobId = queue.enqueue(validated.payload);
  return res.json({ ok: true, jobId, payload: validated.payload });
});

app.post("/api/campaigns/send", async (req, res) => {
  const phones = Array.isArray(req.body?.phones) ? req.body.phones : [];
  if (!phones.length) return res.status(400).json({ error: "phones_required" });

  const accepted = [];
  const rejected = [];

  for (const rawPhone of phones) {
    const body = { ...req.body, phone: rawPhone };
    const validated = validatePayload(body);
    if (!validated.ok) {
      rejected.push({ phone: rawPhone, reason: validated.error });
      continue;
    }
    const jobId = queue.enqueue(validated.payload);
    accepted.push({ phone: validated.payload.phone, jobId });
  }

  return res.json({
    ok: true,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    accepted,
    rejected,
  });
});

app.get("/api/dashboard", async (_req, res) => {
  const data = await store.read();
  const failureRate = currentFailureRate(data.stats.recentDeliveryOutcomes);

  res.json({
    killSwitch: data.killSwitch,
    queue: queue.stats(),
    contacts: Object.keys(data.contacts).length,
    outboundEvents: data.outboundEvents.slice(0, 25),
    inboundEvents: data.inboundEvents.slice(0, 25),
    statusEvents: data.statusEvents.slice(0, 25),
    failureRatePercent: Number(failureRate.toFixed(2)),
  });
});

app.listen(config.port, () => {
  console.log(`WhatsApp bot server running on http://localhost:${config.port}`);
});
