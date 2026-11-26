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
import { numericTransformer } from '../../database/numeric.transformer';
import { User } from '../../users/domain/user.entity';
import { OrderStatus } from './order-status.enum';
import { SubOrder } from './sub-order.entity';

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  buyerId!: string;

  // No cascade on delete: a user with orders cannot be removed, so the history is preserved.
  @ManyToOne(() => User)
  @JoinColumn({ name: 'buyerId' })
  buyer!: User;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status_enum',
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  total!: number;

  @OneToMany(() => SubOrder, (subOrder) => subOrder.order, {
    cascade: ['insert'],
  })
  subOrders!: SubOrder[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
