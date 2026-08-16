// The shop's calendar day never matches Postgres's UTC `current_date` for a
// stretch of hours around midnight (Asia/Karachi is UTC+5, no DST). Every
// place in this codebase that needs "today" as a date must call this
// function instead of deriving a day from a timestamp itself.
const SHOP_TIMEZONE = 'Asia/Karachi';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Returns the shop's calendar date (YYYY-MM-DD) for the given instant.
 * @param {Date} at
 * @returns {string}
 */
export function businessDate(at = new Date()) {
  return formatter.format(at);
}
