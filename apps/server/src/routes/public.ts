import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../app';
import { getInstallationsPaused, getPricing, getPromotion } from '../services/settings';

export const publicRoutes =
  ({ config, db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/health', async () => ({ status: 'ok' }));

    app.get('/public-settings', async () => ({
      supportUrl: config.SUPPORT_URL || null,
      installationsPaused: await getInstallationsPaused(db),
      botUrl: `https://t.me/${config.BOT_USERNAME}`,
    }));

    app.get('/public-pricing', async () => ({
      pricing: await getPricing(db),
      promotion: await getPromotion(db),
    }));
  };
