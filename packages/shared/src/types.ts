export type PurchaseStatus = 'available' | 'installing' | 'installed' | 'expired' | 'refunded';
export type OrderStatus = 'pending' | 'paid' | 'cancelled';

export interface AppDto {
  id: string;
  name: string;
  category: string;
  iconUrl: string | null;
  version: string | null;
  description: string | null;
  minIos: string | null;
  popular: boolean;
  available: boolean;
}

export interface ExtraInstruction {
  title: string;
  steps: string[];
  /** Optional link the user should open after the first launch (deeplink or https). */
  link?: string;
}

export interface PurchaseDto {
  id: number;
  orderId: number;
  appId: string;
  appName: string;
  appIconUrl: string | null;
  appVersion: string | null;
  amountMinor: number;
  status: PurchaseStatus;
  createdAt: string;
  installStartedAt: string | null;
  installExpiresAt: string | null;
  installedAt: string | null;
  /** Present only while the install window is open. */
  installUrl?: string;
  extraInstructions: ExtraInstruction[];
}

export interface OrderDto {
  id: number;
  status: OrderStatus;
  amountMinor: number;
  currency: string;
  appIds: string[];
  createdAt: string;
  paidAt: string | null;
}

export interface ProfileDto {
  user: { id: number; username: string | null; firstName: string | null; isAdmin: boolean };
  purchases: PurchaseDto[];
}

export interface ReferralsDto {
  link: string;
  percent: number;
  invited: number;
  paid: number;
  balanceMinor: number;
  minPayoutMinor: number;
  transactions: { id: number; kind: 'accrual' | 'payout'; amountMinor: number; createdAt: string }[];
}

export const INSTALL_WINDOW_HOURS = 12;
