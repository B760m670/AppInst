import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createDb, inTransaction, type Db } from './db';

const dir = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(dir + file, 'utf8');
    await inTransaction(db, async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDb(url);
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
  await db.end();
}
