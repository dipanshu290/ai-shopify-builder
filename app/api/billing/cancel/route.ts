import { NextRequest } from 'next/server';
import { z } from 'zod';
import { bearerToken, getUserFromToken } from '@/lib/billing/admin';
import { getStripe } from '@/lib/billing/stripe';
import { getSubscription } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

/**
 * Cancel (or resume) the signed-in user's subscription. We flip
 * `cancel_at_period_end` rather than deleting immediately, so the user keeps
 * access until the end of the paid period. The resulting
 * `customer.subscription.updated` webhook syncs the flag into our table.
 */
const bodySchema = z.object({ resume: z.boolean().optional() });

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const resume = parsed.success ? parsed.data.resume === true : false;

  const sub = await getSubscription(user.id);
  if (!sub?.stripe_subscription_id) {
    return Response.json({ error: 'No active subscription to cancel.' }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: !resume,
    });
    return Response.json({ ok: true, cancelAtPeriodEnd: !resume });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to update subscription.' },
      { status: 500 }
    );
  }
}
