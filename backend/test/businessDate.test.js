import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessDate } from '../src/lib/businessDate.js';

test('returns the Karachi calendar date when server clock is 23:30 UTC (rolls to next day)', () => {
  const at = new Date('2026-08-16T23:30:00Z');
  assert.equal(businessDate(at), '2026-08-17');
});

test('returns the Karachi calendar date for a time that has not crossed midnight in Karachi', () => {
  const at = new Date('2026-08-16T18:00:00Z'); // 23:00 Karachi
  assert.equal(businessDate(at), '2026-08-16');
});

test('defaults to the current time when no argument is given', () => {
  const result = businessDate();
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});
