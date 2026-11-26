import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { Env } from '../config/env.schema';
import { UserRole } from '../users/user-role.enum';
import { User } from '../users/user.entity';
import { DEMO_PRODUCTS, DEMO_USERS } from './demo-data';
import { DemoSeedService } from './demo-seed.service';

type Saved = Record<string, unknown>;

describe('DemoSeedService', () => {
  let existingEmails: Set<string>;
  let existingProducts: Set<string>;
  let savedUsers: Saved[];
  let savedProducts: Saved[];

  const userRepository = {
    findOneBy: jest.fn(({ email }: { email: string }) =>
      Promise.resolve(
        existingEmails.has(email) ? { id: `id-${email}`, email } : null,
      ),
    ),
    create: jest.fn((data: Saved) => data),
    save: jest.fn((data: Saved) => {
      savedUsers.push(data);
      return Promise.resolve({ ...data, id: `id-${String(data.email)}` });
    }),
  };
  const productRepository = {
    existsBy: jest.fn(
      ({ sellerId, name }: { sellerId: string; name: string }) =>
        Promise.resolve(existingProducts.has(`${sellerId}|${name}`)),
    ),
    create: jest.fn((data: Saved) => data),
    save: jest.fn((data: Saved) => {
      savedProducts.push(data);
      return Promise.resolve(data);
    }),
  };
  const manager = {
    getRepository: (entity: unknown) =>
      entity === User ? userRepository : productRepository,
  } as unknown as EntityManager;
  const transaction = jest.fn((callback: (m: EntityManager) => unknown) =>
    Promise.resolve(callback(manager)),
  );
  const dataSource = { transaction } as unknown as DataSource;

  function createService(env: Partial<Env>): DemoSeedService {
    const config = {
      get: (key: keyof Env) => env[key],
    } as unknown as ConfigService<Env, true>;
    return new DemoSeedService(dataSource, config);
  }

  const enabled: Partial<Env> = {
    SEED_DEMO_DATA: true,
    SEED_BUYER_PASSWORD: 'buyer-password',
    SEED_SELLER_PASSWORD: 'seller-password',
  };

  beforeEach(() => {
    existingEmails = new Set();
    existingProducts = new Set();
    savedUsers = [];
    savedProducts = [];
    jest.clearAllMocks();
  });

  it('does nothing when the flag is off', async () => {
    await createService({ SEED_DEMO_DATA: false }).onApplicationBootstrap();

    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates every demo user and product on an empty database', async () => {
    const summary = await createService(enabled).seed();

    expect(summary).toEqual({
      usersCreated: DEMO_USERS.length,
      productsCreated: DEMO_PRODUCTS.length,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('hashes passwords per role and keeps each seller commission rate', async () => {
    await createService(enabled).seed();

    const buyer = savedUsers.find((user) => user.role === UserRole.BUYER);
    const seller = savedUsers.find(
      (user) => user.email === 'vendedor.bebidas@example.com',
    );
    expect(buyer?.passwordHash).not.toBe('buyer-password');
    expect(
      await bcrypt.compare('buyer-password', String(buyer?.passwordHash)),
    ).toBe(true);
    expect(
      await bcrypt.compare('seller-password', String(seller?.passwordHash)),
    ).toBe(true);
    expect(seller?.commissionRate).toBe(15);
  });

  it('is idempotent: existing users and products are left untouched', async () => {
    existingEmails = new Set(DEMO_USERS.map((user) => user.email));
    existingProducts = new Set(
      DEMO_PRODUCTS.map(
        (product) => `id-${product.sellerEmail}|${product.name}`,
      ),
    );

    const summary = await createService(enabled).seed();

    expect(summary).toEqual({ usersCreated: 0, productsCreated: 0 });
    expect(savedUsers).toEqual([]);
    expect(savedProducts).toEqual([]);
  });

  it('logs a failure instead of stopping the app', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    transaction.mockRejectedValueOnce(new Error('database down'));

    await expect(
      createService(enabled).onApplicationBootstrap(),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
