/** Units the model may return, as they appear in supermarket text. */
export const RAW_UNITS = ['ml', 'cl', 'l', 'cc', 'g', 'kg', 'unidad'] as const;
export type RawUnit = (typeof RAW_UNITS)[number];

/** Canonical units stored in the catalog. */
export const CANONICAL_UNITS = ['ml', 'g', 'unidad'] as const;
export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

const CONVERSIONS: Record<RawUnit, { unit: CanonicalUnit; factor: number }> = {
  ml: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  l: { unit: 'ml', factor: 1000 },
  cc: { unit: 'ml', factor: 1 },
  g: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  unidad: { unit: 'unidad', factor: 1 },
};

export interface CanonicalQuantity {
  quantity: number | null;
  unit: CanonicalUnit | null;
}

/**
 * Deterministic conversion to ml / g / unidad. A unit without a quantity
 * (e.g. "X KG", sold by weight) keeps the canonical unit and a null quantity.
 * A quantity without a unit cannot be interpreted, so both become null.
 */
export function toCanonicalQuantity(
  quantity: number | null,
  unit: RawUnit | null,
): CanonicalQuantity {
  if (unit === null) {
    return { quantity: null, unit: null };
  }
  const conversion = CONVERSIONS[unit];
  if (quantity === null) {
    return { quantity: null, unit: conversion.unit };
  }
  // Two decimals are enough and remove float artifacts (1.1 * 1000 = 1100.0000000000002).
  const converted = Math.round(quantity * conversion.factor * 100) / 100;
  return { quantity: converted, unit: conversion.unit };
}
