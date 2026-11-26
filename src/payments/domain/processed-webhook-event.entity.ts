import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { WebhookOutcome } from './webhook-outcome.enum';

/** One row per webhook event id ever handled: the primary key makes redelivered events detectable. */
@Entity()
export class ProcessedWebhookEvent {
  @PrimaryColumn({ type: 'varchar' })
  eventId!: string;

  @Column({ type: 'varchar' })
  paymentReference!: string;

  // Plain varchar so new outcomes need no enum migration.
  @Column({ type: 'varchar' })
  outcome!: WebhookOutcome;

  @CreateDateColumn()
  receivedAt!: Date;
}
