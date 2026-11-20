import { DataSourceOptions } from 'typeorm';
import { Env } from '../config/env.schema';
import { User } from '../users/user.entity';

export type DatabaseEnv = Pick<
  Env,
  | 'POSTGRES_HOST'
  | 'POSTGRES_PORT'
  | 'POSTGRES_USER'
  | 'POSTGRES_PASSWORD'
  | 'POSTGRES_DB'
>;

export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    username: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    entities: [User],
    // Only .ts when running from source (CLI via ts-node) and only .js from dist,
    // so the compiled .d.ts files are never loaded as migrations.
    migrations: [
      `${__dirname}/migrations/*.${__filename.endsWith('.ts') ? 'ts' : 'js'}`,
    ],
    synchronize: false,
  };
}
