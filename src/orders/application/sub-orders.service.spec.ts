import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EVENT_PUBLISHER } from '../../events/application/ports/event-publisher';
import { OrderStatus } from '../domain/order-status.enum';
import { Order } from '../domain/order.entity';
import { SubOrderStatus } from '../domain/sub-order-status.enum';
import { SubOrder } from '../domain/sub-order.entity';
import { SubOrdersService } from './sub-orders.service';

describe('SubOrdersService', () => {
  let service: SubOrdersService;
  const subOrder = { id: 'sub-1', sellerId: 'seller-a' } as SubOrder;
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(({ where }: { where: { id: string; sellerId: string } }) =>
      Promise.resolve(
        where.id === subOrder.id && where.sellerId === subOrder.sellerId
          ? subOrder
          : null,
      ),
    ),
  };

  // Records commits and publications in order, to prove events wait for the commit.
  let timeline: string[];
  let current: SubOrder;
  let order: Order;
  let siblings: SubOrderStatus[];
  let affected: number;

  const queryBuilder = {
    update: jest.fn<unknown, [unknown]>().mockReturnThis(),
    set: jest.fn<unknown, [unknown]>().mockReturnThis(),
    where: jest.fn<unknown, [unknown]>().mockReturnThis(),
    execute: jest.fn(() => Promise.resolve({ affected })),
  };
  const manager = {
    findOne: jest.fn(
      (
        _entity: unknown,
        { where }: { where: { id: string; sellerId: string } },
      ) =>
        Promise.resolve(
          where.id === current.id && where.sellerId === current.sellerId
            ? current
            : null,
        ),
    ),
    findOneOrFail: jest.fn((entity: unknown) =>
      Promise.resolve(entity === Order ? order : { ...current, items: [] }),
    ),
    find: jest.fn(() =>
      Promise.resolve(siblings.map((status) => ({ status }))),
    ),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
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

  beforeEach(async () => {
    jest.clearAllMocks();
    timeline = [];
    current = {
      id: 'sub-1',
      orderId: 'order-1',
      sellerId: 'seller-a',
      status: SubOrderStatus.PENDING,
    } as SubOrder;
    order = { id: 'order-1', status: OrderStatus.PAID } as Order;
    siblings = [SubOrderStatus.ACCEPTED, SubOrderStatus.PENDING];
    affected = 1;

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubOrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(SubOrder), useValue: repository },
        { provide: EVENT_PUBLISHER, useValue: events },
      ],
    }).compile();
    service = moduleRef.get(SubOrdersService);
  });

  function updates(): { entity: unknown; set: unknown; where: unknown }[] {
    return queryBuilder.update.mock.calls.map(([entity], i) => ({
      entity,
      set: queryBuilder.set.mock.calls[i][0],
      where: queryBuilder.where.mock.calls[i][0],
    }));
  }

  describe('seller read access', () => {
    it('returns the suborder to its seller', async () => {
      await expect(service.findOneForSeller('sub-1', 'seller-a')).resolves.toBe(
        subOrder,
      );
    });

    it('returns 404 for a suborder of another seller', async () => {
      await expect(
        service.findOneForSeller('sub-1', 'seller-b'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists only the seller suborders, newest first', async () => {
      repository.find.mockResolvedValue([subOrder]);

      await service.findAllForSeller('seller-a');

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sellerId: 'seller-a' },
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('changeStatus', () => {
    it('accepts a pending suborder of a paid order with a conditional update', async () => {
      const result = await service.changeStatus(
        'sub-1',
        'seller-a',
        SubOrderStatus.ACCEPTED,
      );

      expect(updates()).toEqual([
        {
          entity: SubOrder,
          set: { status: SubOrderStatus.ACCEPTED },
          where: { id: 'sub-1', status: SubOrderStatus.PENDING },
        },
      ]);
      expect(manager.findOneOrFail).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(events.publish).toHaveBeenCalledWith({
        type: 'SubOrderStatusChanged',
        subOrderId: 'sub-1',
        orderId: 'order-1',
        sellerId: 'seller-a',
        from: SubOrderStatus.PENDING,
        to: SubOrderStatus.ACCEPTED,
      });
      expect(result).toMatchObject({ id: 'sub-1', items: [] });
    });

    it('returns 404 for a suborder of another seller', async () => {
      await expect(
        service.changeStatus('sub-1', 'seller-b', SubOrderStatus.ACCEPTED),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(queryBuilder.execute).not.toHaveBeenCalled();
    });

    it('rejects a transition not allowed from the current status', async () => {
      current.status = SubOrderStatus.SHIPPED;

      const change = service.changeStatus(
        'sub-1',
        'seller-a',
        SubOrderStatus.ACCEPTED,
      );

      await expect(change).rejects.toBeInstanceOf(ConflictException);
      await expect(change).rejects.toThrow(
        'Cannot change sub-order from SHIPPED to ACCEPTED',
      );
      expect(queryBuilder.execute).not.toHaveBeenCalled();
    });

    it('rejects accepting a suborder whose order is not paid', async () => {
      order.status = OrderStatus.PENDING;

      const change = service.changeStatus(
        'sub-1',
        'seller-a',
        SubOrderStatus.ACCEPTED,
      );

      await expect(change).rejects.toBeInstanceOf(ConflictException);
      await expect(change).rejects.toThrow('Order is not paid');
      expect(queryBuilder.execute).not.toHaveBeenCalled();
    });

    it('lets a seller cancel a pending suborder of an unpaid order', async () => {
      order.status = OrderStatus.PENDING;
      siblings = [SubOrderStatus.CANCELLED, SubOrderStatus.PENDING];

      await service.changeStatus('sub-1', 'seller-a', SubOrderStatus.CANCELLED);

      expect(updates()).toHaveLength(1);
    });

    it('returns 409 and publishes nothing when the conditional update loses a race', async () => {
      affected = 0;

      await expect(
        service.changeStatus('sub-1', 'seller-a', SubOrderStatus.ACCEPTED),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('completes the order when the last open suborder is delivered', async () => {
      current.status = SubOrderStatus.SHIPPED;
      siblings = [SubOrderStatus.DELIVERED, SubOrderStatus.CANCELLED];

      await service.changeStatus('sub-1', 'seller-a', SubOrderStatus.DELIVERED);

      expect(updates()[1]).toEqual({
        entity: Order,
        set: { status: OrderStatus.COMPLETED },
        where: { id: 'order-1', status: OrderStatus.PAID },
      });
      expect(events.publish).toHaveBeenCalledWith({
        type: 'OrderCompleted',
        orderId: 'order-1',
      });
    });

    it('cancels the order when every suborder ends cancelled', async () => {
      current.status = SubOrderStatus.ACCEPTED;
      siblings = [SubOrderStatus.CANCELLED, SubOrderStatus.CANCELLED];

      await service.changeStatus('sub-1', 'seller-a', SubOrderStatus.CANCELLED);

      expect(updates()[1]).toEqual({
        entity: Order,
        set: { status: OrderStatus.CANCELLED },
        where: { id: 'order-1', status: OrderStatus.PAID },
      });
      expect(events.publish).toHaveBeenCalledWith({
        type: 'OrderCancelled',
        orderId: 'order-1',
      });
    });

    it('leaves the order untouched while a suborder is still open', async () => {
      current.status = SubOrderStatus.SHIPPED;
      siblings = [SubOrderStatus.DELIVERED, SubOrderStatus.SHIPPED];

      await service.changeStatus('sub-1', 'seller-a', SubOrderStatus.DELIVERED);

      expect(updates()).toHaveLength(1);
      expect(events.publish).toHaveBeenCalledTimes(1);
    });

    it('publishes events only after the transaction commits', async () => {
      current.status = SubOrderStatus.SHIPPED;
      siblings = [SubOrderStatus.DELIVERED];

      await service.changeStatus('sub-1', 'seller-a', SubOrderStatus.DELIVERED);

      expect(timeline).toEqual([
        'commit',
        'SubOrderStatusChanged',
        'OrderCompleted',
      ]);
    });

    it('publishes nothing when the transaction fails', async () => {
      current.status = SubOrderStatus.SHIPPED;
      manager.find.mockRejectedValueOnce(new Error('connection lost'));

      await expect(
        service.changeStatus('sub-1', 'seller-a', SubOrderStatus.DELIVERED),
      ).rejects.toThrow('connection lost');
      expect(events.publish).not.toHaveBeenCalled();
    });
  });
});
