// The default, and the mode this whole project develops and demos in.
// Sends nothing — just logs and reports success so the rest of the
// pipeline (gates, retries, dashboard) can be exercised for real without
// a live WhatsApp account or template approval.
export const dryRunProvider = {
  async sendMessage({ to, templateName, params }) {
    console.log(`[dry-run] would send "${templateName}" to ${to}`, params || {});
    return { providerId: 'dry-run', status: 'sent', cost: 0 };
  },
};
