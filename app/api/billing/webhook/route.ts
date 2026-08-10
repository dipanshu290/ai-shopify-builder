import { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, getWebhookSecret } from '@/lib/billing/stripe';
import {
  getSubscriptionByCustomer,
  upsertSubscription,
} from '@/lib/billing/subscriptions';
import type { BillingInterval, PlanId } from '@/lib/billing/plans';
import type { SubscriptionStatus } from '@/lib/billing/types';

export const runtime = 'nodejs';

/**
 * Stripe webhook — the source of truth for subscription state. Every relevant
 * event is verified against the signing secret, then mirrored into the
 * `subscriptions` table so local permissions (project limit, export) update
 * automatically after checkout, renewal, cancellation, or payment failure.
 *
 * The raw request body is required for signature verification, so we read it
 * with `req.text()` (App Router route handlers do not pre-parse the body).
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return Response.json({ error: 'Missing signature.' }, { status: 400 });
  }

  let stripe: Stripe;
  let event: Stripe.Event;
  try {
    stripe = getStripe();
    const raw = await req.text();
    event = stripe.webhooks.constructEvent(raw, signature, getWebhookSecret());
  } catch (err) {
    // A verification failure means the payload isn't trustworthy — reject it.
    return Response.json(
      { error: err instanceof Error ? err.message : 'Invalid webhook.' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          );
          await syncSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // Renewal or dunning — re-pull the subscription to capture the new
        // period end / status.
        const invoice = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdFromInvoice(invoice);
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
    return Response.json({ received: true });
  } catch (err) {
    // Return 500 so Stripe retries transient failures (e.g. DB hiccup).
    return Response.json(
      { error: err instanceof Error ? err.message : 'Webhook handler failed.' },
      { status: 500 }
    );
  }
}

/** Map a Stripe subscription onto our `subscriptions` row and persist it. */
async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Resolve the InsForge user id from metadata first, falling back to the stored
  // customer mapping (set when the customer was created at checkout).
  let userId: string | null = sub.metadata?.insforge_user_id ?? null;
  if (!userId) {
    const existing = await getSubscriptionByCustomer(customerId);
    userId = existing?.user_id ?? null;
  }
  if (!userId) {
    // Nothing we can attribute this subscription to — skip rather than guess.
    return;
  }

  const item = sub.items.data[0];
  const interval = (item?.price.recurring?.interval ?? null) as BillingInterval | null;
  const plan = planFromSubscription(sub, interval);
  const status = mapStatus(sub.status);

  await upsertSubscription({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    plan,
    billingInterval: status === 'canceled' ? null : interval,
    status,
    currentPeriodStart: toIso(item?.current_period_start),
    currentPeriodEnd: toIso(item?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  });
}

/** Prefer the plan stamped in metadata; otherwise derive it from the interval. */
function planFromSubscription(
  sub: Stripe.Subscription,
  interval: BillingInterval | null
): PlanId {
  if (mapStatus(sub.status) === 'canceled') return 'free';
  const metaPlan = sub.metadata?.plan;
  if (metaPlan === 'monthly' || metaPlan === 'yearly') return metaPlan;
  if (interval === 'year') return 'yearly';
  if (interval === 'month') return 'monthly';
  return 'free';
}

/** Stripe statuses map 1:1 to our union; canceled/incomplete_expired drop access. */
function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return status;
    default:
      return 'free';
  }
}

function toIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/** Newer Stripe API versions attach the subscription id via the invoice parent. */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
    subscription?: string | { id: string } | null;
  });
  const fromParent = parent.parent?.subscription_details?.subscription;
  if (fromParent) return typeof fromParent === 'string' ? fromParent : fromParent.id;
  const legacy = parent.subscription;
  if (legacy) return typeof legacy === 'string' ? legacy : legacy.id;
  return null;
}
