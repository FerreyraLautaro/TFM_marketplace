import { FakePaymentProvider } from './fake-payment-provider';
import { PaymentProvider } from './payment-provider';

describe('FakePaymentProvider', () => {
  it('approves every charge with a unique fake reference', async () => {
    const provider: PaymentProvider = new FakePaymentProvider();

    const first = await provider.charge({ orderId: 'order-1', amount: 10 });
    const second = await provider.charge({ orderId: 'order-1', amount: 10 });

    expect(first.reference).toMatch(/^fake-/);
    expect(second.reference).not.toBe(first.reference);
  });
});
