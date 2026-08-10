import { NextRequest } from 'next/server';
import { z } from 'zod';
import { bearerToken, getUserFromToken } from '@/lib/billing/admin';
import { getStripe } from '@/lib/billing/stripe';
import { appOrigin } from '@/lib/billing/server-utils';
import { PLANS } from '@/lib/billing/plans';
import { ensureCustomerId, getSubscription } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

/**
 * Create a Stripe Checkout Session for a subscription (AGENTS.md §5: thin route,
 * §15: Stripe secret stays server-side).
 *
 * Per the product spec we do NOT reference predefined Stripe Price IDs. The plan
 * name, billing interval, and amount all come from our own `PLANS` catalog and
 * are passed inline as `price_data`, so Stripe creates the price on the fly.
 */
const bodySchema = z.object({ plan: z.enum(['monthly', 'yearly']) });

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid plan.' }, { status: 400 });
  }

  const plan = PLANS[parsed.data.plan];
  if (!plan.interval) {
    return Response.json({ error: 'Selected plan is not billable.' }, { status: 400 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Billing unavailable.' },
      { status: 500 }
    );
  }

  try {
    // Reuse the user's existing Stripe customer when we have one, so their
    // billing history and portal stay on a single customer record.
    const existing = await getSubscription(user.id);
    let customerId = existing?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { insforge_user_id: user.id },
      });
      customerId = customer.id;
      await ensureCustomerId(user.id, customerId);
    }

    const origin = appOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: plan.currency,
            unit_amount: plan.amount,
            recurring: { interval: plan.interval },
            product_data: {
              name: `Shopify Theme Builder — ${plan.name}`,
            },
          },
        },
      ],
      // Stamp the user id everywhere the webhook can read it back.
      metadata: { insforge_user_id: user.id, plan: plan.id },
      subscription_data: {
        metadata: { insforge_user_id: user.id, plan: plan.id },
      },
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return Response.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 });
    }
    return Response.json({ url: session.url });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to start checkout.' },
      { status: 500 }
    );
  }
}
