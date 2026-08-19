// The real WhatsApp Business Platform client. Requires WHATSAPP_API_URL and
// WHATSAPP_TOKEN to be set — until template approval and a live account
// exist, shop_settings.messaging_mode should stay 'dry_run', which never
// touches this file. cost is left null here; the sender fills it in from
// shop_settings.cost_per_message, since the owner (not this client) is the
// source of truth for what a message actually costs.
export const whatsappProvider = {
  async sendMessage({ to, templateName, params }) {
    const url = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_TOKEN;
    if (!url || !token) {
      throw new Error('WhatsApp provider is not configured (WHATSAPP_API_URL / WHATSAPP_TOKEN missing)');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, template: templateName, params: params || {} }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WhatsApp send failed: ${res.status} ${body}`.trim());
    }

    const data = await res.json();
    return { providerId: data.messages?.[0]?.id ?? data.id ?? null, status: 'sent', cost: null };
  },
};
