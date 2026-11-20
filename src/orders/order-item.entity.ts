import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../database/numeric.transformer';
import { Product } from '../products/product.entity';
import { SubOrder } from './sub-order.entity';

// Snapshot of a product at purchase time: later product edits or deletions never change it.
@Entity()
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  subOrderId!: string;

  @ManyToOne(() => SubOrder, (subOrder) => subOrder.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'subOrderId' })
  subOrder!: SubOrder;

  @Column({ type: 'uuid', nullable: true })
  productId!: string | null;

  @ManyToOne(() => Product, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productId' })
  product!: Product | null;

  @Column({ type: 'varchar', length: 120 })
  productName!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  subtotal!: number;
}
