import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOperator,
  QueryFailedError,
} from 'typeorm';
import { EVENT_PUBLISHER } from '../../events/application/ports/event-publisher';
import { PAYMENT_PROVIDER } from '../../payments/application/ports/payment-provider';
import { PaymentStatus } from '../../payments/domain/payment-status.enum';
import {
  ONE_PENDING_PAYMENT_PER_ORDER,
  Payment,
} from '../../payments/domain/payment.entity';
import { Product } from '../../products/domain/product.entity';
import { User } from '../../users/domain/user.entity';
import { OrderStatus } from '../domain/order-status.enum';
import { Order } from '../domain/order.entity';
import { OrdersService } from './orders.service';
import { SubOrderStatus } from '../domain/sub-order-status.enum';
import { SubOrder } from '../domain/sub-order.entity';

describe('OrdersService', () => {
  let service: OrdersService;

  const sellerA = 'seller-a';
  const sellerB = 'seller-b';
  const products = [
    { id: 'p-1', name: 'Coffee', price: 0.99, sellerId: sellerA },
    { id: 'p-2', name: 'Tea', price: 3.5, sellerId: sellerA },
    { id: 'p-3', name: 'Mug', price: 0.33, sellerId: sellerB },
  ] as Product[];
  const sellers = [
    { id: sellerA, commissionRate: 5 },
    { id: sellerB, commissionRate: 15 },
  ] as User[];

  const manager = {
    // Emulates the In(ids) filter so only the requested rows come back.
    find: jest.fn(
      (entity: unknown, { where }: { where: { id: FindOperator<string[]> } }) =>
        Promise.resolve(
          (entity === Product ? products : sellers).filter((row) =>
            where.id.value.includes(row.id),
          ),
        ),
    ),
    create: jest.fn((_entity: unknown, data: object) => data),
    save: jest.fn((order: Partial<Order>) =>
      Promise.resolve({ ...order, id: 'order-1' }),
    ),
    findOneOrFail: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  // Records commits and publications in order, to prove events wait for the commit.
  let timeline: string[];
  let affected: number;
  const queryBuilder = {
    update: jest.fn<unknown, [unknown]>().mockReturnThis(),
    set: jest.fn<unknown, [unknown]>().mockReturnThis(),
    where: jest.fn<unknown, [unknown]>().mockReturnThis(),
    execute: jest.fn(() => Promise.resolve({ affected })),
  };
  const dataSource = {
    manager,
    transaction: jest.fn(
      async (work: (m: EntityManager) => Promise<unknown>) => {
        const result = await work(manager as unknown as EntityManager);
        timeline.push('commit');
        return result;
      },
    ),
  };
  const ordersRepository = { find: jest.fn(), findOne: jest.fn() };
  const payments = {
    createPayment: jest.fn(() => Promise.resolve({ reference: 'fake-ref' })),
  };
  const paymentsRepository = {
    find: jest.fn(),
    create: jest.fn((data: Partial<Payment>) => data),
    save: jest.fn((payment: Partial<Payment>) =>
      Promise.resolve({ ...payment, id: 'payment-1' }),
    ),
    findOneByOrFail: jest.fn(),
  };
  const events = {
    publish: jest.fn((event: { type: string }) => {
      timeline.push(event.type);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    timeline = [];
    affected = 1;
    manager.createQueryBuilder.mockReturnValue(queryBuilder);
    manager.findOneOrFail.mockImplementation(() =>
      Promise.resolve({ id: 'order-1', subOrders: [] }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: ordersRepository },
        {
          provide: getRepositoryToken(Payment),
          useValue: paymentsRepository,
        },
        { provide: PAYMENT_PROVIDER, useValue: payments },
        { provide: EVENT_PUBLISHER, useValue: events },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  function savedOrder(): Order {
    return manager.save.mock.calls[0][0] as Order;
  }

  describe('create', () => {
    it('splits a cart with two sellers into one suborder per seller', async () => {
      await service.create('buyer-1', {
        items: [
          { productId: 'p-1', quantity: 1 },
          { productId: 'p-3', quantity: 1 },
          { productId: 'p-2', quantity: 2 },
        ],
      });

      const order = savedOrder();
      expect(order.buyerId).toBe('buyer-1');
      expect(order.subOrders).toHaveLength(2);
      const bySeller = new Map(order.subOrders.map((s) => [s.sellerId, s]));
      expect(bySeller.get(sellerA)!.items).toHaveLength(2);
      expect(bySeller.get(sellerB)!.items).toHaveLength(1);
    });

    it('snapshots product name and unit price into each item', async () => {
      await service.create('buyer-1', {
        items: [{ productId: 'p-2', quantity: 3 }],
      });

      const [subOrder] = savedOrder().subOrders;
      expect(subOrder.items[0]).toEqual({
        productId: 'p-2',
        productName: 'Tea',
        unitPrice: 3.5,
        quantity: 3,
        subtotal: 10.5,
      });
    });

    it('applies each seller own commission rate rounding to the cent', async () => {
      await service.create('buyer-1', {
        items: [
          { productId: 'p-1', quantity: 1 },
          { productId: 'p-3', quantity: 1 },
        ],
      });

      const bySeller = new Map(
        savedOrder().subOrders.map((s): [string, SubOrder] => [s.sellerId, s]),
      );
      // 5% of 0.99 = 0.0495 -> 0.05
      expect(bySeller.get(sellerA)).toMatchObject({
        subtotal: 0.99,
        commissionRate: 5,
        commissionAmount: 0.05,
        sellerNet: 0.94,
      });
      // 15% of 0.33 = 0.0495 -> 0.05
      expect(bySeller.get(sellerB)).toMatchObject({
        subtotal: 0.33,
        commissionRate: 15,
        commissionAmount: 0.05,
        sellerNet: 0.28,
      });
    });

    it('merges duplicated product ids by summing quantities', async () => {
      await service.create('buyer-1', {
        items: [
          { productId: 'p-1', quantity: 2 },
          { productId: 'p-1', quantity: 3 },
        ],
      });

      const [subOrder] = savedOrder().subOrders;
      expect(subOrder.items).toHaveLength(1);
      expect(subOrder.items[0]).toMatchObject({ quantity: 5, subtotal: 4.95 });
    });

    it('sets the order total to the sum of suborder subtotals', async () => {
      await service.create('buyer-1', {
        items: [
          { productId: 'p-1', quantity: 3 },
          { productId: 'p-2', quantity: 1 },
          { productId: 'p-3', quantity: 3 },
        ],
      });

      const order = savedOrder();
      // 2.97 + 3.50 + 0.99
      expect(order.total).toBe(7.46);
      const sum = order.subOrders.reduce((acc, s) => acc + s.subtotal * 100, 0);
      expect(Math.round(sum)).toBe(746);
    });

    it('throws NotFound listing the missing product ids', async () => {
      const create = service.create('buyer-1', {
        items: [
          { productId: 'p-1', quantity: 1 },
          { productId: 'p-404', quantity: 1 },
        ],
      });

      await expect(create).rejects.toBeInstanceOf(NotFoundException);
      await expect(create).rejects.toThrow('p-404');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('runs every query inside one transaction', async () => {
      const result = await service.create('buyer-1', {
        items: [{ productId: 'p-1', quantity: 1 }],
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.find).toHaveBeenCalledTimes(2);
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.findOneOrFail).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({ where: { id: 'order-1' } }),
      );
      expect(result).toEqual({ id: 'order-1', subOrders: [] });
    });

    it('publishes OrderCreated only after the transaction commits', async () => {
      manager.findOneOrFail.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        total: 0.99,
        subOrders: [{ id: 'sub-1' }],
      });

      await service.create('buyer-1', {
        items: [{ productId: 'p-1', quantity: 1 }],
      });

      expect(timeline).toEqual(['commit', 'OrderCreated']);
      expect(events.publish).toHaveBeenCalledWith({
        type: 'OrderCreated',
        orderId: 'order-1',
        buyerId: 'buyer-1',
        total: 0.99,
        subOrderIds: ['sub-1'],
      });
    });

    it('publishes nothing when the transaction fails', async () => {
      await expect(
        service.create('buyer-1', {
          items: [{ productId: 'p-404', quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(events.publish).not.toHaveBeenCalled();
    });
  });

  function updates(): { entity: unknown; set: unknown; where: unknown }[] {
    return queryBuilder.update.mock.calls.map(([entity], i) => ({
      entity,
      set: queryBuilder.set.mock.calls[i][0],
      where: queryBuilder.where.mock.calls[i][0],
    }));
  }

  describe('pay', () => {
    let order: Order;
    let existing: Partial<Payment>[];

    beforeEach(() => {
      order = {
        id: 'order-1',
        buyerId: 'buyer-1',
        status: OrderStatus.PENDING,
        total: 12.5,
      } as Order;
      existing = [];
      ordersRepository.findOne.mockImplementation(
        ({ where }: { where: { id: string; buyerId: string } }) =>
          Promise.resolve(
            where.id === order.id && where.buyerId === order.buyerId
              ? order
              : null,
          ),
      );
      paymentsRepository.find.mockImplementation(() =>
        Promise.resolve(existing),
      );
    });

    it('creates a pending payment for the order total without marking it paid', async () => {
      await expect(service.pay('order-1', 'buyer-1')).resolves.toEqual({
        paymentReference: 'fake-ref',
        status: PaymentStatus.PENDING,
        amount: 12.5,
      });

      expect(payments.createPayment).toHaveBeenCalledWith({
        orderId: 'order-1',
        amount: 12.5,
      });
      expect(paymentsRepository.save).toHaveBeenCalledWith({
        orderId: 'order-1',
        reference: 'fake-ref',
        amount: 12.5,
        status: PaymentStatus.PENDING,
      });
      expect(queryBuilder.execute).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('returns the existing pending payment instead of creating another', async () => {
      existing = [
        { reference: 'fake-old', status: PaymentStatus.PENDING, amount: 12.5 },
      ];

      await expect(service.pay('order-1', 'buyer-1')).resolves.toEqual({
        paymentReference: 'fake-old',
        status: PaymentStatus.PENDING,
        amount: 12.5,
      });
      expect(payments.createPayment).not.toHaveBeenCalled();
      expect(paymentsRepository.save).not.toHaveBeenCalled();
    });

    it('returns 409 when the order already has an approved payment', async () => {
      existing = [{ reference: 'fake-old', status: PaymentStatus.APPROVED }];

      await expect(service.pay('order-1', 'buyer-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(payments.createPayment).not.toHaveBeenCalled();
    });

    it('only looks for pending or approved payments, so a rejected one allows a new payment', async () => {
      await service.pay('order-1', 'buyer-1');

      const [{ where }] = paymentsRepository.find.mock.calls[0] as [
        { where: { orderId: string; status: FindOperator<string[]> } },
      ];
      expect(where.orderId).toBe('order-1');
      expect(where.status.value).toEqual([
        PaymentStatus.PENDING,
        PaymentStatus.APPROVED,
      ]);
      expect(payments.createPayment).toHaveBeenCalledTimes(1);
    });

    it('returns the payment stored by a concurrent request that won the race', async () => {
      paymentsRepository.save.mockRejectedValueOnce(
        new QueryFailedError('INSERT', [], {
          code: '23505',
          constraint: ONE_PENDING_PAYMENT_PER_ORDER,
        } as unknown as Error),
      );
      paymentsRepository.findOneByOrFail.mockResolvedValue({
        reference: 'fake-winner',
        status: PaymentStatus.PENDING,
        amount: 12.5,
      });

      await expect(service.pay('order-1', 'buyer-1')).resolves.toMatchObject({
        paymentReference: 'fake-winner',
      });
    });

    it('returns 404 for an order of another buyer', async () => {
      await expect(service.pay('order-1', 'buyer-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(payments.createPayment).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.PAID, OrderStatus.COMPLETED, OrderStatus.CANCELLED])(
      'returns 409 without creating a payment for an order that is %s',
      async (status) => {
        order.status = status;

        await expect(service.pay('order-1', 'buyer-1')).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(payments.createPayment).not.toHaveBeenCalled();
        expect(paymentsRepository.save).not.toHaveBeenCalled();
      },
    );
  });

  describe('cancel', () => {
    let order: Order;

    beforeEach(() => {
      order = {
        id: 'order-1',
        buyerId: 'buyer-1',
        status: OrderStatus.PENDING,
      } as Order;
      manager.findOne.mockImplementation(
        (
          _entity: unknown,
          { where }: { where: { id: string; buyerId: string } },
        ) =>
          Promise.resolve(
            where.id === order.id && where.buyerId === order.buyerId
              ? order
              : null,
          ),
      );
      ordersRepository.findOne.mockResolvedValue(order);
    });

    it('cancels the order and its pending suborders in one transaction', async () => {
      await service.cancel('order-1', 'buyer-1');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(updates()).toEqual([
        {
          entity: Order,
          set: { status: OrderStatus.CANCELLED },
          where: { id: 'order-1', status: OrderStatus.PENDING },
        },
        {
          entity: SubOrder,
          set: { status: SubOrderStatus.CANCELLED },
          where: { orderId: 'order-1', status: SubOrderStatus.PENDING },
        },
      ]);
      expect(timeline).toEqual(['commit', 'OrderCancelled']);
    });

    it('returns 404 for an order of another buyer', async () => {
      await expect(service.cancel('order-1', 'buyer-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(queryBuilder.execute).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.PAID, OrderStatus.COMPLETED, OrderStatus.CANCELLED])(
      'returns 409 for an order that is %s',
      async (status) => {
        order.status = status;

        await expect(
          service.cancel('order-1', 'buyer-1'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(queryBuilder.execute).not.toHaveBeenCalled();
        expect(events.publish).not.toHaveBeenCalled();
      },
    );
  });

  describe('buyer read access', () => {
    const order = { id: 'order-1', buyerId: 'buyer-1' } as Order;

    beforeEach(() => {
      ordersRepository.findOne.mockImplementation(
        ({ where }: { where: { id: string; buyerId: string } }) =>
          Promise.resolve(
            where.id === order.id && where.buyerId === order.buyerId
              ? order
              : null,
          ),
      );
    });

    it('returns the order to its buyer', async () => {
      await expect(service.findOneForBuyer('order-1', 'buyer-1')).resolves.toBe(
        order,
      );
    });

    it('returns 404 for an order of another buyer', async () => {
      await expect(
        service.findOneForBuyer('order-1', 'buyer-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists only the buyer orders, newest first', async () => {
      ordersRepository.find.mockResolvedValue([order]);

      await service.findAllForBuyer('buyer-1');

      expect(ordersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerId: 'buyer-1' },
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });
});
