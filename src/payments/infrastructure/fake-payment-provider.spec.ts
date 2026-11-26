import { FakePaymentProvider } from './fake-payment-provider';
import { PaymentProvider } from '../application/ports/payment-provider';

describe('FakePaymentProvider', () => {
  it('creates every payment with a unique fake reference', async () => {
    const provider: PaymentProvider = new FakePaymentProvider();
    const request = { orderId: 'order-1', amount: 10 };

    const first = await provider.createPayment(request);
    const second = await provider.createPayment(request);

    expect(first.reference).toMatch(/^fake-/);
    expect(second.reference).not.toBe(first.reference);
  });
});
