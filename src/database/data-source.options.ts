import { DataSourceOptions } from 'typeorm';
import { Env } from '../config/env.schema';
import { Brand } from '../catalog/brand.entity';
import { NormalizationRun } from '../catalog/normalization-run.entity';
import { migrations } from './migrations';
import { OrderItem } from '../orders/order-item.entity';
import { Order } from '../orders/order.entity';
import { SubOrder } from '../orders/sub-order.entity';
import { Product } from '../products/product.entity';
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
    entities: [
      User,
      Product,
      Order,
      SubOrder,
      OrderItem,
      Brand,
      NormalizationRun,
    ],
    migrations,
    synchronize: false,
  };
}
