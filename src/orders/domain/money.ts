// Money is computed in integer cents so sums and percentages never accumulate float errors.

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function commissionCents(subtotalCents: number, rate: number): number {
  return Math.round((subtotalCents * rate) / 100);
}
