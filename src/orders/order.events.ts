import { OrderStatus } from './order-status.enum';
import { SubOrderStatus } from './sub-order-status.enum';

export interface OrderCreated {
  type: 'OrderCreated';
  orderId: string;
  buyerId: string;
  total: number;
  subOrderIds: string[];
}

export interface OrderPaid {
  type: 'OrderPaid';
  orderId: string;
  paymentReference: string;
}

export interface OrderCancelled {
  type: 'OrderCancelled';
  orderId: string;
}

export interface OrderCompleted {
  type: 'OrderCompleted';
  orderId: string;
}

export interface SubOrderStatusChanged {
  type: 'SubOrderStatusChanged';
  subOrderId: string;
  orderId: string;
  sellerId: string;
  from: SubOrderStatus;
  to: SubOrderStatus;
}

export type OrderEvent =
  | OrderCreated
  | OrderPaid
  | OrderCancelled
  | OrderCompleted
  | SubOrderStatusChanged;

export const ORDER_EVENT_TYPES: OrderEvent['type'][] = [
  'OrderCreated',
  'OrderPaid',
  'OrderCancelled',
  'OrderCompleted',
  'SubOrderStatusChanged',
];

export function orderClosedEvent(
  orderId: string,
  status: OrderStatus,
): OrderCompleted | OrderCancelled {
  return status === OrderStatus.COMPLETED
    ? { type: 'OrderCompleted', orderId }
    : { type: 'OrderCancelled', orderId };
}
