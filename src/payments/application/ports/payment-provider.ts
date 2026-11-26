export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreatePaymentRequest {
  orderId: string;
  amount: number;
}

export interface CreatePaymentResult {
  // Provider-side identifier; the webhook refers to the payment by it.
  reference: string;
}

// Payments are asynchronous: creating one only registers it with the provider,
// which later reports the result through the payment webhook.
export interface PaymentProvider {
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult>;
}
