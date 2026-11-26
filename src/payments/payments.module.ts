import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FakePaymentProvider } from './fake-payment-provider';
import { PaymentCheckoutSimulator } from './payment-checkout-simulator';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentWebhookService } from './payment-webhook.service';
import { Payment } from './payment.entity';
import { PaymentsController } from './payments.controller';

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
