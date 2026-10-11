import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from '../app';
import { verifyInstallToken } from '../lib/install-token';
import { getInstallTarget } from '../services/purchases';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const page = (title: string, body: string) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#f2f2f7;color:#111;
    display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
  .card{background:#fff;border-radius:20px;padding:28px 22px;max-width:380px;width:100%;text-align:center}
  img{width:88px;height:88px;border-radius:20px}
  h1{font-size:22px;margin:14px 0 6px} p{color:#555;line-height:1.45;margin:8px 0}
  a.btn{display:block;margin-top:18px;background:#007aff;color:#fff;text-decoration:none;
    padding:15px;border-radius:14px;font-weight:600;font-size:17px}
  @media (prefers-color-scheme:dark){body{background:#000;color:#fff}.card{background:#1c1c1e}p{color:#aaa}}
</style></head><body><div class="card">${body}</div></body></html>`;

/**
 * Public install page opened in Safari. It hands iOS an itms-services link that points to the
 * app's OTA manifest; the per-purchase token expires together with the install window.
 */
export const installRoutes =
  ({ config, db }: AppDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/:token', async (req, reply) => {
      const { token } = req.params as { token: string };
      const purchaseId = verifyInstallToken(config.INSTALL_LINK_SECRET, token);
      const target = purchaseId ? await getInstallTarget(db, purchaseId) : null;
      reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-store');

      if (!target?.manifest_url) {
        return reply
          .status(410)
          .send(page('Ссылка недействительна', '<h1>Ссылка недействительна</h1><p>Срок ссылки истёк. Вернитесь в Telegram и откройте покупку.</p>'));
      }

      const itms = `itms-services://?action=download-manifest&url=${encodeURIComponent(target.manifest_url)}`;
      const icon = target.icon_url ? `<img src="${escapeHtml(target.icon_url)}" alt="">` : '';
      return reply.send(
        page(
          `Установка ${target.app_name}`,
          `${icon}<h1>${escapeHtml(target.app_name)}</h1>
           <p>Нажмите «Установить», затем подтвердите установку в появившемся окне.</p>
           <a class="btn" href="${escapeHtml(itms)}">Установить</a>
           <p style="font-size:14px">После появления иконки на экране вернитесь в Telegram к шагу активации.</p>`,
        ),
      );
    });
  };
