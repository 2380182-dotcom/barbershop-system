import { pool } from '../db/pool.js';
import { deletePhotoFile } from './photos.js';

export class CustomerNotFoundError extends Error {}
export class CustomerConfirmationError extends Error {}

/**
 * The single lookup for "who is this phone number". Used both for a
 * read-only preview (add-customer flow) and, via findOrCreate, for
 * actually joining the queue. Never write a second version of this query.
 */
export async function findCustomerByPhone(phone, client = pool) {
  const { rows } = await client.query(`select * from customers where phone = $1`, [phone]);
  return rows[0] || null;
}

export async function findOrCreateCustomerByPhone(phone, name, client = pool) {
  const existing = await findCustomerByPhone(phone, client);
  if (existing) {
    if (name && !existing.name) {
      const { rows } = await client.query(
        `update customers set name = $1, updated_at = now() where id = $2 returning *`,
        [name, existing.id]
      );
      return rows[0];
    }
    return existing;
  }

  const { rows } = await client.query(
    `insert into customers (phone, name) values ($1, $2) returning *`,
    [phone, name || null]
  );
  return rows[0];
}

/**
 * Irreversible. Photo files come off disk first (brief's explicit order),
 * then everything referencing the customer is removed in FK-safe order,
 * then the customer row itself. confirmPhone must match exactly — a typed
 * confirmation, not just a click, for something that cannot be undone.
 */
export async function deleteCustomer(customerId, confirmPhone) {
  const customer = await findCustomerByPhone(confirmPhone);
  if (!customer || customer.id !== customerId) {
    throw new CustomerConfirmationError('Phone number does not match this customer');
  }

  const { rows: photoRows } = await pool.query(
    `select photo_path from style_cards where customer_id = $1 and photo_path is not null`,
    [customerId]
  );
  for (const row of photoRows) {
    await deletePhotoFile(row.photo_path);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`delete from style_cards where customer_id = $1`, [customerId]);
    await client.query(`delete from face_scans where customer_id = $1`, [customerId]);
    await client.query(`delete from messages where customer_id = $1`, [customerId]);
    await client.query(`delete from queue_entries where customer_id = $1`, [customerId]);
    await client.query(`delete from appointments where customer_id = $1`, [customerId]);
    await client.query(`delete from visits where customer_id = $1`, [customerId]);
    const { rows } = await client.query(`delete from customers where id = $1 returning phone`, [customerId]);
    await client.query('COMMIT');
    if (!rows[0]) {
      throw new CustomerNotFoundError('Customer not found');
    }
    return { phone: rows[0].phone };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
