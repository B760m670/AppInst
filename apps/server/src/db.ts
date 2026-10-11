import pg from 'pg';

// BIGINT (Telegram ids) and COUNT fit into JS numbers for our purposes.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export const createDb = (connectionString: string): Db => new pg.Pool({ connectionString, max: 10 });

export async function inTransaction<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    const result = await fn(tx);
    await tx.query('COMMIT');
    return result;
  } catch (err) {
    await tx.query('ROLLBACK');
    throw err;
  } finally {
    tx.release();
  }
}
