import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CURRENT_PROMPT_VERSION,
  PROMPT_VERSIONS,
  PromptVersion,
} from '../prompts';

export class NormalizeProductDto {
  /** Product line as it comes from the supplier. */
  @ApiProperty({ example: 'LECHE SERENISIMA ENTERA 1LT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rawText!: string;

  @ApiProperty({
    enum: PROMPT_VERSIONS,
    required: false,
    default: CURRENT_PROMPT_VERSION,
  })
  @IsOptional()
  @IsIn(PROMPT_VERSIONS)
  promptVersion?: PromptVersion;
}
