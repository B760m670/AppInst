import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { inTransaction } from '../db';
import { listApps, saveApp } from '../services/apps';
import { ApiError } from '../services/errors';
import { resetPurchase } from '../services/purchases';
import { getInstallationsPaused, getPricing, getSetting, setSetting } from '../services/settings';

const appSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{2,40}$/),
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  icon_url: z.url().nullable().default(null),
  version: z.string().max(40).nullable().default(null),
  description: z.string().max(500).nullable().default(null),
  min_ios: z.string().max(10).nullable().default(null),
  manifest_url: z.url().startsWith('https://').nullable().default(null),
  extra_instructions: z
    .array(z.object({ title: z.string().min(1), steps: z.array(z.string()), link: z.string().optional() }))
    .default([]),
  popular: z.boolean().default(false),
  active: z.boolean().default(true),
  sort: z.number().int().default(0),
});

const settingsSchema = z.object({
  pricing: z
    .object({
      baseUnitPriceMinor: z.number().int().positive(),
      positionPriceStepMinor: z.number().int().nonnegative(),
      minimumUnitPriceMinor: z.number().int().positive(),
      markupPercent: z.number().min(0).max(1000),
      roundingStepMinor: z.number().int().positive(),
      maximumItems: z.number().int().min(1).max(100),
    })
    .partial()
    .optional(),
  promotion: z
    .object({
      id: z.string().min(1),
      title: z.string().min(1),
      requiredCount: z.number().int().min(1),
      priceMinor: z.number().int().positive(),
      active: z.boolean(),
    })
    .nullable()
    .optional(),
  installationsPaused: z.boolean().optional(),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

export const adminRoutes =
  ({ db, notifier }: AppDeps, adminOnly: (req: FastifyRequest) => Promise<void>): FastifyPluginAsync =>
  async (app) => {
    app.addHook('preHandler', adminOnly);

    app.get('/apps', async () => listApps(db, true));

    app.put('/apps/:id', async (req) => {
      const input = appSchema.parse({ ...(req.body as object), id: (req.params as { id: string }).id });
      return saveApp(db, input);
    });

    app.get('/settings', async () => ({
      pricing: await getPricing(db),
      promotion: await getSetting(db, 'promotion', null),
      installationsPaused: await getInstallationsPaused(db),
    }));

    app.put('/settings', async (req) => {
      const input = settingsSchema.parse(req.body);
      if (input.pricing) await setSetting(db, 'pricing', { ...(await getSetting(db, 'pricing', {})), ...input.pricing });
      if (input.promotion !== undefined) await setSetting(db, 'promotion', input.promotion);
      if (input.installationsPaused !== undefined) await setSetting(db, 'installationsPaused', input.installationsPaused);
      return { ok: true };
    });

    app.get('/orders', async () => {
      const { rows } = await db.query(
        `SELECT o.id, o.user_id, u.username, o.status, o.amount_minor, o.created_at, o.paid_at,
                array_agg(a.name ORDER BY a.name) AS apps
         FROM orders o JOIN users u ON u.id = o.user_id
         JOIN order_items i ON i.order_id = o.id JOIN apps a ON a.id = i.app_id
         GROUP BY o.id, u.username ORDER BY o.id DESC LIMIT 200`,
      );
      return rows;
    });

    app.get('/purchases', async (req) => {
      const { userId } = z.object({ userId: z.coerce.number().int().optional() }).parse(req.query);
      const { rows } = await db.query(
        `SELECT p.id, p.order_id, p.user_id, a.name AS app_name, p.status, p.install_expires_at, p.created_at
         FROM purchases p JOIN apps a ON a.id = p.app_id
         WHERE ($1::bigint IS NULL OR p.user_id = $1) ORDER BY p.id DESC LIMIT 200`,
        [userId ?? null],
      );
      return rows;
    });

    app.post('/purchases/:id/reset', async (req) => {
      await resetPurchase(db, idParam.parse(req.params).id);
      return { ok: true };
    });

    app.get('/payouts', async () => {
      const { rows } = await db.query(
        `SELECT p.*, u.username FROM payouts p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 200`,
      );
      return rows;
    });

    app.post('/payouts/:id/:action', async (req) => {
      const { id, action } = z
        .object({ id: z.coerce.number().int().positive(), action: z.enum(['complete', 'reject']) })
        .parse(req.params);
      const status = action === 'complete' ? 'completed' : 'rejected';
      await inTransaction(db, async (tx) => {
        const { rows } = await tx.query<{ user_id: number; amount_minor: number }>(
          `UPDATE payouts SET status = $2, completed_at = now() WHERE id = $1 AND status = 'requested'
           RETURNING user_id, amount_minor`,
          [id, status],
        );
        const payout = rows[0];
        if (!payout) throw new ApiError(409, 'payout_not_pending', 'Заявка уже обработана.');
        if (status === 'rejected') {
          // Return the money to the referral balance.
          await tx.query('UPDATE users SET ref_balance_minor = ref_balance_minor + $2 WHERE id = $1', [
            payout.user_id, payout.amount_minor,
          ]);
          await tx.query(`INSERT INTO referral_transactions(user_id, kind, amount_minor) VALUES ($1, 'accrual', $2)`, [
            payout.user_id, payout.amount_minor,
          ]);
        }
      });
      await notifier.admins(`Заявка на вывод №${id}: ${status === 'completed' ? 'выплачено' : 'отклонено'}`);
      return { ok: true };
    });
  };
