import type { BillingInterval, PlanId } from './plans';

/**
 * Billing domain types shared by client and server. The `Subscription` shape
 * mirrors the `subscriptions` table (see docs/billing-setup.md) one-to-one.
 */

/**
 * Subscription lifecycle status. Mirrors Stripe's subscription statuses plus a
 * local `free` value for users who have never paid (no Stripe subscription).
 */
export type SubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

/** A row of the `subscriptions` table. */
export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: PlanId;
  billing_interval: BillingInterval | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Computed access rights for the current user, derived from their subscription
 * plus live project count. This is the authoritative shape the UI consumes; it
 * is always produced server-side and never trusts client-supplied values.
 */
export interface Entitlement {
  plan: PlanId;
  status: SubscriptionStatus;
  isPaid: boolean;
  /** Max projects allowed (Infinity for paid plans). */
  maxProjects: number;
  /** Current number of projects the user owns. */
  projectCount: number;
  /** Projects the user can still create (0 when at/over the limit). */
  remaining: number;
  /** Whether the user may create another project right now. */
  canCreateProject: boolean;
  /** Whether Shopify export is available. */
  canExport: boolean;
  /** ISO date the current period ends / renews, when on a paid plan. */
  currentPeriodEnd: string | null;
  /** Whether the subscription is set to cancel at period end. */
  cancelAtPeriodEnd: boolean;
}
