import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Upper bound matches the numeric(12,2) column. The Swagger plugin maps
  // @IsPositive() to minimum 1, so the real lower bound is documented here.
  @ApiProperty({ minimum: 0, exclusiveMinimum: true, example: 1250.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999999999.99)
  price!: number;
}
