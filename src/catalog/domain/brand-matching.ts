import type { BrandStatus } from './normalization-proposal';

export interface CatalogBrand {
  id: string;
  name: string;
  aliases: string[];
}

export interface BrandMatch {
  brand: string | null;
  brandStatus: BrandStatus;
  brandId: string | null;
  matchedBy: 'name' | 'alias' | null;
}

const LEADING_ARTICLE = /^(la|el|los|las)\s+/;

/**
 * Comparison key for brands: lowercase, no accents, no leading Spanish article
 * and no punctuation or spaces, so "La Serenísima", "SERENISIMA" and
 * "Coca Cola" / "Coca-Cola" collapse to the same key.
 */
export function brandKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(LEADING_ARTICLE, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Exact match on the normalized key against names first, then aliases. No
 * fuzzy matching: an unknown brand goes to review instead of being guessed.
 */
export function matchBrand(
  extracted: string | null,
  brands: CatalogBrand[],
): BrandMatch {
  const trimmed = extracted?.trim() ?? '';
  if (trimmed === '') {
    return {
      brand: null,
      brandStatus: 'SIN_MARCA',
      brandId: null,
      matchedBy: null,
    };
  }

  const key = brandKey(trimmed);
  if (key !== '') {
    const byName = brands.find((brand) => brandKey(brand.name) === key);
    if (byName) {
      return matched(byName, 'name');
    }
    const byAlias = brands.find((brand) =>
      brand.aliases.some((alias) => brandKey(alias) === key),
    );
    if (byAlias) {
      return matched(byAlias, 'alias');
    }
  }

  return {
    brand: trimmed,
    brandStatus: 'PENDIENTE_REVISION',
    brandId: null,
    matchedBy: null,
  };
}

function matched(brand: CatalogBrand, matchedBy: 'name' | 'alias'): BrandMatch {
  return {
    brand: brand.name,
    brandStatus: 'MATCHED',
    brandId: brand.id,
    matchedBy,
  };
}
