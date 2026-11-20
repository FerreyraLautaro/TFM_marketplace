import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOperator } from 'typeorm';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { Order } from './order.entity';
import { OrdersService } from './orders.service';
import { SubOrder } from './sub-order.entity';

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
  };
  const dataSource = {
    transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    ),
  };
  const ordersRepository = { find: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: ordersRepository },
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
      manager.findOneOrFail.mockResolvedValue({ id: 'order-1' });

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
      expect(result).toEqual({ id: 'order-1' });
    });
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
