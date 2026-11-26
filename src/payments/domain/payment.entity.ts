import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../database/numeric.transformer';
import { Order } from '../../orders/domain/order.entity';
import { PaymentStatus } from './payment-status.enum';

export const ONE_PENDING_PAYMENT_PER_ORDER =
  'IDX_payment_one_pending_per_order';

// The partial unique index lets the database settle two concurrent "pay"
// requests: only one PENDING payment per order can ever exist.
@Entity()
@Index(ONE_PENDING_PAYMENT_PER_ORDER, ['orderId'], {
  unique: true,
  where: `"status" = 'PENDING'`,
})
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  orderId!: string;

  // No cascade on delete: payments are financial history.
  @ManyToOne(() => Order)
  @JoinColumn({ name: 'orderId' })
  order!: Order;

  // Identifier assigned by the payment provider; webhooks refer to it.
  @Column({ type: 'varchar', unique: true })
  reference!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
