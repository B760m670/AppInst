import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { Notifier } from '../src/bot';
import { createDb, type Db } from '../src/db';
import { signNotification } from '../src/lib/freekassa';
import { migrate } from '../src/migrate';
import { saveApp } from '../src/services/apps';
import { authHeader, testConfig } from './helpers';

const dbUrl = process.env.TEST_DATABASE_URL;
const ADMIN = 1;
const REFERRER = 100;
const BUYER = 200;
const fk = { merchantId: '777', secret1: 'secret-one', secret2: 'secret-two', payUrl: 'https://pay.fk.money/' };

describe.skipIf(!dbUrl)('API', () => {
  let db: Db;
  let app: FastifyInstance;
  const sent: string[] = [];
  const notifier: Notifier = {
    orderPaid: async (userId, orderId) => void sent.push(`paid:${userId}:${orderId}`),
    referralAccrued: async (userId, amount) => void sent.push(`ref:${userId}:${amount}`),
    admins: async (text) => void sent.push(`admin:${text}`),
  };

  const notify = (body: object) =>
    app.inject({ method: 'POST', url: '/payments/freekassa', payload: new URLSearchParams(body as Record<string, string>).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' } });

  beforeAll(async () => {
    db = createDb(dbUrl!);
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(db);
    const base = { category: 'Банки', icon_url: null, version: '1.0', description: null, min_ios: '17.0',
      extra_instructions: [], popular: false, active: true };
    await saveApp(db, { ...base, id: 'a1', name: 'App One', manifest_url: 'https://cdn.example/a1/manifest.plist' });
    await saveApp(db, { ...base, id: 'a2', name: 'App Two', manifest_url: 'https://cdn.example/a2/manifest.plist' });
    await saveApp(db, { ...base, id: 'a3', name: 'No Manifest', manifest_url: null });
    app = await buildApp({ config: testConfig(), db, notifier });
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('serves public endpoints without auth and protects the rest', async () => {
    expect((await app.inject('/api/v1/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/api/v1/public-pricing')).json().pricing.baseUnitPriceMinor).toBe(50_000);
    const res = await app.inject('/api/v1/apps');
    expect(res.statusCode).toBe(401);
  });

  it('lists the catalog and registers referrals from start_param', async () => {
    await app.inject({ url: '/api/v1/profile', headers: authHeader(REFERRER) });
    const res = await app.inject({ url: '/api/v1/apps', headers: authHeader(BUYER, { start_param: `ref_${REFERRER}` }) });
    expect(res.json().map((a: { id: string; available: boolean }) => [a.id, a.available])).toEqual([
      ['a1', true],
      ['a2', true],
      ['a3', false],
    ]);
    const { rows } = await db.query('SELECT referrer_id FROM users WHERE id = $1', [BUYER]);
    expect(rows[0].referrer_id).toBe(REFERRER);
  });

  let orderId: number;

  it('creates an order only at the current price and only for available apps', async () => {
    const post = (payload: object) => app.inject({ method: 'POST', url: '/api/v1/orders', headers: authHeader(BUYER), payload });
    const stale = await post({ appIds: ['a1', 'a2'], expectedAmountMinor: 100 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({ code: 'price_changed', amountMinor: 155_000 });
    expect((await post({ appIds: ['a3'], expectedAmountMinor: 79_000 })).json().error.code).toBe('app_unavailable');

    const ok = await post({ appIds: ['a1', 'a2', 'a1'], expectedAmountMinor: 155_000 });
    expect(ok.statusCode).toBe(200);
    orderId = ok.json().order.id;
    const url = new URL(ok.json().paymentUrl);
    expect(url.searchParams.get('o')).toBe(String(orderId));
    expect(url.searchParams.get('oa')).toBe('1550');
  });

  it('does not show other users their orders', async () => {
    expect((await app.inject({ url: `/api/v1/orders/${orderId}`, headers: authHeader(REFERRER) })).statusCode).toBe(404);
  });

  it('rejects forged and mismatching payment notifications', async () => {
    expect((await notify({ ...signNotification(fk, orderId, '1550'), SIGN: 'bad' })).statusCode).toBe(400);
    expect((await notify(signNotification(fk, orderId, '10'))).statusCode).toBe(400);
    const strict = await buildApp({ config: testConfig({ FREEKASSA_CHECK_IP: 'true' }), db, notifier });
    const res = await strict.inject({ method: 'POST', url: '/payments/freekassa', payload: signNotification(fk, orderId, '1550') });
    expect(res.statusCode).toBe(403);
    await strict.close();
    const { rows } = await db.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(rows[0].status).toBe('pending');
  });

  it('marks the order paid once, issues purchases and accrues the referral bonus', async () => {
    const first = await notify(signNotification(fk, orderId, '1550.00'));
    expect(first.body).toBe('YES');
    expect((await notify(signNotification(fk, orderId, '1550.00'))).body).toBe('YES');

    expect(sent.filter((s) => s.startsWith('paid:'))).toEqual([`paid:${BUYER}:${orderId}`]);
    expect(sent).toContain(`ref:${REFERRER}:15500`);

    const profile = (await app.inject({ url: '/api/v1/profile', headers: authHeader(BUYER) })).json();
    expect(profile.purchases).toHaveLength(2);
    expect(profile.purchases.every((p: { status: string }) => p.status === 'available')).toBe(true);
    expect(profile.purchases.reduce((s: number, p: { amountMinor: number }) => s + p.amountMinor, 0)).toBe(155_000);
  });

  it('opens an install window with a signed link and lets the user finish it', async () => {
    const profile = (await app.inject({ url: '/api/v1/profile', headers: authHeader(BUYER) })).json();
    const [p1, p2] = profile.purchases;

    const other = await app.inject({ method: 'POST', url: `/api/v1/purchases/${p1.id}/install`, headers: authHeader(REFERRER) });
    expect(other.statusCode).toBe(404);

    const started = (await app.inject({ method: 'POST', url: `/api/v1/purchases/${p1.id}/install`, headers: authHeader(BUYER) })).json();
    expect(started.status).toBe('installing');
    expect(new Date(started.installExpiresAt).getTime() - Date.now()).toBeGreaterThan(11.9 * 3600_000);
    const page = await app.inject(new URL(started.installUrl).pathname);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('itms-services://?action=download-manifest&amp;url=https%3A%2F%2Fcdn.example%2F');

    const done = await app.inject({ method: 'POST', url: `/api/v1/purchases/${p1.id}/installed`, headers: authHeader(BUYER) });
    expect(done.json().status).toBe('installed');
    expect((await app.inject(new URL(started.installUrl).pathname)).statusCode).toBe(410);

    // The second purchase's window runs out.
    await app.inject({ method: 'POST', url: `/api/v1/purchases/${p2.id}/install`, headers: authHeader(BUYER) });
    await db.query(`UPDATE purchases SET install_expires_at = now() - interval '1 minute' WHERE id = $1`, [p2.id]);
    const expired = (await app.inject({ url: `/api/v1/purchases/${p2.id}`, headers: authHeader(BUYER) })).json();
    expect(expired.status).toBe('expired');
    expect(expired.installUrl).toBeUndefined();

    // Support resets it.
    const reset = await app.inject({ method: 'POST', url: `/api/v1/admin/purchases/${p2.id}/reset`, headers: authHeader(ADMIN) });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ url: `/api/v1/purchases/${p2.id}`, headers: authHeader(BUYER) })).json().status).toBe('available');
  });

  it('handles referral payouts', async () => {
    const before = (await app.inject({ url: '/api/v1/referrals/me', headers: authHeader(REFERRER) })).json();
    expect(before).toMatchObject({ invited: 1, paid: 1, balanceMinor: 15_500, percent: 10 });
    expect(before.link).toBe(`https://t.me/test_shop_bot/app?startapp=ref_${REFERRER}`);

    const payout = await app.inject({ method: 'POST', url: '/api/v1/referrals/payout', headers: authHeader(REFERRER),
      payload: { details: 'СБП +79990000000' } });
    expect(payout.json().amountMinor).toBe(15_500);
    const again = await app.inject({ method: 'POST', url: '/api/v1/referrals/payout', headers: authHeader(REFERRER),
      payload: { details: 'СБП +79990000000' } });
    expect(again.statusCode).toBe(409);

    const reject = await app.inject({ method: 'POST', url: `/api/v1/admin/payouts/${payout.json().payoutId}/reject`, headers: authHeader(ADMIN) });
    expect(reject.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/referrals/me', headers: authHeader(REFERRER) })).json().balanceMinor).toBe(15_500);
  });

  it('restricts the admin API and applies settings', async () => {
    expect((await app.inject({ url: '/api/v1/admin/apps', headers: authHeader(BUYER) })).statusCode).toBe(403);

    const saved = await app.inject({ method: 'PUT', url: '/api/v1/admin/apps/a3', headers: authHeader(ADMIN),
      payload: { name: 'Now Available', category: 'Сервисы', manifest_url: 'https://cdn.example/a3/manifest.plist' } });
    expect(saved.statusCode).toBe(200);
    const bad = await app.inject({ method: 'PUT', url: '/api/v1/admin/apps/a3', headers: authHeader(ADMIN),
      payload: { name: 'X', category: 'Y', manifest_url: 'http://insecure/manifest.plist' } });
    expect(bad.statusCode).toBe(400);

    await app.inject({ method: 'PUT', url: '/api/v1/admin/settings', headers: authHeader(ADMIN),
      payload: { promotion: { id: 'two', title: '2 за 999', requiredCount: 2, priceMinor: 99_900, active: true } } });
    const order = await app.inject({ method: 'POST', url: '/api/v1/orders', headers: authHeader(BUYER),
      payload: { appIds: ['a1', 'a3'], expectedAmountMinor: 99_900 } });
    expect(order.statusCode).toBe(200);

    await app.inject({ method: 'PUT', url: '/api/v1/admin/settings', headers: authHeader(ADMIN), payload: { installationsPaused: true } });
    const paused = await app.inject({ method: 'POST', url: '/api/v1/orders', headers: authHeader(BUYER),
      payload: { appIds: ['a1'], expectedAmountMinor: 79_000 } });
    expect(paused.statusCode).toBe(503);
  });
});
