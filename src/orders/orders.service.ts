import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemInputDto } from './dto/order-item-input.dto';
import { commissionCents, fromCents, toCents } from './money';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { SubOrder } from './sub-order.entity';

const ORDER_RELATIONS = { subOrders: { items: true } };

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
  ) {}

  create(buyerId: string, dto: CreateOrderDto): Promise<Order> {
    const quantities = mergeQuantities(dto.items);
    return this.dataSource.transaction(async (manager) => {
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
