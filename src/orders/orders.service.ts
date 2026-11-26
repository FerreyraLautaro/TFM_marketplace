import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { EVENT_PUBLISHER, EventPublisher } from '../events/event-publisher';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../payments/payment-provider';
import { PaymentStatus } from '../payments/payment-status.enum';
import { PaymentSummary, toPaymentSummary } from '../payments/payment-summary';
import {
  ONE_PENDING_PAYMENT_PER_ORDER,
  Payment,
} from '../payments/payment.entity';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemInputDto } from './dto/order-item-input.dto';
import { commissionCents, fromCents, toCents } from './money';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from './order-status.enum';
import { canTransitionOrder } from './order-status.machine';
import { Order } from './order.entity';
import { OrderEvent } from './order.events';
import { SubOrderStatus } from './sub-order-status.enum';
import { SubOrder } from './sub-order.entity';
import { transitionStatus } from './status-transition';

const ORDER_RELATIONS = { subOrders: { items: true } };

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  async create(buyerId: string, dto: CreateOrderDto): Promise<Order> {
    const quantities = mergeQuantities(dto.items);
    const order = await this.dataSource.transaction(async (manager) => {
      const products = await this.loadProducts(manager, [...quantities.keys()]);
      const rates = await this.loadCommissionRates(manager, products);

      const productsBySeller = new Map<string, Product[]>();
      for (const product of products) {
        const group = productsBySeller.get(product.sellerId) ?? [];
        group.push(product);
        productsBySeller.set(product.sellerId, group);
      }

      let totalCents = 0;
      const subOrders = [...productsBySeller].map(([sellerId, group]) => {
        const items = group.map((product) =>
          buildItem(product, quantities.get(product.id)!),
        );
        const subtotalCents = items.reduce(
          (sum, item) => sum + toCents(item.subtotal),
          0,
        );
        const rate = rates.get(sellerId)!;
        const commission = commissionCents(subtotalCents, rate);
        totalCents += subtotalCents;
        return manager.create(SubOrder, {
          sellerId,
          subtotal: fromCents(subtotalCents),
          commissionRate: rate,
          commissionAmount: fromCents(commission),
          sellerNet: fromCents(subtotalCents - commission),
          items,
        });
      });

      const order = manager.create(Order, {
        buyerId,
        total: fromCents(totalCents),
        subOrders,
      });
      const saved = await manager.save(order);
      return manager.findOneOrFail(Order, {
        where: { id: saved.id },
        relations: ORDER_RELATIONS,
      });
    });

    this.events.publish<OrderEvent>({
      type: 'OrderCreated',
      orderId: order.id,
      buyerId: order.buyerId,
      total: order.total,
      subOrderIds: order.subOrders.map((subOrder) => subOrder.id),
    });
    return order;
  }

  // Idempotent: paying again while a payment is pending returns that payment.
  // The order only becomes PAID when the provider's webhook approves it.
  async pay(id: string, buyerId: string): Promise<PaymentSummary> {
    const order = await this.findOneForBuyer(id, buyerId);
    assertOrderTransition(order.status, OrderStatus.PAID);

    const open = await this.paymentsRepository.find({
      where: {
        orderId: id,
        status: In([PaymentStatus.PENDING, PaymentStatus.APPROVED]),
      },
    });
    if (open.some((payment) => payment.status === PaymentStatus.APPROVED)) {
      throw new ConflictException('Order already has an approved payment');
    }
    const pending = open.find((p) => p.status === PaymentStatus.PENDING);
    if (pending) {
      return toPaymentSummary(pending);
    }

    // Outside any transaction so no lock is held while waiting on the provider.
    const { reference } = await this.payments.createPayment({
      orderId: id,
      amount: order.total,
    });
    try {
      const payment = await this.paymentsRepository.save(
        this.paymentsRepository.create({
          orderId: id,
          reference,
          amount: order.total,
          status: PaymentStatus.PENDING,
        }),
      );
      return toPaymentSummary(payment);
    } catch (error) {
      // A concurrent request stored its pending payment first: return that one.
      if (!isViolationOf(error, ONE_PENDING_PAYMENT_PER_ORDER)) {
        throw error;
      }
      const winner = await this.paymentsRepository.findOneByOrFail({
        orderId: id,
        status: PaymentStatus.PENDING,
      });
      return toPaymentSummary(winner);
    }
  }

  async cancel(id: string, buyerId: string): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, { where: { id, buyerId } });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      // The buyer can only cancel before paying; PAID -> CANCELLED is derived from suborders.
      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException(
          `Cannot change order from ${order.status} to ${OrderStatus.CANCELLED}`,
        );
      }
      await transitionStatus(
        manager,
        Order,
        id,
        OrderStatus.PENDING,
        OrderStatus.CANCELLED,
      );
      // An unpaid order can only have PENDING or already CANCELLED suborders.
      await manager
        .createQueryBuilder()
        .update(SubOrder)
        .set({ status: SubOrderStatus.CANCELLED })
        .where({ orderId: id, status: SubOrderStatus.PENDING })
        .execute();
    });

    this.events.publish<OrderEvent>({ type: 'OrderCancelled', orderId: id });
    return this.findOneForBuyer(id, buyerId);
  }

  findAllForBuyer(buyerId: string): Promise<Order[]> {
    return this.ordersRepository.find({
      where: { buyerId },
      relations: ORDER_RELATIONS,
      order: { createdAt: 'DESC' },
    });
  }

  // Filtering by buyer in the query makes another buyer's order indistinguishable from a missing one.
  async findOneForBuyer(id: string, buyerId: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id, buyerId },
      relations: ORDER_RELATIONS,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  private async loadProducts(
    manager: EntityManager,
    ids: string[],
  ): Promise<Product[]> {
    const products = await manager.find(Product, { where: { id: In(ids) } });
    const found = new Set(products.map((product) => product.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Products not found: ${missing.join(', ')}`);
    }
    return products;
  }

  private async loadCommissionRates(
    manager: EntityManager,
    products: Product[],
  ): Promise<Map<string, number>> {
    const sellerIds = [...new Set(products.map((product) => product.sellerId))];
    const sellers = await manager.find(User, {
      select: { id: true, commissionRate: true },
      where: { id: In(sellerIds) },
    });
    return new Map(sellers.map((seller) => [seller.id, seller.commissionRate]));
  }
}

function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new ConflictException(`Cannot change order from ${from} to ${to}`);
  }
}

function isViolationOf(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return driverError.code === '23505' && driverError.constraint === constraint;
}

function mergeQuantities(items: OrderItemInputDto[]): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const { productId, quantity } of items) {
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }
  return quantities;
}

type ItemSnapshot = Pick<
  OrderItem,
  'productId' | 'productName' | 'unitPrice' | 'quantity' | 'subtotal'
>;

function buildItem(product: Product, quantity: number): ItemSnapshot {
  return {
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    quantity,
    subtotal: fromCents(toCents(product.price) * quantity),
  };
}
