import { dryRunProvider } from './dryRun.js';
import { whatsappProvider } from './whatsapp.js';

/**
 * mode comes from shop_settings.messaging_mode. The 'test' provider isn't
 * reachable through here — it's only ever constructed directly by tests via
 * createTestProvider() and passed in as an override.
 */
export function getProvider(mode) {
  return mode === 'live' ? whatsappProvider : dryRunProvider;
}
