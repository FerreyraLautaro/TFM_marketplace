import { SubOrderStatus } from './sub-order-status.enum';
import { canTransitionSubOrder } from './sub-order-status.machine';

const { PENDING, ACCEPTED, SHIPPED, DELIVERED, CANCELLED } = SubOrderStatus;

const allowed: [SubOrderStatus, SubOrderStatus][] = [
  [PENDING, ACCEPTED],
  [PENDING, CANCELLED],
  [ACCEPTED, SHIPPED],
  [ACCEPTED, CANCELLED],
  [SHIPPED, DELIVERED],
];

const forbidden = Object.values(SubOrderStatus)
  .flatMap((from) =>
    Object.values(SubOrderStatus).map(
      (to): [SubOrderStatus, SubOrderStatus] => [from, to],
    ),
  )
  .filter(([from, to]) => !allowed.some(([f, t]) => f === from && t === to));

describe('sub-order status machine', () => {
  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransitionSubOrder(from, to)).toBe(true);
  });

  it.each(forbidden)('forbids %s -> %s', (from, to) => {
    expect(canTransitionSubOrder(from, to)).toBe(false);
  });

  it('checks every pair of statuses', () => {
    expect(allowed.length + forbidden.length).toBe(25);
  });
});
