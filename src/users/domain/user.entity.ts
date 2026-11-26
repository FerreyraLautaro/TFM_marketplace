import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../database/numeric.transformer';
import { UserRole } from './user-role.enum';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  // Excluded from default selects so it never leaks through regular queries.
  @Column({ select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role_enum' })
  role!: UserRole;

  // Percentage the marketplace keeps from each sale; copied into suborders at purchase time.
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 10,
    transformer: numericTransformer,
  })
  commissionRate!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
