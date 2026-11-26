export enum WebhookOutcome {
  // Placeholder written by the idempotency insert; replaced before the transaction commits.
  RECEIVED = 'RECEIVED',
  APPLIED = 'APPLIED',
  IGNORED_UNKNOWN_PAYMENT = 'IGNORED_UNKNOWN_PAYMENT',
  IGNORED_ALREADY_FINAL = 'IGNORED_ALREADY_FINAL',
  // The payment was approved but the order was no longer payable (e.g. cancelled
  // meanwhile). Refunds are out of scope: it is logged for manual follow-up.
  REFUND_REQUIRED = 'REFUND_REQUIRED',
}
