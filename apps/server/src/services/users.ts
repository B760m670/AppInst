import type { Db } from '../db';
import type { TelegramUser } from '../lib/telegram-auth';

/**
 * Creates the user on first contact and refreshes the name afterwards.
 * The referrer is only recorded for brand-new users and never points to themselves.
 */
export async function upsertUser(db: Db, user: TelegramUser, referrerId: number | null): Promise<void> {
  const ref = referrerId && referrerId !== user.id ? referrerId : null;
  await db.query(
    `INSERT INTO users(id, username, first_name, referrer_id)
     VALUES ($1, $2, $3, (SELECT id FROM users WHERE id = $4))
     ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name`,
    [user.id, user.username ?? null, user.first_name ?? null, ref],
  );
}
