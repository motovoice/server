import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';

export async function runMigrations(): Promise<void> {
  const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '../../postgres/init.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  await db.query(sql);
}
