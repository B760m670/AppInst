import { createHmac, timingSafeEqual } from 'node:crypto';

/** Per-purchase install link token: "<purchaseId>.<expiresAtSec>.<hmac>". */
export function createInstallToken(secret: string, purchaseId: number, expiresAt: Date): string {
  const payload = `${purchaseId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyInstallToken(secret: string, token: string, now = Date.now()): number | null {
  const m = /^(\d+)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return null;
  const payload = `${m[1]}.${m[2]}`;
  const expected = Buffer.from(sign(secret, payload));
  const actual = Buffer.from(m[3]!);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (Number(m[2]) * 1000 < now) return null;
  return Number(m[1]);
}

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 32);
