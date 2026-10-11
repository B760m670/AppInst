import { INSTALL_WINDOW_HOURS, type ExtraInstruction, type PurchaseDto, type PurchaseStatus } from '@appinst/shared';
import type { Db } from '../db';
import { createInstallToken } from '../lib/install-token';
import { ApiError } from './errors';
import { getInstallationsPaused } from './settings';

interface PurchaseRow {
  id: number;
  order_id: number;
  user_id: number;
  app_id: string;
  app_version: string | null;
  amount_minor: number;
  status: PurchaseStatus;
  created_at: Date;
  install_started_at: Date | null;
  install_expires_at: Date | null;
  installed_at: Date | null;
  app_name: string;
  icon_url: string | null;
  manifest_url: string | null;
  extra_instructions: ExtraInstruction[];
}

export interface InstallLinkConfig {
  publicUrl: string;
  secret: string;
}

const SELECT = `
  SELECT p.*, a.name AS app_name, a.icon_url, a.manifest_url, a.extra_instructions
  FROM purchases p JOIN apps a ON a.id = p.app_id`;

/** Install windows close lazily: anything past its deadline becomes "expired" on read. */
async function expireStale(db: Db, userId: number): Promise<void> {
  await db.query(
    `UPDATE purchases SET status = 'expired'
     WHERE user_id = $1 AND status = 'installing' AND install_expires_at < now()`,
    [userId],
  );
}

export async function listPurchases(db: Db, userId: number, link: InstallLinkConfig): Promise<PurchaseDto[]> {
  await expireStale(db, userId);
  const { rows } = await db.query<PurchaseRow>(`${SELECT} WHERE p.user_id = $1 ORDER BY p.id DESC`, [userId]);
  return rows.map((r) => toDto(r, link));
}

export async function getPurchase(db: Db, id: number, userId: number, link: InstallLinkConfig): Promise<PurchaseDto> {
  await expireStale(db, userId);
  const { rows } = await db.query<PurchaseRow>(`${SELECT} WHERE p.id = $1 AND p.user_id = $2`, [id, userId]);
  if (!rows[0]) throw new ApiError(404, 'purchase_not_found', 'Покупка не найдена.');
  return toDto(rows[0], link);
}

/** Opens the 12-hour install window. Calling it again while the window is open is a no-op. */
export async function startInstall(db: Db, id: number, userId: number, link: InstallLinkConfig): Promise<PurchaseDto> {
  const current = await getPurchase(db, id, userId, link);
  if (current.status === 'installing') return current;
  if (current.status !== 'available') {
    throw new ApiError(409, 'install_unavailable', 'Установка недоступна. Обратитесь в поддержку.');
  }
  if (await getInstallationsPaused(db)) {
    throw new ApiError(503, 'installations_paused', 'Технические работы. Повторите позже.');
  }
  await db.query(
    `UPDATE purchases SET status = 'installing', install_started_at = now(),
       install_expires_at = now() + make_interval(hours => $3)
     WHERE id = $1 AND user_id = $2 AND status = 'available'`,
    [id, userId, INSTALL_WINDOW_HOURS],
  );
  return getPurchase(db, id, userId, link);
}

export async function markInstalled(db: Db, id: number, userId: number, link: InstallLinkConfig): Promise<PurchaseDto> {
  const { rowCount } = await db.query(
    `UPDATE purchases SET status = 'installed', installed_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'installing'`,
    [id, userId],
  );
  if (!rowCount) throw new ApiError(409, 'not_installing', 'Сначала начните установку.');
  return getPurchase(db, id, userId, link);
}

/** Support action: gives the user a fresh install window. */
export async function resetPurchase(db: Db, id: number): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE purchases SET status = 'available', install_started_at = NULL, install_expires_at = NULL,
       installed_at = NULL WHERE id = $1 AND status <> 'refunded'`,
    [id],
  );
  if (!rowCount) throw new ApiError(404, 'purchase_not_found', 'Покупка не найдена.');
}

/** Used by the public install page: returns the purchase only while its window is open. */
export async function getInstallTarget(db: Db, id: number) {
  const { rows } = await db.query<PurchaseRow>(
    `${SELECT} WHERE p.id = $1 AND p.status = 'installing' AND p.install_expires_at > now()`,
    [id],
  );
  return rows[0] ?? null;
}

function toDto(r: PurchaseRow, link: InstallLinkConfig): PurchaseDto {
  const dto: PurchaseDto = {
    id: r.id,
    orderId: r.order_id,
    appId: r.app_id,
    appName: r.app_name,
    appIconUrl: r.icon_url,
    appVersion: r.app_version,
    amountMinor: r.amount_minor,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    installStartedAt: r.install_started_at?.toISOString() ?? null,
    installExpiresAt: r.install_expires_at?.toISOString() ?? null,
    installedAt: r.installed_at?.toISOString() ?? null,
    extraInstructions: r.extra_instructions,
  };
  if (r.status === 'installing' && r.install_expires_at && r.manifest_url) {
    dto.installUrl = `${link.publicUrl}/install/${createInstallToken(link.secret, r.id, r.install_expires_at)}`;
  }
  return dto;
}
