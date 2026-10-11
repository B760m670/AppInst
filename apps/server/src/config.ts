import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  /** Public https origin where this server is reachable, e.g. https://appinst.example. */
  PUBLIC_URL: z.url().transform((v) => v.replace(/\/$/, '')),
  DATABASE_URL: z.string().min(1),

  BOT_TOKEN: z.string().min(1),
  BOT_USERNAME: z.string().min(1),
  /** Short name of the Mini App registered in @BotFather (t.me/<bot>/<short name>). */
  MINIAPP_SHORT_NAME: z.string().default('app'),
  /** polling for a single instance / local dev, webhook for production behind https. */
  BOT_MODE: z.enum(['polling', 'webhook', 'off']).default('polling'),
  BOT_WEBHOOK_SECRET: z.string().default(''),
  ADMIN_IDS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean).map(Number)),
  SUPPORT_URL: z.string().default(''),
  /** Max age of Telegram initData accepted by the API. */
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().default(86_400),

  FREEKASSA_MERCHANT_ID: z.string().min(1),
  FREEKASSA_SECRET_1: z.string().min(1),
  FREEKASSA_SECRET_2: z.string().min(1),
  FREEKASSA_PAY_URL: z.url().default('https://pay.fk.money/'),
  /** Optional payment method id (the `i` parameter), e.g. the SBP method of your cabinet. */
  FREEKASSA_METHOD_ID: z.string().default(''),
  FREEKASSA_CHECK_IP: bool.default(true),

  /** Secret for signing per-purchase install links. */
  INSTALL_LINK_SECRET: z.string().min(16),
  REFERRAL_PERCENT: z.coerce.number().min(0).max(100).default(10),
  REFERRAL_MIN_PAYOUT_RUB: z.coerce.number().min(0).default(500),
  /** Directory with the built Mini App. Served at / when it exists. */
  MINIAPP_DIST: z.string().default(new URL('../../miniapp/dist', import.meta.url).pathname),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
