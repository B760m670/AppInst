import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING, quote, splitTotal } from './pricing';

describe('quote', () => {
  it('matches the stepped price list with 58% markup', () => {
    const totals = [1, 2, 3, 5, 10, 20].map((n) => quote(n, DEFAULT_PRICING).totalMinor / 100);
    expect(totals).toEqual([790, 1550, 2280, 3630, 6480, 10110]);
  });

  it('never goes below the minimum unit price', () => {
    const q = quote(30, DEFAULT_PRICING);
    expect(q.positionPricesMinor.at(-1)).toBe(31_600);
  });

  it('applies a promotion only for the exact count', () => {
    const promo = { id: 'five', title: '5 за 1990', requiredCount: 5, priceMinor: 199_000, active: true };
    expect(quote(5, DEFAULT_PRICING, promo)).toMatchObject({ totalMinor: 199_000, promotionId: 'five' });
    expect(quote(4, DEFAULT_PRICING, promo).promotionId).toBeNull();
    expect(quote(5, DEFAULT_PRICING, { ...promo, active: false }).promotionId).toBeNull();
  });

  it('rejects too many items', () => {
    expect(() => quote(101, DEFAULT_PRICING)).toThrow();
  });
});

describe('splitTotal', () => {
  it('keeps the sum exact', () => {
    const parts = splitTotal(199_000, [79_000, 75_840, 72_680, 69_520, 66_360]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(199_000);
  });
});
