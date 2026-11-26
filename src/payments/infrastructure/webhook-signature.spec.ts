import { isValidWebhookSignature, signWebhookBody } from './webhook-signature';

describe('webhook signature', () => {
  const secret = 'a-webhook-secret-of-at-least-32-chars';
  const body = Buffer.from('{"eventId":"evt-1","type":"payment.updated"}');

  it('accepts the signature produced with the same secret and body', () => {
    const header = signWebhookBody(body, secret);

    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(isValidWebhookSignature(body, header, secret)).toBe(true);
  });

  it('rejects a body changed after signing', () => {
    const header = signWebhookBody(body, secret);
    const tampered = Buffer.from(body.toString().replace('evt-1', 'evt-2'));

    expect(isValidWebhookSignature(tampered, header, secret)).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    const header = signWebhookBody(body, 'another-secret-of-at-least-32-chars');

    expect(isValidWebhookSignature(body, header, secret)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['without the sha256= prefix', signWebhookBody(body, secret).slice(7)],
    ['with a non-hex digest', `sha256=${'z'.repeat(64)}`],
    ['with a shorter digest', 'sha256=abcd'],
    ['with a longer digest', `${signWebhookBody(body, secret)}00`],
  ])('rejects a header that is %s without throwing', (_case, header) => {
    expect(() => isValidWebhookSignature(body, header, secret)).not.toThrow();
    expect(isValidWebhookSignature(body, header, secret)).toBe(false);
  });

  it('accepts an uppercase hex digest', () => {
    const header = signWebhookBody(body, secret);
    const upper = `sha256=${header.slice(7).toUpperCase()}`;

    expect(isValidWebhookSignature(body, upper, secret)).toBe(true);
  });
});
