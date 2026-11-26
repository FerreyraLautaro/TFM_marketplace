import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreatePaymentResult, PaymentProvider } from './payment-provider';

// Stands in for a real provider: it only hands out a reference. The result
// arrives later through POST /payments/:reference/simulate, which signs and
// delivers the webhook the provider would send.
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  createPayment(): Promise<CreatePaymentResult> {
    return Promise.resolve({ reference: `fake-${randomUUID()}` });
  }
}
