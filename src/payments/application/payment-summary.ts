import { Payment } from '../domain/payment.entity';
import { PaymentStatus } from '../domain/payment-status.enum';

export interface PaymentSummary {
  paymentReference: string;
  status: PaymentStatus;
  amount: number;
}

export function toPaymentSummary(payment: Payment): PaymentSummary {
  return {
    paymentReference: payment.reference,
    status: payment.status,
    amount: payment.amount,
  };
}
