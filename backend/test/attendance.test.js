import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekdayOf } from '../src/lib/attendance.js';

test('weekdayOf resolves a business_date string to the correct weekday regardless of server timezone', () => {
  assert.equal(weekdayOf('2026-08-16'), 0); // Sunday
  assert.equal(weekdayOf('2026-08-17'), 1); // Monday
  assert.equal(weekdayOf('2026-08-22'), 6); // Saturday
});
