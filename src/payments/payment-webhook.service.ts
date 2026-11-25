import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { Env } from '../config/env.schema';
import { EVENT_PUBLISHER, EventPublisher } from '../events/event-publisher';
import { OrderStatus } from '../orders/order-status.enum';
import { Order } from '../orders/order.entity';
import { OrderEvent } from '../orders/order.events';
import { transitionStatus } from '../orders/status-transition';
import {
  FinalPaymentStatus,
  PaymentWebhookDto,
} from './dto/payment-webhook.dto';
import { PaymentStatus } from './payment-status.enum';
import { Payment } from './payment.entity';
import { ProcessedWebhookEvent } from './processed-webhook-event.entity';
import { WebhookOutcome } from './webhook-outcome.enum';
import { isValidWebhookSignature } from './webhook-signature';

// Always 2xx once the signature is valid: a 4xx/5xx makes the provider retry,
// and retrying an event we deliberately ignore would never succeed.
export type WebhookResponse =
  | { status: 'duplicate' }
  | { status: 'ignored' }
  | { status: 'processed'; outcome: WebhookOutcome };

interface Applied {
  outcome: WebhookOutcome;
  paidOrderId?: string;
}

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);
  private readonly secret: string;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('PAYMENT_WEBHOOK_SECRET', { infer: true });
  }

  /** Single entry point for the real webhook and the simulated checkout, so neither skips verification. */
  async handle(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<WebhookResponse> {
    if (!rawBody || !isValidWebhookSignature(rawBody, signature, this.secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const event = await parseEvent(rawBody);

    const { response, paidOrderId } = await this.dataSource.transaction(
      (manager) => this.process(manager, event),
    );

    // Published only after commit, so subscribers never see a rolled-back payment.
    if (paidOrderId) {
      this.events.publish<OrderEvent>({
        type: 'OrderPaid',
        orderId: paidOrderId,
        paymentReference: event.data.reference,
      });
    }
    return response;
  }

  private async process(
    manager: EntityManager,
    { eventId, data }: PaymentWebhookDto,
  ): Promise<{ response: WebhookResponse; paidOrderId?: string }> {
    // Claiming the event id is the first write: a redelivery finds the row and
    // changes nothing. A concurrent redelivery blocks on the primary key until
    // this transaction ends, then sees the conflict too.
    const claimed: unknown[] = await manager.query(
      `INSERT INTO "processed_webhook_event" ("eventId", "paymentReference", "outcome")
       VALUES ($1, $2, $3)
       ON CONFLICT ("eventId") DO NOTHING
       RETURNING "eventId"`,
      [eventId, data.reference, WebhookOutcome.RECEIVED],
    );
    if (claimed.length === 0) {
      return { response: { status: 'duplicate' } };
    }

    const payment = await manager.findOne(Payment, {
      where: { reference: data.reference },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) {
      this.logger.warn(
        `Webhook ${eventId} refers to unknown payment ${data.reference}`,
      );
      await recordOutcome(
        manager,
        eventId,
        WebhookOutcome.IGNORED_UNKNOWN_PAYMENT,
      );
      return { response: { status: 'ignored' } };
    }

    const { outcome, paidOrderId } = await this.apply(
      manager,
      payment,
      data.status,
    );
    await recordOutcome(manager, eventId, outcome);
    return { response: { status: 'processed', outcome }, paidOrderId };
  }

  private async apply(
    manager: EntityManager,
    payment: Payment,
    status: FinalPaymentStatus,
  ): Promise<Applied> {
    if (payment.status !== PaymentStatus.PENDING) {
      return { outcome: WebhookOutcome.IGNORED_ALREADY_FINAL };
    }
    await manager.update(Payment, { id: payment.id }, { status });
    // A rejected payment leaves the order PENDING so the buyer can pay again.
    if (status === PaymentStatus.REJECTED) {
      return { outcome: WebhookOutcome.APPLIED };
    }

    // Locked so a concurrent cancel waits and then fails its compare-and-set.
    const order = await manager.findOneOrFail(Order, {
      where: { id: payment.orderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (order.status !== OrderStatus.PENDING) {
      // The money was taken but the order can no longer be paid. Refunds are
      // out of scope: the payment stays APPROVED and this needs manual follow-up.
      this.logger.error(
        `Payment ${payment.reference} approved for order ${order.id} in status ${order.status}: refund required`,
      );
      return { outcome: WebhookOutcome.REFUND_REQUIRED };
    }
    await transitionStatus(
      manager,
      Order,
      order.id,
      OrderStatus.PENDING,
      OrderStatus.PAID,
    );
    return { outcome: WebhookOutcome.APPLIED, paidOrderId: order.id };
  }
}

async function recordOutcome(
  manager: EntityManager,
  eventId: string,
  outcome: WebhookOutcome,
): Promise<void> {
  await manager.update(ProcessedWebhookEvent, { eventId }, { outcome });
}

// Validated by hand instead of the global ValidationPipe: the signature has to
// be checked on the raw bytes before the body is trusted or even parsed.
async function parseEvent(rawBody: Buffer): Promise<PaymentWebhookDto> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new BadRequestException('Webhook body must be valid JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new BadRequestException('Webhook body must be a JSON object');
  }
  const event = plainToInstance(PaymentWebhookDto, json);
  const errors = await validate(event, { whitelist: true });
  if (errors.length > 0) {
    throw new BadRequestException(errorMessages(errors));
  }
  return event;
}

function errorMessages(errors: ValidationError[], path = ''): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}).map((m) => `${path}${m}`),
    ...errorMessages(error.children ?? [], `${path}${error.property}.`),
  ]);
}
