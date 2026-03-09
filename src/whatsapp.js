const graphBase = (apiVersion) => `https://graph.facebook.com/${apiVersion}`;

const parseGraphError = async (response) => {
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return {
    status: response.status,
    body,
  };
};

export class WhatsAppClient {
  constructor({ accessToken, phoneNumberId, apiVersion }) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.apiVersion = apiVersion;
  }

  async sendText({ to, body, previewUrl = false }) {
    return this._send({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body,
        preview_url: previewUrl,
      },
    });
  }

  async sendTemplate({ to, name, languageCode = "en", components = [] }) {
    return this._send({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: languageCode },
        components,
      },
    });
  }

  async _send(payload) {
    const url = `${graphBase(this.apiVersion)}/${this.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await parseGraphError(response);
      const error = new Error("whatsapp_send_failed");
      error.details = details;
      throw error;
    }

    const data = await response.json();
    return {
      id: data.messages?.[0]?.id || "",
      raw: data,
    };
  }
}
