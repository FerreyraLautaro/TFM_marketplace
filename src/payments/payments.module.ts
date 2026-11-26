import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FakePaymentProvider } from './infrastructure/fake-payment-provider';
import { PaymentCheckoutSimulator } from './application/payment-checkout-simulator';
import { PAYMENT_PROVIDER } from './application/ports/payment-provider';
import { PaymentWebhookService } from './application/payment-webhook.service';
import { Payment } from './domain/payment.entity';
import { PaymentsController } from './http/payments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [PaymentsController],
  providers: [
    { provide: PAYMENT_PROVIDER, useClass: FakePaymentProvider },
    PaymentWebhookService,
    PaymentCheckoutSimulator,
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
