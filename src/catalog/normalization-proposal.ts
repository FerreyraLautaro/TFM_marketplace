import type { Category } from './categories';
import type { CanonicalUnit } from './units';

export type BrandStatus = 'MATCHED' | 'PENDIENTE_REVISION' | 'SIN_MARCA';

/** What the normalizer proposes for a raw product line. It never creates or changes products. */
export interface NormalizationProposal {
  /** Catalog name when matched; otherwise the brand as the model extracted it. */
  brand: string | null;
  brandStatus: BrandStatus;
  brandId: string | null;
  matchedBy: 'name' | 'alias' | null;
  /** Brand exactly as the model extracted it, kept for review. */
  extractedBrand: string | null;
  productName: string;
  quantity: number | null;
  unit: CanonicalUnit | null;
  category: Category;
  confidence: 'high' | 'medium' | 'low';
}
