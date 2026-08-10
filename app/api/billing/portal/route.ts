import { NextRequest } from 'next/server';
import { bearerToken, getUserFromToken } from '@/lib/billing/admin';
import { getStripe } from '@/lib/billing/stripe';
import { appOrigin } from '@/lib/billing/server-utils';
import { getSubscription } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

/**
 * Open the Stripe Customer Portal for the signed-in user so they can manage
 * payment methods, view invoices, switch or cancel their plan. Requires an
 * existing Stripe customer (created during checkout).
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const sub = await getSubscription(user.id);
  if (!sub?.stripe_customer_id) {
    return Response.json(
      { error: 'No billing account yet. Subscribe to a plan first.' },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${appOrigin(req)}/billing`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to open billing portal.' },
      { status: 500 }
    );
  }
}
