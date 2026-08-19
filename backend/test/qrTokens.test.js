import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { getCurrentQrToken, isValidQrToken } from '../src/lib/qrTokens.js';

// Each test below simulates a `now` minutes into the "future" to exercise
// rotation/expiry without a real sleep. Those rows are real, persisted rows
// with a stored issued_at ahead of the real clock — if left behind, the
// next test's own real-time query can pick one of them up as "most
// recent" (its stored issued_at compares as later, even though nothing
// about real elapsed time made it so). Clearing between tests keeps that
// simulated-future data from leaking across tests; production never hits
// this at all, since `now` there is always the real clock.
beforeEach(async () => {
  await pool.query(`delete from qr_tokens`);
});

test('QR token stays the same within the 2-minute rotation window and rotates after it', async () => {
  const t0 = new Date();
  const first = await getCurrentQrToken(t0);

  const oneMinLater = await getCurrentQrToken(new Date(t0.getTime() + 60 * 1000));
  assert.equal(oneMinLater.token, first.token);

  const threeMinLater = await getCurrentQrToken(new Date(t0.getTime() + 3 * 60 * 1000));
  assert.notEqual(threeMinLater.token, first.token);
});

test('a QR token is valid until its 5-minute expiry, then invalid', async () => {
  const t0 = new Date();
  const token = (await getCurrentQrToken(t0)).token;

  assert.equal(await isValidQrToken(token, new Date(t0.getTime() + 4 * 60 * 1000)), true);
  assert.equal(await isValidQrToken(token, new Date(t0.getTime() + 6 * 60 * 1000)), false);
});

test('an invented token is never valid', async () => {
  assert.equal(await isValidQrToken('not-a-real-token'), false);
});
