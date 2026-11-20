import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.schema';
import { buildDataSourceOptions } from './data-source.options';

// Entry point for the TypeORM CLI, which runs outside Nest and does not load .env.
// Variables already present in the environment (e.g. on Railway) take precedence.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
