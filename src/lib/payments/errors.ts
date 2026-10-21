/**
 * Payment provider errors.
 *
 * Whitelisted in the API error handler (src/lib/api.ts) so that
 * provider-specific failures return their message to the client
 * rather than a generic 500.
 */
export class PaymentProviderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PaymentProviderError";
    this.status = status;
  }
}
