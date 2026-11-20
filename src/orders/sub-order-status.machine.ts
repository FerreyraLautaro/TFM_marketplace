import { SubOrderStatus } from './sub-order-status.enum';

const { PENDING, ACCEPTED, SHIPPED, DELIVERED, CANCELLED } = SubOrderStatus;

export const SUB_ORDER_TRANSITIONS: Record<
  SubOrderStatus,
  readonly SubOrderStatus[]
> = {
  [PENDING]: [ACCEPTED, CANCELLED],
  [ACCEPTED]: [SHIPPED, CANCELLED],
  [SHIPPED]: [DELIVERED],
  [DELIVERED]: [],
  [CANCELLED]: [],
};

export function canTransitionSubOrder(
  from: SubOrderStatus,
  to: SubOrderStatus,
): boolean {
  return SUB_ORDER_TRANSITIONS[from].includes(to);
}
