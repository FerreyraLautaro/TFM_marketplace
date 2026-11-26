import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from '../src/events/application/ports/event-publisher';
import {
  ORDER_EVENT_TYPES,
  OrderEvent,
} from '../src/orders/domain/order.events';
import { User } from '../src/users/domain/user.entity';
import { UserRole } from '../src/users/domain/user-role.enum';
import { Actor, registerActor } from './utils/actors';
import { createE2eApp, resetDatabase } from './utils/e2e-app';

interface ItemBody {
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

interface SubOrderBody {
  id: string;
  sellerId: string;
  status: string;
  subtotal: number;
  commissionRate: number;
  commissionAmount: number;
  sellerNet: number;
  items: ItemBody[];
}

interface OrderBody {
  id: string;
  buyerId: string;
  status: string;
  total: number;
  subOrders: SubOrderBody[];
}

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  const events: OrderEvent[] = [];
  let buyer: Actor;
  let otherBuyer: Actor;
  let sellerA: Actor;
  let sellerB: Actor;
  let oilId: string;
  let breadId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    const publisher = app.get<EventPublisher>(EVENT_PUBLISHER);
    for (const type of ORDER_EVENT_TYPES) {
      publisher.subscribe<OrderEvent>(type, (event) => {
        events.push(event);
      });
    }
  });

  beforeEach(async () => {
    await resetDatabase(app);
    events.length = 0;

    buyer = await registerActor(app, 'buyer@example.com', UserRole.BUYER);
    otherBuyer = await registerActor(
      app,
      'other-buyer@example.com',
      UserRole.BUYER,
    );
    sellerA = await registerActor(app, 'seller-a@example.com', UserRole.SELLER);
    sellerB = await registerActor(app, 'seller-b@example.com', UserRole.SELLER);

    const users = app.get(DataSource).getRepository(User);
    await users.update(sellerA.id, { commissionRate: 5 });
    await users.update(sellerB.id, { commissionRate: 15 });

    oilId = await createProduct(sellerA, 'Olive oil', 10.5);
    breadId = await createProduct(sellerB, 'Bread', 3.25);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function createProduct(
    seller: Actor,
    name: string,
    price: number,
  ): Promise<string> {
    const res = await request(server())
      .post('/products')
      .auth(seller.token, { type: 'bearer' })
      .send({ name, price })
      .expect(201);
    return (res.body as { id: string }).id;
  }

  // Oil appears twice so the order has to merge it into one item.
  async function placeOrder(): Promise<OrderBody> {
    const res = await request(server())
      .post('/orders')
      .auth(buyer.token, { type: 'bearer' })
      .send({
        items: [
          { productId: oilId, quantity: 2 },
          { productId: breadId, quantity: 4 },
          { productId: oilId, quantity: 1 },
        ],
      })
      .expect(201);
    return res.body as OrderBody;
  }

  function subOrderOf(order: OrderBody, seller: Actor): SubOrderBody {
    const subOrder = order.subOrders.find((s) => s.sellerId === seller.id);
    if (!subOrder) {
      throw new Error(`No suborder for seller ${seller.id}`);
    }
    return subOrder;
  }

  function changeStatus(seller: Actor, subOrderId: string, status: string) {
    return request(server())
      .patch(`/sub-orders/${subOrderId}/status`)
      .auth(seller.token, { type: 'bearer' })
      .send({ status });
  }

  async function getOrder(id: string, as: Actor = buyer): Promise<OrderBody> {
    const res = await request(server())
      .get(`/orders/${id}`)
      .auth(as.token, { type: 'bearer' })
      .expect(200);
    return res.body as OrderBody;
  }

  it('splits an order by seller with merged items, commissions and totals', async () => {
    const order = await placeOrder();

    expect(order).toMatchObject({
      buyerId: buyer.id,
      status: 'PENDING',
      total: 44.5,
    });
    expect(order.subOrders).toHaveLength(2);

    expect(subOrderOf(order, sellerA)).toMatchObject({
      status: 'PENDING',
      subtotal: 31.5,
      commissionRate: 5,
      commissionAmount: 1.58,
      sellerNet: 29.92,
      items: [
        {
          productId: oilId,
          productName: 'Olive oil',
          unitPrice: 10.5,
          quantity: 3,
          subtotal: 31.5,
        },
      ],
    });
    expect(subOrderOf(order, sellerB)).toMatchObject({
      status: 'PENDING',
      subtotal: 13,
      commissionRate: 15,
      commissionAmount: 1.95,
      sellerNet: 11.05,
      items: [
        {
          productId: breadId,
          productName: 'Bread',
          unitPrice: 3.25,
          quantity: 4,
          subtotal: 13,
        },
      ],
    });
  });

  it('keeps the purchase-time price after the seller changes it', async () => {
    const order = await placeOrder();

    await request(server())
      .patch(`/products/${oilId}`)
      .auth(sellerA.token, { type: 'bearer' })
      .send({ price: 99.99 })
      .expect(200);

    const reloaded = await getOrder(order.id);
    expect(reloaded.total).toBe(44.5);
    expect(subOrderOf(reloaded, sellerA).items[0]).toMatchObject({
      unitPrice: 10.5,
      subtotal: 31.5,
    });
  });

  it('runs the order through payment confirmed by webhook, fulfilment and completion', async () => {
    const order = await placeOrder();
    const subA = subOrderOf(order, sellerA);
    const subB = subOrderOf(order, sellerB);

    await changeStatus(sellerA, subA.id, 'ACCEPTED').expect(409);

    // Paying only starts the payment; the order waits for the provider.
    const payment = await request(server())
      .post(`/orders/${order.id}/pay`)
      .auth(buyer.token, { type: 'bearer' })
      .expect(201);
    expect(payment.body).toEqual({
      paymentReference: expect.stringMatching(/^fake-/) as string,
      status: 'PENDING',
      amount: 44.5,
    });
    expect((await getOrder(order.id)).status).toBe('PENDING');
    await changeStatus(sellerA, subA.id, 'ACCEPTED').expect(409);

    const { paymentReference } = payment.body as { paymentReference: string };
    await request(server())
      .post(`/payments/${paymentReference}/simulate`)
      .auth(buyer.token, { type: 'bearer' })
      .send({ status: 'APPROVED' })
      .expect(200, { status: 'processed', outcome: 'APPLIED' });
    expect((await getOrder(order.id)).status).toBe('PAID');

    await changeStatus(sellerA, subA.id, 'ACCEPTED').expect(200);
    const shipped = await changeStatus(sellerA, subA.id, 'SHIPPED').expect(200);
    expect((shipped.body as SubOrderBody).status).toBe('SHIPPED');
    await changeStatus(sellerA, subA.id, 'ACCEPTED').expect(409);
    await changeStatus(sellerA, subA.id, 'DELIVERED').expect(200);

    // Ownership is enforced by the query, so foreign resources look missing.
    await request(server())
      .get(`/sub-orders/${subA.id}`)
      .auth(sellerB.token, { type: 'bearer' })
      .expect(404);
    await changeStatus(sellerB, subA.id, 'CANCELLED').expect(404);
    await request(server())
      .get(`/orders/${order.id}`)
      .auth(otherBuyer.token, { type: 'bearer' })
      .expect(404);

    expect((await getOrder(order.id)).status).toBe('PAID');
    await changeStatus(sellerB, subB.id, 'CANCELLED').expect(200);

    const completed = await getOrder(order.id);
    expect(completed.status).toBe('COMPLETED');
    expect(subOrderOf(completed, sellerA).status).toBe('DELIVERED');
    expect(subOrderOf(completed, sellerB).status).toBe('CANCELLED');

    const transition = (subOrderId: string, from: string, to: string) => ({
      type: 'SubOrderStatusChanged',
      orderId: order.id,
      subOrderId,
      from,
      to,
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'OrderCreated',
        orderId: order.id,
        total: 44.5,
      }),
      { type: 'OrderPaid', orderId: order.id, paymentReference },
      expect.objectContaining(transition(subA.id, 'PENDING', 'ACCEPTED')),
      expect.objectContaining(transition(subA.id, 'ACCEPTED', 'SHIPPED')),
      expect.objectContaining(transition(subA.id, 'SHIPPED', 'DELIVERED')),
      expect.objectContaining(transition(subB.id, 'PENDING', 'CANCELLED')),
      { type: 'OrderCompleted', orderId: order.id },
    ]);
  });

  it('cancels a pending order together with its suborders', async () => {
    const order = await placeOrder();

    const res = await request(server())
      .post(`/orders/${order.id}/cancel`)
      .auth(buyer.token, { type: 'bearer' })
      .expect(200);
    const cancelled = res.body as OrderBody;
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.subOrders.map((s) => s.status)).toEqual([
      'CANCELLED',
      'CANCELLED',
    ]);
    expect(events.map((e) => e.type)).toEqual([
      'OrderCreated',
      'OrderCancelled',
    ]);

    await request(server())
      .post(`/orders/${order.id}/cancel`)
      .auth(buyer.token, { type: 'bearer' })
      .expect(409);
  });
});
