import { NextRequest } from 'next/server';
import { z } from 'zod';
import { bearerToken, getAdminClient, getUserFromToken } from '@/lib/billing/admin';
import { getEntitlement } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

/**
 * Server-side project creation with authoritative limit enforcement (product
 * spec: "Enforce project limits on the server side... Do not rely only on
 * frontend validation").
 *
 * The client sends the prompt + derived name; we resolve the user from their
 * bearer token, compute their entitlement (subscription + live project count),
 * and reject creation with 402 when a Free user is at their limit. Only then do
 * we insert — with `user_id` pinned to the verified user so the admin client
 * (which bypasses RLS) can never create a project for the wrong owner.
 */
const bodySchema = z.object({
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(10000),
});

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(bearerToken(req));
  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'A prompt is required.' }, { status: 400 });
  }

  try {
    const entitlement = await getEntitlement(user.id);
    if (!entitlement.canCreateProject) {
      return Response.json(
        {
          error: 'PROJECT_LIMIT_REACHED',
          message: `Free plan is limited to ${entitlement.maxProjects} projects. Upgrade to create more.`,
          entitlement: {
            plan: entitlement.plan,
            maxProjects: entitlement.maxProjects,
            projectCount: entitlement.projectCount,
          },
        },
        { status: 402 }
      );
    }

    const id = crypto.randomUUID();
    const { data, error } = await getAdminClient()
      .database.from('projects')
      .insert([
        {
          id,
          user_id: user.id,
          name: parsed.data.name,
          prompt: parsed.data.prompt,
          status: 'draft',
        },
      ])
      .select();

    if (error) {
      return Response.json(
        { error: error.message ?? 'Failed to create project.' },
        { status: 500 }
      );
    }

    const project = Array.isArray(data) ? data[0] : data;
    return Response.json({ project }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to create project.' },
      { status: 500 }
    );
  }
}
