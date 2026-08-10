import 'server-only';
import Stripe from 'stripe';

/**
 * Server-only Stripe client (AGENTS.md §15: the secret key must never reach the
 * browser). `import 'server-only'` makes any accidental client import a build
 * error. We omit `apiVersion` so the account's default pinned version is used,
 * avoiding a hard-coded version string that drifts from the installed SDK.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to .env.local (see docs/billing-setup.md).'
    );
  }
  client = new Stripe(key);
  return client;
}

/** The signing secret for verifying incoming Stripe webhook events. */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET is not set. Add it to .env.local (see docs/billing-setup.md).'
    );
  }
  return secret;
}
