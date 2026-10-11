import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPaymentUrl, formatAmount, parseAmountMinor, signNotification, verifyNotification } from '../src/lib/freekassa';
import { createInstallToken, verifyInstallToken } from '../src/lib/install-token';
import { parseReferrer, validateInitData } from '../src/lib/telegram-auth';
import { BOT_TOKEN, initDataFor } from './helpers';

describe('validateInitData', () => {
  it('accepts correctly signed data and reads the start param', () => {
    const data = validateInitData(initDataFor(42, { start_param: 'ref_7' }), BOT_TOKEN, 3600);
    expect(data?.user.id).toBe(42);
    expect(data?.startParam).toBe('ref_7');
  });

  it('rejects tampered, foreign and stale data', () => {
    const raw = initDataFor(42);
    expect(validateInitData(raw.replace('User+42', 'User+43'), BOT_TOKEN, 3600)).toBeNull();
    expect(validateInitData(raw, '999:OTHER', 3600)).toBeNull();
    expect(validateInitData(raw, BOT_TOKEN, 60, Date.now() + 120_000)).toBeNull();
    expect(validateInitData('user=%7B%7D', BOT_TOKEN, 3600)).toBeNull();
  });

  it('parses referral params', () => {
    expect(parseReferrer('ref_123')).toBe(123);
    expect(parseReferrer('ref_abc')).toBeNull();
    expect(parseReferrer(null)).toBeNull();
  });
});

describe('freekassa', () => {
  const cfg = { merchantId: '777', secret1: 's1', secret2: 's2', payUrl: 'https://pay.fk.money/' };

  it('builds a signed payment URL', () => {
    const url = new URL(buildPaymentUrl({ ...cfg, methodId: '44' }, 15, 79_000));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      m: '777',
      oa: '790',
      currency: 'RUB',
      o: '15',
      i: '44',
      s: createHash('md5').update('777:790:s1:RUB:15').digest('hex'),
    });
  });

  it('formats and parses amounts', () => {
    expect(formatAmount(79_000)).toBe('790');
    expect(formatAmount(19_950)).toBe('199.5');
    expect(parseAmountMinor('790.00')).toBe(79_000);
    expect(parseAmountMinor('1e3')).toBeNull();
  });

  it('verifies notification signatures', () => {
    const n = signNotification(cfg, 15, '790');
    expect(verifyNotification(cfg, n)).toBe(true);
    expect(verifyNotification(cfg, { ...n, AMOUNT: '1' })).toBe(false);
    expect(verifyNotification(cfg, { ...n, MERCHANT_ID: '1' })).toBe(false);
    expect(verifyNotification({ ...cfg, secret2: 'x' }, n)).toBe(false);
  });
});

describe('install token', () => {
  it('round-trips and expires', () => {
    const token = createInstallToken('secret', 5, new Date(Date.now() + 60_000));
    expect(verifyInstallToken('secret', token)).toBe(5);
    expect(verifyInstallToken('other', token)).toBeNull();
    expect(verifyInstallToken('secret', token, Date.now() + 120_000)).toBeNull();
    expect(verifyInstallToken('secret', token.replace(/^5\./, '6.'))).toBeNull();
  });
});
