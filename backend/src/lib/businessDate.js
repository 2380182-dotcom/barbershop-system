// The shop's calendar day never matches Postgres's UTC `current_date` for a
// stretch of hours around midnight (Asia/Karachi is UTC+5, no DST). Every
// place in this codebase that needs "today" as a date must call this
// function instead of deriving a day from a timestamp itself.
const SHOP_TIMEZONE = 'Asia/Karachi';

// Karachi has no DST, so this offset is safe to treat as fixed — but it
// only belongs here, next to the timezone name, not copy-pasted elsewhere.
const SHOP_UTC_OFFSET = '+05:00';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHOP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Returns the shop's calendar date (YYYY-MM-DD) for the given instant.
 * @param {Date} at
 * @returns {string}
 */
export function businessDate(at = new Date()) {
  return formatter.format(at);
}

/**
 * Returns the shop's clock time (HH:MM, 24-hour) for the given instant.
 * @param {Date} at
 * @returns {string}
 */
export function timeOfDay(at = new Date()) {
  return timeFormatter.format(at);
}

/**
 * Builds the instant for a given shop-calendar date and shop-clock time —
 * the inverse of businessDate()/timeOfDay(). Used for appointment slot
 * math, where "10:00 on 2026-08-20" needs to become a real timestamptz.
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} timeStr HH:MM
 * @returns {Date}
 */
export function instantAt(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00${SHOP_UTC_OFFSET}`);
}

/**
 * Adds (or subtracts) whole calendar days to a shop-calendar date string,
 * via UTC date components — never through a Date-then-timezone round trip.
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} days
 * @returns {string}
 */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

/**
 * Whole calendar days between two shop-calendar date strings (b - a).
 * @param {string} aStr YYYY-MM-DD
 * @param {string} bStr YYYY-MM-DD
 * @returns {number}
 */
export function daysBetween(aStr, bStr) {
  const [ay, am, ad] = aStr.split('-').map(Number);
  const [by, bm, bd] = bStr.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
