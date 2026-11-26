import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  EVENT_PUBLISHER,
  EventPublisher,
} from '../../events/application/ports/event-publisher';
import { OrderStatus } from '../domain/order-status.enum';
import {
  canTransitionOrder,
  deriveOrderStatus,
} from '../domain/order-status.machine';
import { Order } from '../domain/order.entity';
import { OrderEvent, orderClosedEvent } from '../domain/order.events';
import { SubOrderStatus } from '../domain/sub-order-status.enum';
import { canTransitionSubOrder } from '../domain/sub-order-status.machine';
import { SubOrder } from '../domain/sub-order.entity';
import { transitionStatus } from './status-transition';

@Injectable()
export class SubOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SubOrder)
    private readonly subOrdersRepository: Repository<SubOrder>,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  findAllForSeller(sellerId: string): Promise<SubOrder[]> {
    return this.subOrdersRepository.find({
      where: { sellerId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  // Filtering by seller in the query makes another seller's suborder indistinguishable from a missing one.
  async findOneForSeller(id: string, sellerId: string): Promise<SubOrder> {
    const subOrder = await this.subOrdersRepository.findOne({
      where: { id, sellerId },
      relations: { items: true },
    });
    if (!subOrder) {
      throw new NotFoundException('Suborder not found');
    }
    return subOrder;
  }

  async changeStatus(
    id: string,
    sellerId: string,
    to: SubOrderStatus,
  ): Promise<SubOrder> {
    const { subOrder, events } = await this.dataSource.transaction(
      async (manager) => {
        const current = await manager.findOne(SubOrder, {
          where: { id, sellerId },
        });
        if (!current) {
          throw new NotFoundException('Suborder not found');
        }
        const from = current.status;
        if (!canTransitionSubOrder(from, to)) {
          throw new ConflictException(
            `Cannot change sub-order from ${from} to ${to}`,
          );
        }

        // Locking the order serializes changes of sibling suborders, so the
        // derived status below always sees every committed sibling.
        const order = await manager.findOneOrFail(Order, {
          where: { id: current.orderId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          to === SubOrderStatus.ACCEPTED &&
          order.status !== OrderStatus.PAID
        ) {
          throw new ConflictException('Order is not paid');
        }

        await transitionStatus(manager, SubOrder, id, from, to);
        const events: OrderEvent[] = [
          {
            type: 'SubOrderStatusChanged',
            subOrderId: id,
            orderId: order.id,
            sellerId,
            from,
            to,
          },
        ];
        const derived = await this.deriveOrder(manager, order);
        if (derived) {
          events.push(orderClosedEvent(order.id, derived));
        }

        const subOrder = await manager.findOneOrFail(SubOrder, {
          where: { id },
          relations: { items: true },
        });
        return { subOrder, events };
      },
    );

    // Published only after commit, so subscribers never see a rolled-back change.
    for (const event of events) {
      this.events.publish(event);
    }
    return subOrder;
  }

  private async deriveOrder(
    manager: EntityManager,
    order: Order,
  ): Promise<OrderStatus | null> {
    const siblings = await manager.find(SubOrder, {
      select: { id: true, status: true },
      where: { orderId: order.id },
    });
    const derived = deriveOrderStatus(siblings.map((s) => s.status));
    if (!derived || !canTransitionOrder(order.status, derived)) {
      return null;
    }
    await transitionStatus(manager, Order, order.id, order.status, derived);
    return derived;
  }
}
