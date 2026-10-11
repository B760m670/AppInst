import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../app';
import { FREEKASSA_IPS, parseAmountMinor, verifyNotification, type FreekassaNotification } from '../lib/freekassa';
import { ApiError } from '../services/errors';
import { markOrderPaid } from '../services/orders';

export const paymentRoutes =
  ({ config, db, notifier }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const cfg = {
      merchantId: config.FREEKASSA_MERCHANT_ID,
      secret1: config.FREEKASSA_SECRET_1,
      secret2: config.FREEKASSA_SECRET_2,
      payUrl: config.FREEKASSA_PAY_URL,
    };

    /**
     * Freekassa "URL оповещения". Must answer plain "YES" on success,
     * otherwise Freekassa retries the notification.
     */
    app.post('/freekassa', async (req, reply) => {
      if (config.FREEKASSA_CHECK_IP && !FREEKASSA_IPS.includes(req.ip)) {
        req.log.warn({ ip: req.ip }, 'Freekassa notification from unknown IP');
        return reply.status(403).send('forbidden');
      }
      const body = (req.body ?? {}) as Partial<FreekassaNotification>;
      if (!verifyNotification(cfg, body)) return reply.status(400).send('wrong sign');

      const orderId = Number(body.MERCHANT_ORDER_ID);
      const amount = parseAmountMinor(body.AMOUNT!);
      if (!Number.isSafeInteger(orderId) || amount === null) return reply.status(400).send('bad request');

      try {
        const paid = await markOrderPaid(db, orderId, amount, body.intid ?? null, config.REFERRAL_PERCENT);
        if (paid) {
          await notifier.orderPaid(paid.userId, paid.orderId, paid.appNames);
          if (paid.referrer) await notifier.referralAccrued(paid.referrer.id, paid.referrer.amountMinor);
          await notifier.admins(`Оплачен заказ №${paid.orderId} на ${paid.amountMinor / 100} ₽ (${paid.appNames.join(', ')})`);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          req.log.error({ orderId, code: err.code }, err.message);
          return reply.status(err.status).send(err.code);
        }
        throw err;
      }
      return reply.type('text/plain').send('YES');
    });
  };
