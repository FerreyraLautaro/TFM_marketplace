import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { TEST_DATABASE } from './utils/test-database';

// Creates the test database once per run; migrations are applied by the app on init.
export default async function globalSetup(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const admin = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres',
  });
  await admin.initialize();
  try {
    const rows: unknown[] = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DATABASE],
    );
    if (rows.length === 0) {
      // CREATE DATABASE cannot run inside a transaction or take parameters.
      await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    }
  } finally {
    await admin.destroy();
  }
}
