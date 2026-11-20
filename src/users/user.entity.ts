import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
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

  @CreateDateColumn()
  createdAt!: Date;
}
