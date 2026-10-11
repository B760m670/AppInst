/** Pricing settings. All money values are in minor units (kopecks). */
export interface PricingSettings {
  /** Price of the 1st app in an order, before markup. */
  baseUnitPriceMinor: number;
  /** Each next app in the order is cheaper by this amount. */
  positionPriceStepMinor: number;
  /** A single app never costs less than this, before markup. */
  minimumUnitPriceMinor: number;
  /** Markup on top of the computed sum, in percent (e.g. 58). */
  markupPercent: number;
  /** The total is rounded to this step (e.g. 1000 = 10 RUB). */
  roundingStepMinor: number;
  maximumItems: number;
  currency: 'RUB';
}

/** "Exactly N apps for a fixed price" promotion. */
export interface Promotion {
  id: string;
  title: string;
  requiredCount: number;
  priceMinor: number;
  active: boolean;
}

export interface Quote {
  count: number;
  /** Price per position (with markup), the sum may differ from total by rounding. */
  positionPricesMinor: number[];
  totalMinor: number;
  /** What the same apps would cost at the 1st-app price each. */
  originalTotalMinor: number;
  discountPercent: number;
  promotionId: string | null;
}

export const DEFAULT_PRICING: PricingSettings = {
  baseUnitPriceMinor: 50_000,
  positionPriceStepMinor: 2_000,
  minimumUnitPriceMinor: 20_000,
  markupPercent: 58,
  roundingStepMinor: 1_000,
  maximumItems: 100,
  currency: 'RUB',
};

const applyMarkup = (amount: number, markupPercent: number) =>
  Math.round((amount * (100 + markupPercent)) / 100);

const roundTo = (amount: number, step: number) => Math.round(amount / step) * step;

export function quote(count: number, settings: PricingSettings, promotion?: Promotion | null): Quote {
  const n = Math.max(0, Math.trunc(count));
  if (n > settings.maximumItems) throw new Error(`At most ${settings.maximumItems} apps per order`);

  const basePrices = Array.from({ length: n }, (_, i) =>
    Math.max(settings.minimumUnitPriceMinor, settings.baseUnitPriceMinor - i * settings.positionPriceStepMinor),
  );
  const positionPricesMinor = basePrices.map((p) => applyMarkup(p, settings.markupPercent));
  const originalTotalMinor = roundTo(
    applyMarkup(settings.baseUnitPriceMinor * n, settings.markupPercent),
    settings.roundingStepMinor,
  );

  let totalMinor = roundTo(
    applyMarkup(basePrices.reduce((a, b) => a + b, 0), settings.markupPercent),
    settings.roundingStepMinor,
  );
  let promotionId: string | null = null;
  if (promotion?.active && n === promotion.requiredCount && promotion.priceMinor < totalMinor) {
    totalMinor = promotion.priceMinor;
    promotionId = promotion.id;
  }

  const discountPercent =
    originalTotalMinor > 0 ? Math.round(((originalTotalMinor - totalMinor) * 100) / originalTotalMinor) : 0;
  return { count: n, positionPricesMinor, totalMinor, originalTotalMinor, discountPercent, promotionId };
}

/** Splits an order total between its items proportionally to their position prices. */
export function splitTotal(totalMinor: number, positionPricesMinor: number[]): number[] {
  const sum = positionPricesMinor.reduce((a, b) => a + b, 0);
  if (sum === 0) return positionPricesMinor.map(() => 0);
  const parts = positionPricesMinor.map((p) => Math.floor((p * totalMinor) / sum));
  const rest = totalMinor - parts.reduce((a, b) => a + b, 0);
  if (parts.length > 0) parts[0]! += rest;
  return parts;
}

export const formatRub = (minor: number) =>
  `${(minor / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
