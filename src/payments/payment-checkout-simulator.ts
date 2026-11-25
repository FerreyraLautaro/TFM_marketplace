import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Env } from '../config/env.schema';
import { PAYMENT_UPDATED, PaymentWebhookDto } from './dto/payment-webhook.dto';
import { SimulatePaymentDto } from './dto/simulate-payment.dto';
import { Payment } from './payment.entity';
import {
  PaymentWebhookService,
  WebhookResponse,
} from './payment-webhook.service';
import { signWebhookBody } from './webhook-signature';

// Stands in for the provider's checkout page: the buyer picks the result and
// the provider side signs and sends the webhook. It goes through the same
// verification as a real delivery, so the demo proves the real path.
@Injectable()
export class PaymentCheckoutSimulator {
  private readonly secret: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly webhooks: PaymentWebhookService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('PAYMENT_WEBHOOK_SECRET', { infer: true });
  }

  async simulate(
    reference: string,
    buyerId: string,
    dto: SimulatePaymentDto,
  ): Promise<WebhookResponse> {
    // Filtering by the order's buyer makes another buyer's payment look missing.
    const payment = await this.paymentsRepository.findOne({
      where: { reference, order: { buyerId } },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const event: PaymentWebhookDto = {
      eventId: dto.eventId ?? `evt-${randomUUID()}`,
      type: PAYMENT_UPDATED,
      data: { reference, status: dto.status },
    };
    const body = Buffer.from(JSON.stringify(event));
    return this.webhooks.handle(body, signWebhookBody(body, this.secret));
  }
}
