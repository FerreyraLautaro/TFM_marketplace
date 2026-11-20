import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { TEST_DATABASE } from './test-database';

export async function createE2eApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: ['error'],
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
      'TRUNCATE "order_item", "sub_order", "order", "product", "user" RESTART IDENTITY CASCADE',
    );
}
