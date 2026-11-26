import { ApiProperty } from '@nestjs/swagger';
import { CATEGORIES, Category } from '../../domain/categories';
import { CONFIDENCE_LEVELS } from '../../domain/llm-output.schema';
import {
  BrandStatus,
  NormalizationProposal,
} from '../../domain/normalization-proposal';
import { PROMPT_VERSIONS, PromptVersion } from '../../application/prompts';
import { CANONICAL_UNITS, CanonicalUnit } from '../../domain/units';

// Swagger shapes mirroring NormalizationResponse.
export class NormalizationProposalDto implements NormalizationProposal {
  @ApiProperty({ type: String, nullable: true, example: 'La Serenísima' })
  brand!: string | null;

  @ApiProperty({ enum: ['MATCHED', 'PENDIENTE_REVISION', 'SIN_MARCA'] })
  brandStatus!: BrandStatus;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  brandId!: string | null;

  @ApiProperty({ enum: ['name', 'alias'], nullable: true })
  matchedBy!: 'name' | 'alias' | null;

  @ApiProperty({ type: String, nullable: true, example: 'SERENISIMA' })
  extractedBrand!: string | null;

  @ApiProperty({ example: 'Leche entera' })
  productName!: string;

  @ApiProperty({ type: Number, nullable: true, example: 1000 })
  quantity!: number | null;

  @ApiProperty({ enum: CANONICAL_UNITS, nullable: true, example: 'ml' })
  unit!: CanonicalUnit | null;

  @ApiProperty({ enum: CATEGORIES, example: 'LACTEOS' })
  category!: Category;

  @ApiProperty({ enum: CONFIDENCE_LEVELS })
  confidence!: 'high' | 'medium' | 'low';
}

export class NormalizationMetaDto {
  attempts!: number;
  latencyMs!: number;
}

export class NormalizeResponseDto {
  @ApiProperty({ format: 'uuid' })
  runId!: string;

  @ApiProperty({ enum: PROMPT_VERSIONS })
  promptVersion!: PromptVersion;

  model!: string;

  proposal!: NormalizationProposalDto;

  meta!: NormalizationMetaDto;
}
