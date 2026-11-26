import { OrderStatus } from './order-status.enum';
import { SubOrderStatus } from './sub-order-status.enum';

const { PENDING, PAID, COMPLETED, CANCELLED } = OrderStatus;

// PAID -> CANCELLED is only reached by derivation (every suborder cancelled), never by the buyer.
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [PENDING]: [PAID, CANCELLED],
  [PAID]: [COMPLETED, CANCELLED],
  [COMPLETED]: [],
  [CANCELLED]: [],
};

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

// The order closes once every suborder is final: completed if anything was delivered, cancelled otherwise.
export function deriveOrderStatus(
  subOrderStatuses: SubOrderStatus[],
): OrderStatus | null {
  const final = subOrderStatuses.every(
    (status) =>
      status === SubOrderStatus.DELIVERED ||
      status === SubOrderStatus.CANCELLED,
  );
  if (subOrderStatuses.length === 0 || !final) {
    return null;
  }
  return subOrderStatuses.includes(SubOrderStatus.DELIVERED)
    ? COMPLETED
    : CANCELLED;
}
