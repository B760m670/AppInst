import { DEFAULT_PRICING, type PricingSettings, type Promotion } from '@appinst/shared';
import type { Db, Tx } from '../db';

export async function getSetting<T>(db: Db | Tx, key: string, fallback: T): Promise<T> {
  const { rows } = await db.query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? fallback;
}

export async function setSetting(db: Db | Tx, key: string, value: unknown): Promise<void> {
  await db.query(
    `INSERT INTO settings(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

export async function getPricing(db: Db | Tx): Promise<PricingSettings> {
  return { ...DEFAULT_PRICING, ...(await getSetting<Partial<PricingSettings>>(db, 'pricing', {})) };
}

export async function getPromotion(db: Db | Tx): Promise<Promotion | null> {
  const promo = await getSetting<Promotion | null>(db, 'promotion', null);
  return promo?.active ? promo : null;
}

/** When true, new orders and installs are blocked (maintenance). */
export const getInstallationsPaused = (db: Db | Tx) => getSetting<boolean>(db, 'installationsPaused', false);
