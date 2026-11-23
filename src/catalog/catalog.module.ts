import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmModule } from '../llm/llm.module';
import { Brand } from './brand.entity';
import { CatalogController } from './catalog.controller';
import { CatalogNormalizerService } from './catalog-normalizer.service';
import { NormalizationRun } from './normalization-run.entity';

@Module({
  imports: [LlmModule, TypeOrmModule.forFeature([Brand, NormalizationRun])],
  controllers: [CatalogController],
  providers: [CatalogNormalizerService],
})
export class CatalogModule {}
