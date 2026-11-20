import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ChargeResult, PaymentProvider } from './payment-provider';

// Stands in for Mercado Pago until the sandbox integration: every charge is approved.
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  charge(): Promise<ChargeResult> {
    return Promise.resolve({ reference: `fake-${randomUUID()}` });
  }
}
