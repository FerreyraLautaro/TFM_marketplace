import { DataSourceOptions } from 'typeorm';
import { Env } from '../config/env.schema';
import { Brand } from '../catalog/domain/brand.entity';
import { NormalizationRun } from '../catalog/domain/normalization-run.entity';
import { migrations } from './migrations';
import { OrderItem } from '../orders/domain/order-item.entity';
import { Order } from '../orders/domain/order.entity';
import { SubOrder } from '../orders/domain/sub-order.entity';
import { Payment } from '../payments/domain/payment.entity';
import { ProcessedWebhookEvent } from '../payments/domain/processed-webhook-event.entity';
import { Product } from '../products/domain/product.entity';
import { User } from '../users/domain/user.entity';

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
    entities: [
      User,
      Product,
      Order,
      SubOrder,
      OrderItem,
      Brand,
      NormalizationRun,
      Payment,
      ProcessedWebhookEvent,
    ],
    migrations,
    synchronize: false,
  };
}
