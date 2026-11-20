import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../database/numeric.transformer';
import { User } from '../users/user.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { SubOrderStatus } from './sub-order-status.enum';

const money = {
  type: 'numeric',
  precision: 12,
  scale: 2,
  transformer: numericTransformer,
} as const;

@Entity()
export class SubOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.subOrders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  @Index()
  @Column({ type: 'uuid' })
  sellerId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sellerId' })
  seller!: User;

  @Column({
    type: 'enum',
    enum: SubOrderStatus,
    enumName: 'sub_order_status_enum',
    default: SubOrderStatus.PENDING,
  })
  status!: SubOrderStatus;

  @Column(money)
  subtotal!: number;

  // Copied from the seller at purchase time so later rate changes do not alter past sales.
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  commissionRate!: number;

  @Column(money)
  commissionAmount!: number;

  @Column(money)
  sellerNet!: number;

  @OneToMany(() => OrderItem, (item) => item.subOrder, { cascade: ['insert'] })
  items!: OrderItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
