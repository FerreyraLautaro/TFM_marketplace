import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmModule } from '../llm/llm.module';
import { Brand } from './domain/brand.entity';
import { CatalogController } from './http/catalog.controller';
import { CatalogNormalizerService } from './application/catalog-normalizer.service';
import { NormalizationRun } from './domain/normalization-run.entity';

@Module({
  imports: [LlmModule, TypeOrmModule.forFeature([Brand, NormalizationRun])],
  controllers: [CatalogController],
  providers: [CatalogNormalizerService],
})
export class CatalogModule {}
