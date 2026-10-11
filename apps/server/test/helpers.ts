import { loadConfig, type Config } from '../src/config';
import { signInitData } from '../src/lib/telegram-auth';

export const BOT_TOKEN = '123456:TEST_TOKEN';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    PUBLIC_URL: 'https://shop.example',
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://unused',
    BOT_TOKEN,
    BOT_USERNAME: 'test_shop_bot',
    BOT_MODE: 'off',
    ADMIN_IDS: '1',
    FREEKASSA_MERCHANT_ID: '777',
    FREEKASSA_SECRET_1: 'secret-one',
    FREEKASSA_SECRET_2: 'secret-two',
    FREEKASSA_CHECK_IP: 'false',
    INSTALL_LINK_SECRET: 'install-link-secret-0123456789',
    REFERRAL_PERCENT: '10',
    REFERRAL_MIN_PAYOUT_RUB: '100',
    MINIAPP_DIST: '/nonexistent',
    ...overrides,
  });
}

export function initDataFor(id: number, extra: Record<string, string> = {}): string {
  return signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: JSON.stringify({ id, first_name: `User ${id}`, username: `user${id}` }),
      ...extra,
    },
    BOT_TOKEN,
  );
}

export const authHeader = (id: number, extra?: Record<string, string>) => ({
  authorization: `tma ${initDataFor(id, extra)}`,
});
