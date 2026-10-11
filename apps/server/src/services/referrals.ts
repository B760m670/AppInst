import type { ReferralsDto } from '@appinst/shared';
import { inTransaction, type Db } from '../db';
import { ApiError } from './errors';

export interface ReferralConfig {
  percent: number;
  minPayoutMinor: number;
  link: (userId: number) => string;
}

export async function getReferrals(db: Db, userId: number, cfg: ReferralConfig): Promise<ReferralsDto> {
  const [{ rows: stats }, { rows: tx }] = await Promise.all([
    db.query<{ invited: number; paid: number; balance: number }>(
      `SELECT
         (SELECT count(*) FROM users WHERE referrer_id = $1) AS invited,
         (SELECT count(DISTINCT o.user_id) FROM orders o JOIN users u ON u.id = o.user_id
           WHERE u.referrer_id = $1 AND o.status = 'paid') AS paid,
         (SELECT ref_balance_minor FROM users WHERE id = $1) AS balance`,
      [userId],
    ),
    db.query<{ id: number; kind: 'accrual' | 'payout'; amount_minor: number; created_at: Date }>(
      `SELECT id, kind, amount_minor, created_at FROM referral_transactions
       WHERE user_id = $1 ORDER BY id DESC LIMIT 50`,
      [userId],
    ),
  ]);
  const s = stats[0]!;
  return {
    link: cfg.link(userId),
    percent: cfg.percent,
    invited: s.invited,
    paid: s.paid,
    balanceMinor: s.balance ?? 0,
    minPayoutMinor: cfg.minPayoutMinor,
    transactions: tx.map((t) => ({
      id: t.id,
      kind: t.kind,
      amountMinor: t.amount_minor,
      createdAt: t.created_at.toISOString(),
    })),
  };
}

/** Moves the whole referral balance into a payout request handled manually by an admin. */
export async function requestPayout(db: Db, userId: number, details: string, minPayoutMinor: number) {
  return inTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ ref_balance_minor: number }>(
      'SELECT ref_balance_minor FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    const balance = rows[0]?.ref_balance_minor ?? 0;
    if (balance <= 0 || balance < minPayoutMinor) {
      throw new ApiError(409, 'payout_too_small', 'Недостаточно средств для вывода.');
    }
    const { rows: payout } = await tx.query<{ id: number }>(
      'INSERT INTO payouts(user_id, amount_minor, details) VALUES ($1, $2, $3) RETURNING id',
      [userId, balance, details],
    );
    await tx.query(
      `INSERT INTO referral_transactions(user_id, kind, amount_minor) VALUES ($1, 'payout', $2)`,
      [userId, -balance],
    );
    await tx.query('UPDATE users SET ref_balance_minor = 0 WHERE id = $1', [userId]);
    return { payoutId: payout[0]!.id, amountMinor: balance };
  });
}
