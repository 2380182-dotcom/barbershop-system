import cron from 'node-cron';
import { runSenderOnce } from '../lib/messaging.js';
import { runReminderJob } from '../lib/reminders.js';
import { deleteExpiredQrTokens } from '../lib/qrTokens.js';

const SHOP_TIMEZONE = 'Asia/Karachi';

/**
 * Starts the background jobs this project needs. Only called from the real
 * server process (src/index.js) — never during tests or one-off scripts,
 * which call the underlying functions directly instead.
 */
export function startWorkers() {
  cron.schedule(
    '* * * * *',
    () => {
      runSenderOnce().catch((err) => console.error('[sender] run failed', err));
    },
    { timezone: SHOP_TIMEZONE }
  );

  cron.schedule(
    '0 11 * * *',
    () => {
      runReminderJob().catch((err) => console.error('[reminders] run failed', err));
    },
    { timezone: SHOP_TIMEZONE }
  );

  cron.schedule(
    '0 3 * * *',
    () => {
      deleteExpiredQrTokens().catch((err) => console.error('[qr-cleanup] run failed', err));
    },
    { timezone: SHOP_TIMEZONE }
  );
}
