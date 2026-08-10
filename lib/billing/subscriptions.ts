import 'server-only';
import { getAdminClient } from './admin';
import { computeEntitlement } from './entitlements';
import type { BillingInterval, PlanId } from './plans';
import type { Entitlement, Subscription, SubscriptionStatus } from './types';

/**
 * Server-side `subscriptions` repository. All access uses the admin client
 * (bypasses RLS) because writes happen in the Stripe webhook where there is no
 * user session, and reads back the row for server-side gating. Keep every query
 * here (AGENTS.md §14) — routes stay thin.
 */

const TABLE = 'subscriptions';

function unwrap<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row as T) ?? null;
}

/** Fetch a user's subscription row, or null if they've never subscribed. */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await getAdminClient()
    .database.from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load subscription.');
  }
  return unwrap<Subscription>(data);
}

/** Look up a subscription by its Stripe customer id (used from webhooks). */
export async function getSubscriptionByCustomer(
  customerId: string
): Promise<Subscription | null> {
  const { data, error } = await getAdminClient()
    .database.from(TABLE)
    .select('*')
    .eq('stripe_customer_id', customerId)
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load subscription.');
  }
  return unwrap<Subscription>(data);
}

/** Count the projects a user owns. Drives the Free-plan limit check. */
export async function countUserProjects(userId: string): Promise<number> {
  const { data, error } = await getAdminClient()
    .database.from('projects')
    .select('id')
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message ?? 'Failed to count projects.');
  }
  return Array.isArray(data) ? data.length : 0;
}

export interface SubscriptionUpsert {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: PlanId;
  billingInterval: BillingInterval | null;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Insert or update the subscription row for a user (one row per user). Called
 * from the webhook after every relevant Stripe event so local state always
 * mirrors Stripe. Uses `user_id` as the natural key.
 */
export async function upsertSubscription(input: SubscriptionUpsert): Promise<void> {
  const db = getAdminClient().database;
  const now = new Date().toISOString();

  const record = {
    user_id: input.userId,
    stripe_customer_id: input.stripeCustomerId,
    stripe_subscription_id: input.stripeSubscriptionId,
    plan: input.plan,
    billing_interval: input.billingInterval,
    status: input.status,
    current_period_start: input.currentPeriodStart,
    current_period_end: input.currentPeriodEnd,
    cancel_at_period_end: input.cancelAtPeriodEnd,
    updated_at: now,
  };

  const existing = await getSubscription(input.userId);

  if (existing) {
    const { error } = await db.from(TABLE).update(record).eq('user_id', input.userId);
    if (error) throw new Error(error.message ?? 'Failed to update subscription.');
    return;
  }

  const { error } = await db.from(TABLE).insert([{ ...record, created_at: now }]);
  if (error) throw new Error(error.message ?? 'Failed to create subscription.');
}

/**
 * Persist just the Stripe customer id for a user (before a subscription exists),
 * so we can reuse the same customer across checkout sessions and the portal.
 */
export async function ensureCustomerId(
  userId: string,
  customerId: string
): Promise<void> {
  const existing = await getSubscription(userId);
  const db = getAdminClient().database;
  const now = new Date().toISOString();

  if (existing) {
    if (existing.stripe_customer_id === customerId) return;
    const { error } = await db
      .from(TABLE)
      .update({ stripe_customer_id: customerId, updated_at: now })
      .eq('user_id', userId);
    if (error) throw new Error(error.message ?? 'Failed to save customer id.');
    return;
  }

  const { error } = await db.from(TABLE).insert([
    {
      user_id: userId,
      stripe_customer_id: customerId,
      plan: 'free',
      billing_interval: null,
      status: 'free',
      cancel_at_period_end: false,
      created_at: now,
      updated_at: now,
    },
  ]);
  if (error) throw new Error(error.message ?? 'Failed to save customer id.');
}

/** Load the authoritative entitlement for a user (subscription + project count). */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const [sub, projectCount] = await Promise.all([
    getSubscription(userId),
    countUserProjects(userId),
  ]);
  return computeEntitlement(sub, projectCount);
}
