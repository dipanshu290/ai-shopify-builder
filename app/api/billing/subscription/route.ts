import { NextRequest } from 'next/server';
import { bearerToken, getUserFromToken } from '@/lib/billing/admin';
import { getEntitlement } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

/**
 * Return the authoritative entitlement (plan, status, usage, permissions) for
 * the signed-in user. This is the single source the client reads for gating —
 * it always reflects server state, so it stays correct right after a webhook.
 * `Infinity` is not valid JSON, so unlimited project caps are sent as `null`.
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const entitlement = await getEntitlement(user.id);
    return Response.json(
      {
        ...entitlement,
        maxProjects: Number.isFinite(entitlement.maxProjects) ? entitlement.maxProjects : null,
        remaining: Number.isFinite(entitlement.remaining) ? entitlement.remaining : null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to load subscription.' },
      { status: 500 }
    );
  }
}
