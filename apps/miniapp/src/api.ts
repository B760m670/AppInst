import type { AppDto, OrderDto, PricingSettings, ProfileDto, Promotion, PurchaseDto, ReferralsDto } from '@appinst/shared';
import { tg } from './telegram';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `tma ${tg()?.initData ?? ''}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи. Проверьте интернет и повторите.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'unknown', err.message ?? 'Что-то пошло не так.', err);
  }
  return data as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) });

export interface PricingResponse {
  pricing: PricingSettings;
  promotion: Promotion | null;
}

export interface AdminApp {
  id: string;
  name: string;
  category: string;
  icon_url: string | null;
  version: string | null;
  description: string | null;
  min_ios: string | null;
  manifest_url: string | null;
  extra_instructions: { title: string; steps: string[]; link?: string }[];
  popular: boolean;
  active: boolean;
  sort: number;
}

export const api = {
  publicSettings: () => request<{ supportUrl: string | null; installationsPaused: boolean; botUrl: string }>('/public-settings'),
  apps: () => request<AppDto[]>('/apps'),
  pricing: () => request<PricingResponse>('/pricing'),
  profile: () => request<ProfileDto>('/profile'),
  createOrder: (appIds: string[], expectedAmountMinor: number) =>
    post<{ order: OrderDto; paymentUrl: string }>('/orders', { appIds, expectedAmountMinor }),
  order: (id: number) => request<{ order: OrderDto; paymentUrl: string | null }>(`/orders/${id}`),
  purchase: (id: number) => request<PurchaseDto>(`/purchases/${id}`),
  startInstall: (id: number) => post<PurchaseDto>(`/purchases/${id}/install`),
  markInstalled: (id: number) => post<PurchaseDto>(`/purchases/${id}/installed`),
  referrals: () => request<ReferralsDto>('/referrals/me'),
  requestPayout: (details: string) => post<{ payoutId: number; amountMinor: number }>('/referrals/payout', { details }),

  admin: {
    apps: () => request<AdminApp[]>('/admin/apps'),
    saveApp: (app: AdminApp) => put<AdminApp>(`/admin/apps/${encodeURIComponent(app.id)}`, app),
    settings: () => request<PricingResponse & { installationsPaused: boolean }>('/admin/settings'),
    saveSettings: (s: Partial<PricingResponse & { installationsPaused: boolean }>) => put('/admin/settings', s),
    orders: () =>
      request<{ id: number; user_id: number; username: string | null; status: string; amount_minor: number; created_at: string; apps: string[] }[]>(
        '/admin/orders',
      ),
    payouts: () =>
      request<{ id: number; user_id: number; username: string | null; amount_minor: number; details: string; status: string; created_at: string }[]>(
        '/admin/payouts',
      ),
    payoutAction: (id: number, action: 'complete' | 'reject') => post(`/admin/payouts/${id}/${action}`),
    resetPurchase: (id: number) => post(`/admin/purchases/${id}/reset`),
  },
};
