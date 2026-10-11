import { quote, splitTotal, type OrderDto } from '@appinst/shared';
import { inTransaction, type Db } from '../db';
import { ApiError } from './errors';
import { getInstallationsPaused, getPricing, getPromotion } from './settings';

interface OrderRow {
  id: number;
  user_id: number;
  status: 'pending' | 'paid' | 'cancelled';
  amount_minor: number;
  currency: string;
  promotion_id: string | null;
  created_at: Date;
  paid_at: Date | null;
}

export interface CreateOrderInput {
  userId: number;
  appIds: string[];
  /** Total the client showed to the user; the order is rejected if the price changed meanwhile. */
  expectedAmountMinor: number;
}

export async function createOrder(db: Db, input: CreateOrderInput): Promise<OrderDto> {
  const appIds = [...new Set(input.appIds)];
  if (await getInstallationsPaused(db)) {
    throw new ApiError(503, 'installations_paused', 'Технические работы. Повторите позже.');
  }
  const pricing = await getPricing(db);
  if (appIds.length < 1 || appIds.length > pricing.maximumItems) {
    throw new ApiError(400, 'invalid_items', `Выберите от 1 до ${pricing.maximumItems} приложений.`);
  }

  const { rows: apps } = await db.query<{ id: string }>(
    'SELECT id FROM apps WHERE id = ANY($1) AND active AND manifest_url IS NOT NULL',
    [appIds],
  );
  if (apps.length !== appIds.length) {
    throw new ApiError(409, 'app_unavailable', 'Часть приложений сейчас недоступна. Обновите каталог.');
  }

  const q = quote(appIds.length, pricing, await getPromotion(db));
  if (q.totalMinor !== input.expectedAmountMinor) {
    throw new ApiError(409, 'price_changed', 'Цена изменилась. Проверьте сумму и повторите.', {
      amountMinor: q.totalMinor,
    });
  }
  const prices = splitTotal(q.totalMinor, q.positionPricesMinor);

  return inTransaction(db, async (tx) => {
    const { rows } = await tx.query<OrderRow>(
      `INSERT INTO orders(user_id, amount_minor, currency, promotion_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.userId, q.totalMinor, pricing.currency, q.promotionId],
    );
    const order = rows[0]!;
    for (const [i, appId] of appIds.entries()) {
      await tx.query('INSERT INTO order_items(order_id, app_id, price_minor) VALUES ($1, $2, $3)', [
        order.id, appId, prices[i],
      ]);
    }
    return toOrderDto(order, appIds);
  });
}

export async function getOrder(db: Db, orderId: number, userId?: number): Promise<OrderDto | null> {
  const { rows } = await db.query<OrderRow & { app_ids: string[] }>(
    `SELECT o.*, array_agg(i.app_id ORDER BY i.app_id) AS app_ids
     FROM orders o JOIN order_items i ON i.order_id = o.id
     WHERE o.id = $1 AND ($2::bigint IS NULL OR o.user_id = $2)
     GROUP BY o.id`,
    [orderId, userId ?? null],
  );
  const row = rows[0];
  return row ? toOrderDto(row, row.app_ids) : null;
}

export interface PaidOrder {
  orderId: number;
  userId: number;
  amountMinor: number;
  appNames: string[];
  referrer: { id: number; amountMinor: number } | null;
}

/**
 * Marks the order paid and issues purchases. Idempotent: a repeated notification for an
 * already paid order returns null. Throws when the paid amount does not match.
 */
export async function markOrderPaid(
  db: Db,
  orderId: number,
  paidAmountMinor: number,
  providerPaymentId: string | null,
  referralPercent: number,
): Promise<PaidOrder | null> {
  return inTransaction(db, async (tx) => {
    const { rows } = await tx.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw new ApiError(404, 'order_not_found', 'Order not found');
    if (order.status === 'paid') return null;
    if (paidAmountMinor !== order.amount_minor) {
      throw new ApiError(400, 'amount_mismatch', `Paid ${paidAmountMinor}, expected ${order.amount_minor}`);
    }

    await tx.query(
      `UPDATE orders SET status = 'paid', paid_at = now(), provider_payment_id = $2 WHERE id = $1`,
      [orderId, providerPaymentId],
    );
    const { rows: items } = await tx.query<{ app_id: string; price_minor: number; name: string; version: string | null }>(
      `SELECT i.app_id, i.price_minor, a.name, a.version
       FROM order_items i JOIN apps a ON a.id = i.app_id WHERE i.order_id = $1 ORDER BY a.name`,
      [orderId],
    );
    for (const item of items) {
      await tx.query(
        `INSERT INTO purchases(order_id, user_id, app_id, app_version, amount_minor)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, order.user_id, item.app_id, item.version, item.price_minor],
      );
    }

    let referrer: PaidOrder['referrer'] = null;
    const { rows: refRows } = await tx.query<{ referrer_id: number | null }>(
      'SELECT referrer_id FROM users WHERE id = $1',
      [order.user_id],
    );
    const referrerId = refRows[0]?.referrer_id;
    const bonus = Math.floor((order.amount_minor * referralPercent) / 100);
    if (referrerId && bonus > 0) {
      await tx.query(
        `INSERT INTO referral_transactions(user_id, kind, amount_minor, order_id) VALUES ($1, 'accrual', $2, $3)`,
        [referrerId, bonus, orderId],
      );
      await tx.query('UPDATE users SET ref_balance_minor = ref_balance_minor + $2 WHERE id = $1', [referrerId, bonus]);
      referrer = { id: referrerId, amountMinor: bonus };
    }

    return {
      orderId,
      userId: order.user_id,
      amountMinor: order.amount_minor,
      appNames: items.map((i) => i.name),
      referrer,
    };
  });
}

const toOrderDto = (o: OrderRow, appIds: string[]): OrderDto => ({
  id: o.id,
  status: o.status,
  amountMinor: o.amount_minor,
  currency: o.currency,
  appIds,
  createdAt: o.created_at.toISOString(),
  paidAt: o.paid_at?.toISOString() ?? null,
});
