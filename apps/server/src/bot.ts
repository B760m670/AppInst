import { Bot, InlineKeyboard } from 'grammy';
import { formatRub } from '@appinst/shared';
import type { Config } from './config';
import type { Db } from './db';
import { parseReferrer } from './lib/telegram-auth';
import { upsertUser } from './services/users';

/** Messages the server sends to users and admins. Tests use a no-op implementation. */
export interface Notifier {
  orderPaid(userId: number, orderId: number, appNames: string[]): Promise<void>;
  referralAccrued(userId: number, amountMinor: number): Promise<void>;
  admins(text: string): Promise<void>;
}

export const noopNotifier: Notifier = {
  orderPaid: async () => {},
  referralAccrued: async () => {},
  admins: async () => {},
};

export function createBot(config: Config, db: Db) {
  const bot = new Bot(config.BOT_TOKEN);
  const miniAppUrl = config.PUBLIC_URL;

  const openKeyboard = (label = 'Открыть каталог') => {
    const kb = new InlineKeyboard().webApp(label, miniAppUrl);
    if (config.SUPPORT_URL) kb.row().url('Поддержка', config.SUPPORT_URL);
    return kb;
  };

  bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    await upsertUser(db, ctx.from, parseReferrer(ctx.match));
    await ctx.reply(
      'Привет! Здесь можно установить на iPhone приложения, которых нет в App Store вашего региона.\n\n' +
        '1. Выберите приложения в каталоге.\n2. Оплатите заказ.\n3. Установите и активируйте по инструкции.',
      { reply_markup: openKeyboard() },
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      config.SUPPORT_URL ? `Поддержка: ${config.SUPPORT_URL}` : 'Напишите нам, и мы поможем с установкой.',
      { reply_markup: openKeyboard('Мои покупки') },
    );
  });

  bot.catch((err) => console.error('Bot error', err.error));

  const send = async (chatId: number, text: string, withButton = false) => {
    try {
      await bot.api.sendMessage(chatId, text, withButton ? { reply_markup: openKeyboard('Открыть покупки') } : {});
    } catch (err) {
      // The user may have blocked the bot; payment processing must not fail because of that.
      console.warn(`Cannot message ${chatId}:`, (err as Error).message);
    }
  };

  const notifier: Notifier = {
    orderPaid: (userId, orderId, appNames) =>
      send(
        userId,
        `Оплата заказа №${orderId} получена ✅\n\n${appNames.map((n) => `• ${n}`).join('\n')}\n\n` +
          'Откройте покупки и начните установку. Ссылка действует 12 часов после старта.',
        true,
      ),
    referralAccrued: (userId, amountMinor) =>
      send(userId, `Вам начислено ${formatRub(amountMinor)} по реферальной программе 🎁`),
    admins: async (text) => {
      await Promise.all(config.ADMIN_IDS.map((id) => send(id, text)));
    },
  };

  /** Sets the chat menu button so the Mini App opens from any chat with the bot. */
  const setup = async () => {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Каталог', web_app: { url: miniAppUrl } } });
    await bot.api.setMyCommands([
      { command: 'start', description: 'Открыть каталог' },
      { command: 'help', description: 'Поддержка' },
    ]);
  };

  return { bot, notifier, setup };
}
