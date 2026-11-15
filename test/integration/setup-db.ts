import { afterAll, beforeEach, inject } from 'vitest';

// Point the app's pool at the test database before src/services/db.ts loads.
process.env.POSTGRES_URL = inject('testDatabaseUrl');

const { db } = await import('../../src/services/db.js');

beforeEach(async () => {
  await db.query('TRUNCATE room_events, rooms RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await db.end();
});
