import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env.schema.js';
import { buildDataSourceOptions } from './data-source.options.js';
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions({
          POSTGRES_HOST: config.get('POSTGRES_HOST', { infer: true }),
          POSTGRES_PORT: config.get('POSTGRES_PORT', { infer: true }),
          POSTGRES_USER: config.get('POSTGRES_USER', { infer: true }),
          POSTGRES_PASSWORD: config.get('POSTGRES_PASSWORD', { infer: true }),
          POSTGRES_DB: config.get('POSTGRES_DB', { infer: true }),
        }),
    }),
  ],
})
export class DatabaseModule {}
