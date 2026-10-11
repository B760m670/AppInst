import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { buildPaymentUrl } from '../lib/freekassa';
import { listApps, toAppDto } from '../services/apps';
import { ApiError } from '../services/errors';
import { createOrder, getOrder } from '../services/orders';
import { getPurchase, listPurchases, markInstalled, startInstall } from '../services/purchases';
import { getReferrals, requestPayout } from '../services/referrals';
import { getPricing, getPromotion } from '../services/settings';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export const userRoutes =
  ({ config, db, notifier }: AppDeps, auth: (req: FastifyRequest) => Promise<void>): FastifyPluginAsync =>
  async (app) => {
    app.addHook('preHandler', auth);

    const link = { publicUrl: config.PUBLIC_URL, secret: config.INSTALL_LINK_SECRET };
    const freekassa = {
      merchantId: config.FREEKASSA_MERCHANT_ID,
      secret1: config.FREEKASSA_SECRET_1,
      secret2: config.FREEKASSA_SECRET_2,
      payUrl: config.FREEKASSA_PAY_URL,
      methodId: config.FREEKASSA_METHOD_ID,
    };
    const referral = {
      percent: config.REFERRAL_PERCENT,
      minPayoutMinor: config.REFERRAL_MIN_PAYOUT_RUB * 100,
      link: (id: number) => `https://t.me/${config.BOT_USERNAME}/${config.MINIAPP_SHORT_NAME}?startapp=ref_${id}`,
    };

    app.get('/apps', async () => (await listApps(db)).map(toAppDto));

    app.get('/pricing', async () => ({ pricing: await getPricing(db), promotion: await getPromotion(db) }));

    app.get('/profile', async (req) => ({
      user: {
        id: req.tg.user.id,
        username: req.tg.user.username ?? null,
        firstName: req.tg.user.first_name ?? null,
        isAdmin: config.ADMIN_IDS.includes(req.tg.user.id),
      },
      purchases: await listPurchases(db, req.tg.user.id, link),
    }));

    app.post('/orders', async (req) => {
      const body = z
        .object({ appIds: z.array(z.string().min(1)).min(1), expectedAmountMinor: z.number().int().nonnegative() })
        .parse(req.body);
      const order = await createOrder(db, { userId: req.tg.user.id, ...body });
      return { order, paymentUrl: buildPaymentUrl(freekassa, order.id, order.amountMinor, order.currency) };
    });

    app.get('/orders/:id', async (req) => {
      const { id } = idParam.parse(req.params);
      const order = await getOrder(db, id, req.tg.user.id);
      if (!order) throw new ApiError(404, 'order_not_found', 'Заказ не найден.');
      return {
        order,
        paymentUrl:
          order.status === 'pending' ? buildPaymentUrl(freekassa, order.id, order.amountMinor, order.currency) : null,
      };
    });

    app.get('/purchases/:id', async (req) => getPurchase(db, idParam.parse(req.params).id, req.tg.user.id, link));

    app.post('/purchases/:id/install', async (req) =>
      startInstall(db, idParam.parse(req.params).id, req.tg.user.id, link),
    );

    app.post('/purchases/:id/installed', async (req) =>
      markInstalled(db, idParam.parse(req.params).id, req.tg.user.id, link),
    );

    app.get('/referrals/me', async (req) => getReferrals(db, req.tg.user.id, referral));

    app.post('/referrals/payout', async (req) => {
      const { details } = z.object({ details: z.string().trim().min(3).max(300) }).parse(req.body);
      const payout = await requestPayout(db, req.tg.user.id, details, referral.minPayoutMinor);
      const who = req.tg.user.username ? `@${req.tg.user.username}` : `id ${req.tg.user.id}`;
      await notifier.admins(
        `Запрос на вывод №${payout.payoutId}: ${payout.amountMinor / 100} ₽ от ${who}\nРеквизиты: ${details}`,
      );
      return payout;
    });
  };
