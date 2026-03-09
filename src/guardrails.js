const STOP_KEYWORDS = new Set([
  "stop",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "remove",
  "no",
]);

const START_KEYWORDS = new Set(["start", "yes", "subscribe", "unstop"]);

export const sanitizePhone = (value) => (value || "").replace(/[^\d]/g, "");

export const normalizeText = (value) => (value || "").trim().toLowerCase();

export const isStopKeyword = (value) => STOP_KEYWORDS.has(normalizeText(value));

export const isStartKeyword = (value) =>
  START_KEYWORDS.has(normalizeText(value));

export const dateKeyUtc = (now = new Date()) => now.toISOString().slice(0, 10);

export const randomInt = (min, max) => {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
};

export const evaluateSendEligibility = ({
  data,
  phone,
  config,
  now = new Date(),
}) => {
  if (data.killSwitch?.enabled) {
    return { allowed: false, reason: "kill_switch_enabled" };
  }

  const contact = data.contacts[phone];
  if (!contact || !contact.optIn) {
    return { allowed: false, reason: "missing_opt_in" };
  }
  if (contact.blocked) {
    return { allowed: false, reason: "contact_blocked" };
  }

  const date = dateKeyUtc(now);
  const globalCount = data.stats.dailyGlobal[date] || 0;
  if (globalCount >= config.maxDailyMessagesGlobal) {
    return { allowed: false, reason: "global_daily_limit_reached" };
  }

  const contactCount = contact.dailySent?.[date] || 0;
  if (contactCount >= config.maxDailyMessagesPerContact) {
    return { allowed: false, reason: "contact_daily_limit_reached" };
  }

  if (contact.lastOutboundAt) {
    const elapsedSeconds =
      (now.getTime() - new Date(contact.lastOutboundAt).getTime()) / 1000;
    if (elapsedSeconds < config.minSecondsBetweenMessagesPerContact) {
      return { allowed: false, reason: "contact_cooldown_active" };
    }
  }

  return { allowed: true };
};

export const recordOutboundSuccess = ({ data, phone, messageId, payload }) => {
  const nowIso = new Date().toISOString();
  const date = dateKeyUtc();

  if (!data.contacts[phone]) {
    data.contacts[phone] = { phone, optIn: false, blocked: false, dailySent: {} };
  }

  const contact = data.contacts[phone];
  contact.lastOutboundAt = nowIso;
  contact.dailySent = contact.dailySent || {};
  contact.dailySent[date] = (contact.dailySent[date] || 0) + 1;

  data.stats.dailyGlobal[date] = (data.stats.dailyGlobal[date] || 0) + 1;

  data.outboundEvents.unshift({
    at: nowIso,
    phone,
    messageId,
    payload,
    status: "queued_to_whatsapp",
  });
  data.outboundEvents = data.outboundEvents.slice(0, 2000);
};

export const recordInbound = ({ data, phone, text }) => {
  const nowIso = new Date().toISOString();
  if (!data.contacts[phone]) {
    data.contacts[phone] = { phone, optIn: false, blocked: false, dailySent: {} };
  }

  data.contacts[phone].lastInboundAt = nowIso;

  data.inboundEvents.unshift({ at: nowIso, phone, text });
  data.inboundEvents = data.inboundEvents.slice(0, 2000);
};

export const recordDeliveryOutcome = ({ data, ok, statusEvent, windowSize }) => {
  data.statusEvents.unshift(statusEvent);
  data.statusEvents = data.statusEvents.slice(0, 5000);

  data.stats.recentDeliveryOutcomes.unshift(ok ? 1 : 0);
  data.stats.recentDeliveryOutcomes = data.stats.recentDeliveryOutcomes.slice(
    0,
    windowSize,
  );
};

export const currentFailureRate = (recentOutcomes) => {
  if (!recentOutcomes.length) return 0;
  const failures = recentOutcomes.filter((x) => x === 0).length;
  return (failures / recentOutcomes.length) * 100;
};
