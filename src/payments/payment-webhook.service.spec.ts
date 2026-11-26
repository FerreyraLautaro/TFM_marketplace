import {
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { EVENT_PUBLISHER } from '../events/event-publisher';
import { OrderStatus } from '../orders/order-status.enum';
import { Order } from '../orders/order.entity';
import { PaymentStatus } from './payment-status.enum';
import { PaymentWebhookService } from './payment-webhook.service';
import { Payment } from './payment.entity';
import { ProcessedWebhookEvent } from './processed-webhook-event.entity';
import { WebhookOutcome } from './webhook-outcome.enum';
import { signWebhookBody } from './webhook-signature';

describe('PaymentWebhookService', () => {
  const secret = 'unit-test-webhook-secret-0123456789abcdef';
  let service: PaymentWebhookService;

  let payment: Payment | null;
  let order: Order;
  let alreadyProcessed: boolean;
  let affected: number;
  let timeline: string[];
  let logError: jest.SpyInstance;

  const queryBuilder = {
    update: jest.fn<unknown, [unknown]>().mockReturnThis(),
    set: jest.fn<unknown, [unknown]>().mockReturnThis(),
    where: jest.fn<unknown, [unknown]>().mockReturnThis(),
    execute: jest.fn(() => Promise.resolve({ affected })),
  };
  const manager = {
    query: jest.fn(() =>
      Promise.resolve(alreadyProcessed ? [] : [{ eventId: 'evt-1' }]),
    ),
    findOne: jest.fn(() => Promise.resolve(payment)),
    findOneOrFail: jest.fn(() => Promise.resolve(order)),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  // Records commits and publications in order, to prove events wait for the commit.
  const dataSource = {
    transaction: jest.fn(
      async (work: (m: EntityManager) => Promise<unknown>) => {
        const result = await work(manager as unknown as EntityManager);
        timeline.push('commit');
        return result;
      },
    ),
  };
  const events = {
    publish: jest.fn((event: { type: string }) => {
      timeline.push(event.type);
    }),
  };
  const config = { get: jest.fn(() => secret) };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    timeline = [];
    alreadyProcessed = false;
    affected = 1;
    payment = {
      id: 'payment-1',
      orderId: 'order-1',
      reference: 'fake-ref',
      status: PaymentStatus.PENDING,
    } as Payment;
    order = { id: 'order-1', status: OrderStatus.PENDING } as Order;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentWebhookService,
        { provide: DataSource, useValue: dataSource },
        { provide: EVENT_PUBLISHER, useValue: events },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(PaymentWebhookService);
  });

  afterEach(() => jest.restoreAllMocks());

  function deliver(
    status: string,
    overrides: Record<string, unknown> = {},
  ): Promise<unknown> {
    const body = Buffer.from(
      JSON.stringify({
        eventId: 'evt-1',
        type: 'payment.updated',
        data: { reference: 'fake-ref', status },
        ...overrides,
      }),
    );
    return service.handle(body, signWebhookBody(body, secret));
  }

  function updates(): { entity: unknown; criteria: unknown; set: unknown }[] {
    const viaManager = manager.update.mock.calls.map((call: unknown[]) => ({
      entity: call[0],
      criteria: call[1],
      set: call[2],
    }));
    const viaBuilder = queryBuilder.update.mock.calls.map(([entity], i) => ({
      entity,
      criteria: queryBuilder.where.mock.calls[i][0],
      set: queryBuilder.set.mock.calls[i][0],
    }));
    return [...viaManager, ...viaBuilder];
  }

  describe('signature', () => {
    it('rejects a missing signature with 401 before touching the database', async () => {
      const body = Buffer.from('{"eventId":"evt-1"}');

      await expect(service.handle(body, undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a body signed with another secret', async () => {
      const body = Buffer.from('{"eventId":"evt-1"}');
      const signature = signWebhookBody(body, 'x'.repeat(40));

      await expect(service.handle(body, signature)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a request without a raw body', async () => {
      await expect(
        service.handle(undefined, 'sha256=abc'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns 400 for a correctly signed but invalid event', async () => {
      await expect(deliver('REFUNDED')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        deliver('APPROVED', { type: 'payment.created' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('returns 400 for a correctly signed body that is not JSON', async () => {
      const body = Buffer.from('not json');

      await expect(
        service.handle(body, signWebhookBody(body, secret)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('claims the event id with an insert that ignores conflicts', async () => {
    await deliver('APPROVED');

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT ("eventId") DO NOTHING'),
      ['evt-1', 'fake-ref', WebhookOutcome.RECEIVED],
    );
  });

  it('answers duplicate and changes nothing for an event already processed', async () => {
    alreadyProcessed = true;

    await expect(deliver('APPROVED')).resolves.toEqual({
      status: 'duplicate',
    });
    expect(manager.findOne).not.toHaveBeenCalled();
    expect(updates()).toEqual([]);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('ignores an unknown payment reference with 200 and records why', async () => {
    payment = null;

    await expect(deliver('APPROVED')).resolves.toEqual({ status: 'ignored' });
    expect(updates()).toEqual([
      {
        entity: ProcessedWebhookEvent,
        criteria: { eventId: 'evt-1' },
        set: { outcome: WebhookOutcome.IGNORED_UNKNOWN_PAYMENT },
      },
    ]);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('approves the payment, marks the order paid and publishes OrderPaid after commit', async () => {
    await expect(deliver('APPROVED')).resolves.toEqual({
      status: 'processed',
      outcome: WebhookOutcome.APPLIED,
    });

    expect(manager.findOne).toHaveBeenCalledWith(Payment, {
      where: { reference: 'fake-ref' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(updates()).toEqual([
      {
        entity: Payment,
        criteria: { id: 'payment-1' },
        set: { status: PaymentStatus.APPROVED },
      },
      {
        entity: ProcessedWebhookEvent,
        criteria: { eventId: 'evt-1' },
        set: { outcome: WebhookOutcome.APPLIED },
      },
      {
        entity: Order,
        criteria: { id: 'order-1', status: OrderStatus.PENDING },
        set: { status: OrderStatus.PAID },
      },
    ]);
    expect(timeline).toEqual(['commit', 'OrderPaid']);
    expect(events.publish).toHaveBeenCalledWith({
      type: 'OrderPaid',
      orderId: 'order-1',
      paymentReference: 'fake-ref',
    });
  });

  it('publishes nothing when the transaction fails', async () => {
    affected = 0;

    await expect(deliver('APPROVED')).rejects.toBeInstanceOf(ConflictException);
    expect(timeline).toEqual([]);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('rejects the payment and leaves the order pending so it can be paid again', async () => {
    await expect(deliver('REJECTED')).resolves.toEqual({
      status: 'processed',
      outcome: WebhookOutcome.APPLIED,
    });

    expect(updates()).toEqual([
      {
        entity: Payment,
        criteria: { id: 'payment-1' },
        set: { status: PaymentStatus.REJECTED },
      },
      {
        entity: ProcessedWebhookEvent,
        criteria: { eventId: 'evt-1' },
        set: { outcome: WebhookOutcome.APPLIED },
      },
    ]);
    expect(manager.findOneOrFail).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('flags a refund when the order was cancelled before the approval arrived', async () => {
    order.status = OrderStatus.CANCELLED;

    await expect(deliver('APPROVED')).resolves.toEqual({
      status: 'processed',
      outcome: WebhookOutcome.REFUND_REQUIRED,
    });

    expect(updates()).toEqual([
      {
        entity: Payment,
        criteria: { id: 'payment-1' },
        set: { status: PaymentStatus.APPROVED },
      },
      {
        entity: ProcessedWebhookEvent,
        criteria: { eventId: 'evt-1' },
        set: { outcome: WebhookOutcome.REFUND_REQUIRED },
      },
    ]);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('refund required'),
    );
    expect(events.publish).not.toHaveBeenCalled();
  });

  it.each([PaymentStatus.APPROVED, PaymentStatus.REJECTED])(
    'ignores a new event for a payment already %s',
    async (status) => {
      payment!.status = status;

      await expect(deliver('APPROVED')).resolves.toEqual({
        status: 'processed',
        outcome: WebhookOutcome.IGNORED_ALREADY_FINAL,
      });
      expect(updates()).toEqual([
        {
          entity: ProcessedWebhookEvent,
          criteria: { eventId: 'evt-1' },
          set: { outcome: WebhookOutcome.IGNORED_ALREADY_FINAL },
        },
      ]);
      expect(events.publish).not.toHaveBeenCalled();
    },
  );
});
