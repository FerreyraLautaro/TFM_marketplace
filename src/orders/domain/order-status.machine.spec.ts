import { OrderStatus } from './order-status.enum';
import { canTransitionOrder, deriveOrderStatus } from './order-status.machine';
import { SubOrderStatus } from './sub-order-status.enum';

const { PENDING, PAID, COMPLETED, CANCELLED } = OrderStatus;

const allowed: [OrderStatus, OrderStatus][] = [
  [PENDING, PAID],
  [PENDING, CANCELLED],
  [PAID, COMPLETED],
  [PAID, CANCELLED],
];

const forbidden = Object.values(OrderStatus)
  .flatMap((from) =>
    Object.values(OrderStatus).map((to): [OrderStatus, OrderStatus] => [
      from,
      to,
    ]),
  )
  .filter(([from, to]) => !allowed.some(([f, t]) => f === from && t === to));

describe('order status machine', () => {
  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(true);
  });

  it.each(forbidden)('forbids %s -> %s', (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(false);
  });

  it('only lets a paid order become completed', () => {
    expect(canTransitionOrder(PENDING, COMPLETED)).toBe(false);
    expect(canTransitionOrder(PAID, COMPLETED)).toBe(true);
  });
});

describe('deriveOrderStatus', () => {
  const S = SubOrderStatus;

  it('completes the order when every suborder is delivered', () => {
    expect(deriveOrderStatus([S.DELIVERED, S.DELIVERED])).toBe(COMPLETED);
  });

  it('completes the order when at least one suborder is delivered', () => {
    expect(deriveOrderStatus([S.DELIVERED, S.CANCELLED])).toBe(COMPLETED);
  });

  it('cancels the order when every suborder is cancelled', () => {
    expect(deriveOrderStatus([S.CANCELLED, S.CANCELLED])).toBe(CANCELLED);
  });

  it.each([S.PENDING, S.ACCEPTED, S.SHIPPED])(
    'keeps the order open while a suborder is %s',
    (open) => {
      expect(deriveOrderStatus([S.DELIVERED, open])).toBeNull();
    },
  );

  it('derives nothing without suborders', () => {
    expect(deriveOrderStatus([])).toBeNull();
  });
});
