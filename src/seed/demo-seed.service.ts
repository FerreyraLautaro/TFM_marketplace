import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Env } from '../config/env.schema';
import { Product } from '../products/product.entity';
import { UserRole } from '../users/user-role.enum';
import { User } from '../users/user.entity';
import { DEMO_PRODUCTS, DEMO_USERS } from './demo-data';

const BCRYPT_COST = 10;

export interface SeedSummary {
  usersCreated: number;
  productsCreated: number;
}

/**
 * Loads demo users and products on startup when SEED_DEMO_DATA is true. It is
 * idempotent: existing users and products are left untouched (including their
 * passwords), so leaving the flag on across deploys duplicates nothing.
 */
@Injectable()
export class DemoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('SEED_DEMO_DATA', { infer: true })) {
      return;
    }
    // Demo data is not critical: a failure is logged and the app keeps serving.
    try {
      const summary = await this.seed();
      this.logger.log(
        `Demo data ready: ${summary.usersCreated} user(s) and ${summary.productsCreated} product(s) created`,
      );
    } catch (error) {
      this.logger.error('Demo seed failed', error as Error);
    }
  }

  seed(): Promise<SeedSummary> {
    const buyerPassword = this.config.get('SEED_BUYER_PASSWORD', {
      infer: true,
    });
    const sellerPassword = this.config.get('SEED_SELLER_PASSWORD', {
      infer: true,
    });
    if (!buyerPassword || !sellerPassword) {
      throw new Error('Seed passwords are not configured');
    }

    return this.dataSource.transaction(async (manager) => {
      const summary: SeedSummary = { usersCreated: 0, productsCreated: 0 };
      const users = manager.getRepository(User);
      const products = manager.getRepository(Product);
      const sellerIds = new Map<string, string>();

      for (const demo of DEMO_USERS) {
        let user = await users.findOneBy({ email: demo.email });
        if (!user) {
          const password =
            demo.role === UserRole.BUYER ? buyerPassword : sellerPassword;
          user = await users.save(
            users.create({
              email: demo.email,
              role: demo.role,
              commissionRate: demo.commissionRate,
              passwordHash: await bcrypt.hash(password, BCRYPT_COST),
            }),
          );
          summary.usersCreated++;
        }
        sellerIds.set(demo.email, user.id);
      }

      for (const demo of DEMO_PRODUCTS) {
        const sellerId = sellerIds.get(demo.sellerEmail);
        if (!sellerId) {
          throw new Error(`Unknown demo seller ${demo.sellerEmail}`);
        }
        const exists = await products.existsBy({ sellerId, name: demo.name });
        if (!exists) {
          await products.save(
            products.create({
              sellerId,
              name: demo.name,
              description: demo.description,
              price: demo.price,
            }),
          );
          summary.productsCreated++;
        }
      }
      return summary;
    });
  }
}
