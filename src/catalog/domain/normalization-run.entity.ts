import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/domain/user.entity';
import { NormalizationRunStatus } from './normalization-run-status.enum';
import type { NormalizationProposal } from './normalization-proposal';

/** One record per normalizer call, successful or not: the audit trail and the raw material for evaluation. */
@Entity()
export class NormalizationRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Nullable so runs survive the deletion of the user who requested them.
  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user!: User | null;

  @Column({ type: 'text' })
  rawText!: string;

  @Column({ type: 'varchar', length: 20 })
  promptVersion!: string;

  // Null when the provider failed before answering, so the model is unknown to the caller.
  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null;

  @Column({
    type: 'enum',
    enum: NormalizationRunStatus,
    enumName: 'normalization_run_status_enum',
  })
  status!: NormalizationRunStatus;

  @Column({ type: 'text', nullable: true })
  rawOutput!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  result!: NormalizationProposal | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'int' })
  attempts!: number;

  @Column({ type: 'int' })
  latencyMs!: number;

  @Column({ type: 'int', nullable: true })
  inputTokens!: number | null;

  @Column({ type: 'int', nullable: true })
  outputTokens!: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}
