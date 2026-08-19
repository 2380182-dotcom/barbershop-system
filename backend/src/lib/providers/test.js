// In-memory fake for automated tests. Each call to createTestProvider()
// returns an isolated instance so tests don't leak state into each other.
export function createTestProvider() {
  const sent = [];
  let failNextCount = 0;

  return {
    sent,
    failNext(times = 1) {
      failNextCount = times;
    },
    async sendMessage({ to, templateName, params }) {
      if (failNextCount > 0) {
        failNextCount -= 1;
        throw new Error('Simulated provider failure');
      }
      const providerId = `test-${sent.length + 1}`;
      sent.push({ to, templateName, params, providerId });
      return { providerId, status: 'sent', cost: 0 };
    },
  };
}
