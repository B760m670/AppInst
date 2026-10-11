import { buildApp } from './app';
import { createBot } from './bot';
import { loadConfig } from './config';
import { createDb } from './db';
import { migrate } from './migrate';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
await migrate(db);

const { bot, notifier, setup } = createBot(config, db);
const app = await buildApp({ config, db, notifier, bot });
await app.listen({ port: config.PORT, host: '0.0.0.0' });

if (config.BOT_MODE !== 'off') {
  await setup().catch((err) => app.log.warn(err, 'Cannot set the bot menu button'));
  if (config.BOT_MODE === 'webhook') {
    await bot.api.setWebhook(`${config.PUBLIC_URL}/bot/webhook`, {
      secret_token: config.BOT_WEBHOOK_SECRET || undefined,
    });
  } else {
    await bot.api.deleteWebhook();
    void bot.start({ onStart: (me) => app.log.info(`Bot @${me.username} started (polling)`) });
  }
}

const shutdown = async () => {
  if (config.BOT_MODE === 'polling') await bot.stop();
  await app.close();
  await db.end();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
