import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGates } from '../src/lib/messaging.js';

const baseSettings = {
  quiet_hours_start: '21:00:00',
  quiet_hours_end: '10:00:00',
  daily_message_cap: 100,
  cost_per_message: 0,
};

const activeCustomer = { blocked: false, consent_messages: true, opted_out_at: null };

test('blocked customer fails the gate for any template', async () => {
  const result = await checkGates(
    { template_name: 'rebooking_reminder' },
    { ...activeCustomer, blocked: true },
    baseSettings,
    new Date('2026-08-18T09:00:00.000Z') // 14:00 PKT
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'blocked');
});

test('no consent fails the gate even for a transactional template', async () => {
  const result = await checkGates(
    { template_name: 'appointment_confirmed' },
    { ...activeCustomer, consent_messages: false },
    baseSettings,
    new Date('2026-08-18T09:00:00.000Z')
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_consent');
});

test('opted-out blocks a marketing template', async () => {
  const result = await checkGates(
    { template_name: 'rebooking_reminder' },
    { ...activeCustomer, opted_out_at: new Date() },
    baseSettings,
    new Date('2026-08-18T09:00:00.000Z')
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'opted_out');
});

test('opted-out does NOT block a transactional template', async () => {
  const result = await checkGates(
    { template_name: 'appointment_cancelled' },
    { ...activeCustomer, opted_out_at: new Date() },
    baseSettings,
    new Date('2026-08-18T09:00:00.000Z') // would also be fine even inside quiet hours
  );
  assert.equal(result.ok, true);
});

test('quiet hours blocks a marketing template on the evening side of the wrap and reschedules to tomorrow\'s opening', async () => {
  const result = await checkGates(
    { template_name: 'rebooking_reminder' },
    activeCustomer,
    baseSettings,
    new Date('2026-08-18T17:00:00.000Z') // 22:00 PKT, inside 21:00-10:00
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'quiet_hours');
  assert.equal(result.rescheduleTo.toISOString(), '2026-08-19T05:00:00.000Z'); // 2026-08-19 10:00 PKT
});

test('quiet hours blocks a marketing template on the morning side of the wrap and reschedules to today\'s opening', async () => {
  const result = await checkGates(
    { template_name: 'rebooking_reminder' },
    activeCustomer,
    baseSettings,
    new Date('2026-08-18T22:00:00.000Z') // 03:00 PKT the next calendar day, still inside the window
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'quiet_hours');
  assert.equal(result.rescheduleTo.toISOString(), '2026-08-19T05:00:00.000Z'); // same-day (Aug 19) 10:00 PKT
});

test('quiet hours does NOT block a transactional template', async () => {
  const result = await checkGates(
    { template_name: 'appointment_cancelled' },
    activeCustomer,
    baseSettings,
    new Date('2026-08-18T17:00:00.000Z') // 22:00 PKT, inside quiet hours
  );
  assert.equal(result.ok, true);
});

test('outside quiet hours, a marketing template with an active customer and no cap issue passes (may hit the DB for the cap count)', async () => {
  const result = await checkGates(
    { template_name: 'rebooking_reminder' },
    activeCustomer,
    baseSettings,
    new Date('2026-08-18T09:00:00.000Z') // 14:00 PKT, well outside quiet hours
  );
  assert.equal(result.ok, true);
});
