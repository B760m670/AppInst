import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import { webhookCallback, type Bot } from 'grammy';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { Db } from './db';
import type { Notifier } from './bot';
import { validateInitData, parseReferrer, type InitData } from './lib/telegram-auth';
import { ApiError } from './services/errors';
import { upsertUser } from './services/users';
import { publicRoutes } from './routes/public';
import { userRoutes } from './routes/user';
import { paymentRoutes } from './routes/payments';
import { adminRoutes } from './routes/admin';
import { installRoutes } from './routes/install';

declare module 'fastify' {
  interface FastifyRequest {
    tg: InitData;
  }
}

export interface AppDeps {
  config: Config;
  db: Db;
  notifier: Notifier;
  bot?: Bot;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', trustProxy: true });
  await app.register(formbody);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...err.details } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'bad_request', message: 'Некорректный запрос.' } });
    }
    req.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ error: { code: 'internal', message: 'Внутренняя ошибка.' } });
  });

  /** Authenticates Mini App requests by `Authorization: tma <initData>`. */
  const auth = async (req: FastifyRequest) => {
    const header = req.headers.authorization ?? '';
    const raw = header.startsWith('tma ') ? header.slice(4) : '';
    const data = raw && validateInitData(raw, config.BOT_TOKEN, config.INIT_DATA_MAX_AGE_SEC);
    if (!data) throw new ApiError(401, 'unauthorized', 'Откройте приложение из Telegram.');
    req.tg = data;
    await upsertUser(db, data.user, parseReferrer(data.startParam));
  };
  const adminOnly = async (req: FastifyRequest) => {
    await auth(req);
    if (!config.ADMIN_IDS.includes(req.tg.user.id)) throw new ApiError(403, 'forbidden', 'Нет доступа.');
  };

  await app.register(publicRoutes(deps), { prefix: '/api/v1' });
  await app.register(userRoutes(deps, auth), { prefix: '/api/v1' });
  await app.register(adminRoutes(deps, adminOnly), { prefix: '/api/v1/admin' });
  await app.register(paymentRoutes(deps), { prefix: '/payments' });
  await app.register(installRoutes(deps), { prefix: '/install' });

  if (deps.bot && config.BOT_MODE === 'webhook') {
    app.post('/bot/webhook', webhookCallback(deps.bot, 'fastify', { secretToken: config.BOT_WEBHOOK_SECRET || undefined }));
  }

  if (existsSync(config.MINIAPP_DIST)) {
    await app.register(fastifyStatic, { root: config.MINIAPP_DIST });
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' && !req.url.startsWith('/api/')
        ? reply.sendFile('index.html')
        : reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } }),
    );
  }

  return app;
}
