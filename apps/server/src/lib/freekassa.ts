import { createHash } from 'node:crypto';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

/** Freekassa notification servers, see the "Оповещение о платеже" section of the docs. */
export const FREEKASSA_IPS = ['168.119.157.136', '168.119.60.227', '178.154.197.79', '51.250.54.238'];

export interface FreekassaConfig {
  merchantId: string;
  secret1: string;
  secret2: string;
  payUrl: string;
  methodId?: string;
}

/** Amount in the format Freekassa signs: rubles without trailing zeros ("790", "199.5"). */
export const formatAmount = (minor: number) => String(Number((minor / 100).toFixed(2)));

/** Builds the payment form URL (SCI): sign = md5(m:oa:secret1:currency:o). */
export function buildPaymentUrl(cfg: FreekassaConfig, orderId: number, amountMinor: number, currency = 'RUB'): string {
  const oa = formatAmount(amountMinor);
  const url = new URL(cfg.payUrl);
  url.searchParams.set('m', cfg.merchantId);
  url.searchParams.set('oa', oa);
  url.searchParams.set('currency', currency);
  url.searchParams.set('o', String(orderId));
  url.searchParams.set('s', md5(`${cfg.merchantId}:${oa}:${cfg.secret1}:${currency}:${orderId}`));
  url.searchParams.set('lang', 'ru');
  if (cfg.methodId) url.searchParams.set('i', cfg.methodId);
  return url.toString();
}

export interface FreekassaNotification {
  MERCHANT_ID: string;
  AMOUNT: string;
  MERCHANT_ORDER_ID: string;
  intid?: string;
  SIGN: string;
}

/** Checks the notification signature: md5(MERCHANT_ID:AMOUNT:secret2:MERCHANT_ORDER_ID). */
export function verifyNotification(cfg: FreekassaConfig, n: Partial<FreekassaNotification>): boolean {
  if (!n.MERCHANT_ID || !n.AMOUNT || !n.MERCHANT_ORDER_ID || !n.SIGN) return false;
  if (n.MERCHANT_ID !== cfg.merchantId) return false;
  const expected = md5(`${n.MERCHANT_ID}:${n.AMOUNT}:${cfg.secret2}:${n.MERCHANT_ORDER_ID}`);
  return expected === n.SIGN.toLowerCase();
}

/** Parses the AMOUNT field into minor units, or null when it is malformed. */
export function parseAmountMinor(amount: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return null;
  return Math.round(Number(amount) * 100);
}

/** Test helper: signs a notification the way Freekassa does. */
export function signNotification(cfg: FreekassaConfig, orderId: number, amount: string): FreekassaNotification {
  return {
    MERCHANT_ID: cfg.merchantId,
    AMOUNT: amount,
    MERCHANT_ORDER_ID: String(orderId),
    intid: '1000001',
    SIGN: md5(`${cfg.merchantId}:${amount}:${cfg.secret2}:${orderId}`),
  };
}
