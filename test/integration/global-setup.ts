import { readFileSync } from 'fs';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

// Integration tests run against a real PostgreSQL. To never wipe real data,
// they use a separate "<db>_test" database next to the one in POSTGRES_URL,
// creating it if needed, and apply the schema once before all files run.
export default async function setup(project: TestProject) {
  const baseUrl = process.env.POSTGRES_URL;
  if (!baseUrl) {
    throw new Error(
      'POSTGRES_URL is not set. Integration tests need a PostgreSQL server ' +
      '(e.g. the devcontainer database). Run "npm run test:unit" to skip them.',
    );
  }

  const url = new URL(baseUrl);
  const dbName = decodeURIComponent(url.pathname.slice(1)) || 'postgres';
  const testDbName = dbName.endsWith('_test') ? dbName : `${dbName}_test`;
  if (!/^[A-Za-z0-9_]+$/.test(testDbName)) {
    throw new Error(`Unsupported database name for tests: ${testDbName}`);
  }

  if (testDbName !== dbName) {
    const admin = new pg.Client({ connectionString: baseUrl });
    await admin.connect();
    try {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDbName]);
      if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${testDbName}"`);
    } finally {
      await admin.end();
    }
  }

  url.pathname = `/${testDbName}`;
  const testUrl = url.toString();

  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query(readFileSync(new URL('../../postgres/init.sql', import.meta.url), 'utf-8'));
  } finally {
    await client.end();
  }

  project.provide('testDatabaseUrl', testUrl);
}
