import { pool } from '../db/pool.js';

/**
 * @param {object} entry
 * @param {string|null} entry.userId
 * @param {string} entry.action
 * @param {string} entry.entity
 * @param {string|null} [entry.entityId]
 * @param {object} [entry.detail]
 */
export async function logAudit({ userId = null, action, entity, entityId = null, detail = null }) {
  await pool.query(
    `insert into audit_logs (user_id, action, entity, entity_id, detail)
     values ($1, $2, $3, $4, $5)`,
    [userId, action, entity, entityId, detail ? JSON.stringify(detail) : null]
  );
}
