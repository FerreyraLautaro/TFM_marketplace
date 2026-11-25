import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-signature';
const SIGNATURE_PREFIX = 'sha256=';
const HEX_DIGEST = /^[0-9a-f]{64}$/i;

function digest(body: Buffer | string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

/** Header value a provider sends: `sha256=<hex HMAC-SHA256 of the raw body>`. */
export function signWebhookBody(body: Buffer | string, secret: string): string {
  return `${SIGNATURE_PREFIX}${digest(body, secret).toString('hex')}`;
}

// The HMAC covers the exact bytes received: re-serializing parsed JSON could
// change key order or whitespace and break a valid signature.
export function isValidWebhookSignature(
  body: Buffer | string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header?.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const provided = header.slice(SIGNATURE_PREFIX.length);
  if (!HEX_DIGEST.test(provided)) {
    return false;
  }
  const expected = digest(body, secret);
  const received = Buffer.from(provided, 'hex');
  // timingSafeEqual throws on different lengths, so check first.
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
