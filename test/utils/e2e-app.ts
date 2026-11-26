import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { TEST_DATABASE } from './test-database';

export interface ProviderOverride {
  token: Parameters<TestingModuleBuilder['overrideProvider']>[0];
  useValue: unknown;
}

export async function createE2eApp(
  overrides: ProviderOverride[] = [],
): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  for (const { token, useValue } of overrides) {
    builder.overrideProvider(token).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  // Same rawBody option as main.ts: webhook signatures are verified on the raw bytes.
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: ['error'],
    rawBody: true,
  });
  setupApp(app);
  await app.init();

  const { database } = app.get(DataSource).options;
  if (database !== TEST_DATABASE) {
    await app.close();
    throw new Error(`E2E tests must run against ${TEST_DATABASE}`);
  }
  return app;
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  await app
    .get(DataSource)
    .query(
      'TRUNCATE "processed_webhook_event", "payment", "normalization_run", "order_item", "sub_order", "order", "product", "user" RESTART IDENTITY CASCADE',
    );
}
