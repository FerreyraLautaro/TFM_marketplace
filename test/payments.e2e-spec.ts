import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from '../src/events/application/ports/event-publisher';
import { OrderEvent } from '../src/orders/domain/order.events';
import { Payment } from '../src/payments/domain/payment.entity';
import { ProcessedWebhookEvent } from '../src/payments/domain/processed-webhook-event.entity';
import { signWebhookBody } from '../src/payments/infrastructure/webhook-signature';
import { UserRole } from '../src/users/domain/user-role.enum';
import { Actor, registerActor } from './utils/actors';
import { createE2eApp, resetDatabase } from './utils/e2e-app';
import { TEST_WEBHOOK_SECRET } from './utils/webhook-secret';

interface PaymentBody {
  paymentReference: string;
  status: string;
  amount: number;
}

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  const paidEvents: OrderEvent[] = [];
  let buyer: Actor;
  let otherBuyer: Actor;
  let orderId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    app
      .get<EventPublisher>(EVENT_PUBLISHER)
      .subscribe<OrderEvent>('OrderPaid', (event) => {
        paidEvents.push(event);
      });
  });

  beforeEach(async () => {
    await resetDatabase(app);
    paidEvents.length = 0;

    buyer = await registerActor(app, 'buyer@example.com', UserRole.BUYER);
    otherBuyer = await registerActor(
      app,
      'other-buyer@example.com',
      UserRole.BUYER,
    );
    const seller = await registerActor(
      app,
      'seller@example.com',
      UserRole.SELLER,
    );
    const product = await request(server())
      .post('/products')
      .auth(seller.token, { type: 'bearer' })
      .send({ name: 'Olive oil', price: 10.5 })
      .expect(201);
    const order = await request(server())
      .post('/orders')
      .auth(buyer.token, { type: 'bearer' })
      .send({
        items: [
          { productId: (product.body as { id: string }).id, quantity: 2 },
        ],
      })
      .expect(201);
    orderId = (order.body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function pay(): Promise<PaymentBody> {
    const res = await request(server())
      .post(`/orders/${orderId}/pay`)
      .auth(buyer.token, { type: 'bearer' })
      .expect(201);
    return res.body as PaymentBody;
  }

  async function orderStatus(): Promise<string> {
    const res = await request(server())
      .get(`/orders/${orderId}`)
      .auth(buyer.token, { type: 'bearer' })
      .expect(200);
    return (res.body as { status: string }).status;
  }

  function paymentEvent(eventId: string, reference: string, status: string) {
    // Pretty-printed on purpose: the signature covers these exact bytes.
    return JSON.stringify(
      { eventId, type: 'payment.updated', data: { reference, status } },
      null,
      2,
    );
  }

  function postWebhook(body: string, signature?: string) {
    const req = request(server())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json');
    if (signature !== undefined) {
      req.set('x-signature', signature);
    }
    return req.send(body);
  }

  function signed(body: string) {
    return postWebhook(body, signWebhookBody(body, TEST_WEBHOOK_SECRET));
  }

  function simulate(reference: string, as: Actor, body: object) {
    return request(server())
      .post(`/payments/${reference}/simulate`)
      .auth(as.token, { type: 'bearer' })
      .send(body);
  }

  const payments = () => app.get(DataSource).getRepository(Payment);
  const processedEvents = () =>
    app.get(DataSource).getRepository(ProcessedWebhookEvent);

  it('returns the same pending payment when paying twice', async () => {
    const first = await pay();
    const second = await pay();

    expect(first).toEqual({
      paymentReference: expect.stringMatching(/^fake-/) as string,
      status: 'PENDING',
      amount: 21,
    });
    expect(second.paymentReference).toBe(first.paymentReference);
    expect(await payments().count()).toBe(1);
    expect(await orderStatus()).toBe('PENDING');
  });

  it('marks the order paid once and ignores the redelivered event', async () => {
    const { paymentReference } = await pay();
    const body = paymentEvent('evt-approved', paymentReference, 'APPROVED');

    await signed(body).expect(200, { status: 'processed', outcome: 'APPLIED' });
    expect(await orderStatus()).toBe('PAID');

    await signed(body).expect(200, { status: 'duplicate' });
    expect(await orderStatus()).toBe('PAID');
    expect(paidEvents).toEqual([
      { type: 'OrderPaid', orderId, paymentReference },
    ]);
    expect(await processedEvents().find()).toEqual([
      expect.objectContaining({
        eventId: 'evt-approved',
        paymentReference,
        outcome: 'APPLIED',
      }),
    ]);
    await expect(
      payments().findOneByOrFail({ reference: paymentReference }),
    ).resolves.toMatchObject({ status: 'APPROVED' });

    // A new event for a payment that is already final changes nothing either.
    await signed(paymentEvent('evt-late', paymentReference, 'REJECTED')).expect(
      200,
      { status: 'processed', outcome: 'IGNORED_ALREADY_FINAL' },
    );
    await request(server())
      .post(`/orders/${orderId}/pay`)
      .auth(buyer.token, { type: 'bearer' })
      .expect(409);
  });

  it('rejects a missing or wrong signature with 401 and records nothing', async () => {
    const { paymentReference } = await pay();
    const body = paymentEvent('evt-forged', paymentReference, 'APPROVED');

    await postWebhook(body).expect(401);
    await postWebhook(body, signWebhookBody(body, 'x'.repeat(40))).expect(401);
    // Signed for different bytes than the ones sent.
    await postWebhook(
      body,
      signWebhookBody(JSON.stringify(JSON.parse(body)), TEST_WEBHOOK_SECRET),
    ).expect(401);

    expect(await processedEvents().count()).toBe(0);
    expect(await orderStatus()).toBe('PENDING');
  });

  it('returns 400 for a correctly signed but invalid event', async () => {
    const body = JSON.stringify({
      eventId: 'evt-bad',
      type: 'payment.updated',
    });

    await signed(body).expect(400);
    expect(await processedEvents().count()).toBe(0);
  });

  it('acknowledges an unknown payment reference without retries', async () => {
    await signed(
      paymentEvent('evt-unknown', 'fake-missing', 'APPROVED'),
    ).expect(200, { status: 'ignored' });
    await expect(
      processedEvents().findOneByOrFail({ eventId: 'evt-unknown' }),
    ).resolves.toMatchObject({ outcome: 'IGNORED_UNKNOWN_PAYMENT' });
  });

  it('keeps the order pending after a rejection and lets the buyer pay again', async () => {
    const rejected = await pay();

    await simulate(rejected.paymentReference, buyer, {
      status: 'REJECTED',
    }).expect(200, { status: 'processed', outcome: 'APPLIED' });
    expect(await orderStatus()).toBe('PENDING');

    const retry = await pay();
    expect(retry.paymentReference).not.toBe(rejected.paymentReference);
    expect(retry.status).toBe('PENDING');

    await simulate(retry.paymentReference, buyer, {
      status: 'APPROVED',
    }).expect(200);
    expect(await orderStatus()).toBe('PAID');
    expect(paidEvents).toEqual([
      {
        type: 'OrderPaid',
        orderId,
        paymentReference: retry.paymentReference,
      },
    ]);
  });

  it('resends the same simulated event as a duplicate', async () => {
    const { paymentReference } = await pay();
    const body = { status: 'APPROVED', eventId: 'evt-demo' };

    await simulate(paymentReference, buyer, body).expect(200, {
      status: 'processed',
      outcome: 'APPLIED',
    });
    await simulate(paymentReference, buyer, body).expect(200, {
      status: 'duplicate',
    });
    expect(paidEvents).toHaveLength(1);
  });

  it('hides another buyer payment from the simulated checkout', async () => {
    const { paymentReference } = await pay();

    await simulate(paymentReference, otherBuyer, { status: 'APPROVED' }).expect(
      404,
    );
    await simulate('fake-missing', buyer, { status: 'APPROVED' }).expect(404);
    expect(await orderStatus()).toBe('PENDING');
  });

  it('flags a refund when the approval arrives after the order was cancelled', async () => {
    const { paymentReference } = await pay();
    await request(server())
      .post(`/orders/${orderId}/cancel`)
      .auth(buyer.token, { type: 'bearer' })
      .expect(200);

    await simulate(paymentReference, buyer, { status: 'APPROVED' }).expect(
      200,
      { status: 'processed', outcome: 'REFUND_REQUIRED' },
    );
    expect(await orderStatus()).toBe('CANCELLED');
    await expect(
      payments().findOneByOrFail({ reference: paymentReference }),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    expect(paidEvents).toEqual([]);
  });
});
