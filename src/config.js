import dotenv from "dotenv";

dotenv.config();

const intOr = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const config = {
  port: intOr(process.env.PORT, 8080),
  nodeEnv: process.env.NODE_ENV || "development",
  adminApiKey: process.env.ADMIN_API_KEY || "",

  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
  whatsappWebhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION || "v22.0",

  maxDailyMessagesGlobal: intOr(process.env.MAX_DAILY_MESSAGES_GLOBAL, 1000),
  maxDailyMessagesPerContact: intOr(
    process.env.MAX_DAILY_MESSAGES_PER_CONTACT,
    2,
  ),
  minSecondsBetweenMessagesPerContact: intOr(
    process.env.MIN_SECONDS_BETWEEN_MESSAGES_PER_CONTACT,
    1800,
  ),
  maxRetries: intOr(process.env.MAX_RETRIES, 3),
  baseRetryDelayMs: intOr(process.env.BASE_RETRY_DELAY_MS, 3000),
  sendJitterMinMs: intOr(process.env.SEND_JITTER_MIN_MS, 350),
  sendJitterMaxMs: intOr(process.env.SEND_JITTER_MAX_MS, 1200),
  failureWindowSize: intOr(process.env.FAILURE_WINDOW_SIZE, 50),
  maxFailureRatePercent: intOr(process.env.MAX_FAILURE_RATE_PERCENT, 35),
};

export const validateRequiredConfig = () => {
  const missing = [];

  if (!config.adminApiKey) missing.push("ADMIN_API_KEY");
  if (!config.whatsappAccessToken) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!config.whatsappPhoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!config.whatsappWebhookVerifyToken) {
    missing.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  }

  return missing;
};
