import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '../src/users/user-role.enum';
import { Actor, registerActor } from './utils/actors';
import { createE2eApp, resetDatabase } from './utils/e2e-app';

interface ProductBody {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sellerId: string;
}

// Typed as unknown so asymmetric matchers do not leak `any` into the assertions.
const anyString: unknown = expect.any(String);

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let seller: Actor;
  let otherSeller: Actor;
  let buyer: Actor;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    seller = await registerActor(app, 'seller@example.com', UserRole.SELLER);
    otherSeller = await registerActor(
      app,
      'other-seller@example.com',
      UserRole.SELLER,
    );
    buyer = await registerActor(app, 'buyer@example.com', UserRole.BUYER);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createProduct(owner: Actor): Promise<ProductBody> {
    const res = await request(app.getHttpServer())
      .post('/products')
      .auth(owner.token, { type: 'bearer' })
      .send({ name: 'Milk 1L', description: 'Whole milk', price: 1250.5 })
      .expect(201);
    return res.body as ProductBody;
  }

  it('lets a seller create a product with a numeric price', async () => {
    const product = await createProduct(seller);

    expect(product).toMatchObject({
      id: anyString,
      name: 'Milk 1L',
      description: 'Whole milk',
      price: 1250.5,
      sellerId: seller.id,
    });
  });

  it('lists and shows products without authentication', async () => {
    const product = await createProduct(seller);

    const list = await request(app.getHttpServer())
      .get('/products')
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ id: product.id, price: 1250.5 }),
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/products/${product.id}`)
      .expect(200);
    expect(detail.body).toMatchObject({ id: product.id, name: 'Milk 1L' });
  });

  it('forbids a buyer from creating products', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .auth(buyer.token, { type: 'bearer' })
      .send({ name: 'Milk 1L', price: 10 })
      .expect(403);
  });

  it('forbids another seller from editing or deleting the product', async () => {
    const product = await createProduct(seller);

    await request(app.getHttpServer())
      .patch(`/products/${product.id}`)
      .auth(otherSeller.token, { type: 'bearer' })
      .send({ price: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/products/${product.id}`)
      .auth(otherSeller.token, { type: 'bearer' })
      .expect(403);
  });

  it('lets the owner edit and delete the product', async () => {
    const product = await createProduct(seller);

    const updated = await request(app.getHttpServer())
      .patch(`/products/${product.id}`)
      .auth(seller.token, { type: 'bearer' })
      .send({ price: 999.99 })
      .expect(200);
    expect(updated.body).toMatchObject({ id: product.id, price: 999.99 });

    await request(app.getHttpServer())
      .delete(`/products/${product.id}`)
      .auth(seller.token, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .get(`/products/${product.id}`)
      .expect(404);
  });
});
