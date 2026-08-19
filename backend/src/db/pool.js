import pg from 'pg';
import { config } from '../config.js';

// By default node-postgres parses `date` columns into JS Date objects,
// which get reinterpreted through the server process's local timezone on
// the way back out — exactly the kind of silent day-shift this project's
// timezone rule exists to prevent. Keep `date` columns as plain
// YYYY-MM-DD strings straight from Postgres instead.
const PG_TYPE_DATE = 1082;
pg.types.setTypeParser(PG_TYPE_DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
});
