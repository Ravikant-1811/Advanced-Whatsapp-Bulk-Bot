# Advanced WhatsApp Bulk Bot (API + Guardrails)

This project is a WhatsApp Cloud API backend for campaign messaging with strong compliance controls.

It is designed to reduce ban risk by enforcing:
- explicit opt-in state per contact
- automatic unsubscribe handling (`STOP`, `UNSUBSCRIBE`, etc.)
- per-contact cooldown and daily send limits
- global daily send limit
- auto kill-switch when delivery failure rate gets too high

It does **not** include ban-evasion, anti-detection bypass, or terms-of-service circumvention.

## 1) Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env and fill values:

```bash
cp .env.example .env
```

3. Start server:

```bash
npm start
```

Server runs at `http://localhost:8080` by default.

## 2) Required environment variables

- `ADMIN_API_KEY`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Optional tuning:
- `MAX_DAILY_MESSAGES_GLOBAL`
- `MAX_DAILY_MESSAGES_PER_CONTACT`
- `MIN_SECONDS_BETWEEN_MESSAGES_PER_CONTACT`
- `MAX_RETRIES`
- `BASE_RETRY_DELAY_MS`
- `SEND_JITTER_MIN_MS`
- `SEND_JITTER_MAX_MS`
- `FAILURE_WINDOW_SIZE`
- `MAX_FAILURE_RATE_PERCENT`

## 3) Endpoints

Public:
- `GET /health`
- `GET /webhook` (Meta verification)
- `POST /webhook` (Meta callbacks)

Protected (`x-api-key: <ADMIN_API_KEY>`):
- `POST /api/contacts/opt-in`
- `POST /api/contacts/block`
- `POST /api/messages/send`
- `POST /api/campaigns/send`
- `POST /api/kill-switch`
- `GET /api/dashboard`

## 4) Quick API examples

Opt-in a contact:

```bash
curl -X POST http://localhost:8080/api/contacts/opt-in \
  -H "x-api-key: change_me" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919999999999","name":"Test User"}'
```

Queue text message:

```bash
curl -X POST http://localhost:8080/api/messages/send \
  -H "x-api-key: change_me" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919999999999","type":"text","text":"Hello from Cloud API"}'
```

Queue template campaign:

```bash
curl -X POST http://localhost:8080/api/campaigns/send \
  -H "x-api-key: change_me" \
  -H "Content-Type: application/json" \
  -d '{
    "phones": ["+919999999999", "+918888888888"],
    "type": "template",
    "template": { "name": "promo_template", "languageCode": "en" }
  }'
```

Enable kill-switch:

```bash
curl -X POST http://localhost:8080/api/kill-switch \
  -H "x-api-key: change_me" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"reason":"Manual pause"}'
```

## 5) Webhook behavior

- Incoming `STOP/UNSUBSCRIBE/...` marks contact as blocked and opt-out.
- Incoming `START/YES/...` re-enables opt-in.
- Delivery status failures are tracked in a rolling window.
- If failure rate crosses threshold, kill-switch auto enables.

## 6) Production notes

- Use HTTPS and reverse proxy (Nginx/Caddy).
- Keep webhook and API logs.
- Use approved template messages for outbound campaigns.
- Send only to contacts with verifiable consent.
