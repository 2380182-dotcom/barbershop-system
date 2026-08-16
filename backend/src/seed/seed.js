import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';

const BCRYPT_COST = 12;

async function seed() {
  const ownerUsername = process.env.OWNER_USERNAME || 'owner';
  const ownerPassword = process.env.OWNER_PASSWORD;
  const ownerName = process.env.OWNER_NAME || 'Owner';
  const shopName = process.env.SHOP_NAME || 'The Shop';

  if (!ownerPassword) {
    throw new Error('OWNER_PASSWORD environment variable is required to seed the owner account');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingSettings } = await client.query(`select id from shop_settings limit 1`);
    if (!existingSettings[0]) {
      await client.query(
        `insert into shop_settings (shop_name) values ($1)`,
        [shopName]
      );
      console.log('Created shop_settings row');
    } else {
      console.log('shop_settings already exists, skipping');
    }

    const { rows: existingOwner } = await client.query(
      `select id from users where username = $1`,
      [ownerUsername]
    );
    if (!existingOwner[0]) {
      const passwordHash = await bcrypt.hash(ownerPassword, BCRYPT_COST);
      await client.query(
        `insert into users (name, username, password_hash, role) values ($1, $2, $3, 'owner')`,
        [ownerName, ownerUsername, passwordHash]
      );
      console.log(`Created owner user "${ownerUsername}"`);
    } else {
      console.log(`Owner user "${ownerUsername}" already exists, skipping`);
    }

    const { rows: existingBarbers } = await client.query(`select count(*)::int as count from barbers`);
    if (existingBarbers[0].count === 0) {
      const barberNames = ['Barber One', 'Barber Two', 'Barber Three'];
      for (let i = 0; i < barberNames.length; i++) {
        await client.query(
          `insert into barbers (display_name, sort_order) values ($1, $2)`,
          [barberNames[i], i]
        );
      }
      console.log('Created 3 barbers');
    } else {
      console.log('Barbers already exist, skipping');
    }

    const { rows: existingServices } = await client.query(`select count(*)::int as count from services`);
    if (existingServices[0].count === 0) {
      const services = [
        { name: 'Haircut', durationMinutes: 30, price: 0, growOutDays: 21 },
        { name: 'Beard trim', durationMinutes: 15, price: 0, growOutDays: 10 },
        { name: 'Haircut + beard', durationMinutes: 45, price: 0, growOutDays: 18 },
      ];
      for (let i = 0; i < services.length; i++) {
        const s = services[i];
        await client.query(
          `insert into services (name, duration_minutes, price, grow_out_days, sort_order)
           values ($1, $2, $3, $4, $5)`,
          [s.name, s.durationMinutes, s.price, s.growOutDays, i]
        );
      }
      console.log('Created 3 services');
    } else {
      console.log('Services already exist, skipping');
    }

    await client.query('COMMIT');
    console.log('Seed complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
