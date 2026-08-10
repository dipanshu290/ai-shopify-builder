/**
 * Subscription plan catalog — the single source of truth for what each plan
 * costs and what it unlocks. Safe to import from both client and server: it
 * contains NO secrets (AGENTS.md §15). Prices are defined inline here and passed
 * straight to Stripe Checkout as `price_data`; we deliberately do NOT use
 * predefined Stripe Price IDs so the plan/interval/amount all live in code.
 */

/** Selectable plan identifiers stored in the `subscriptions.plan` column. */
export type PlanId = 'free' | 'monthly' | 'yearly';

/** Stripe recurring interval, stored in `subscriptions.billing_interval`. */
export type BillingInterval = 'month' | 'year';

/** Project ceiling for the Free plan (AGENTS.md product spec). */
export const FREE_PROJECT_LIMIT = 2;

/** Sentinel for "no limit" so callers can compare against a real number. */
export const UNLIMITED = Number.POSITIVE_INFINITY;

export interface PlanDefinition {
  id: PlanId;
  /** Human label shown in pricing cards and the sidebar. */
  name: string;
  /** Price in the smallest currency unit (cents) charged per interval. */
  amount: number;
  currency: string;
  /** Recurring interval, or null for the free plan. */
  interval: BillingInterval | null;
  /** Max projects this plan allows; `UNLIMITED` for paid plans. */
  maxProjects: number;
  /** Whether Shopify theme export is available on this plan. */
  canExport: boolean;
  /** Marketing bullet points for the pricing cards. */
  features: string[];
  tagline: string;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    amount: 0,
    currency: 'usd',
    interval: null,
    maxProjects: FREE_PROJECT_LIMIT,
    canExport: false,
    tagline: 'Explore the builder',
    features: [
      `Up to ${FREE_PROJECT_LIMIT} projects`,
      'AI page generation',
      'Inline editing & revisions',
      'Live sandboxed preview',
    ],
  },
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    amount: 999, // $9.99
    currency: 'usd',
    interval: 'month',
    maxProjects: UNLIMITED,
    canExport: true,
    tagline: 'Billed monthly',
    features: [
      'Unlimited projects',
      'Export to Shopify theme (ZIP)',
      'All premium features',
      'Priority generation',
    ],
  },
  yearly: {
    id: 'yearly',
    name: 'Yearly',
    amount: 9999, // $99.99 (2 months free vs. monthly)
    currency: 'usd',
    interval: 'year',
    maxProjects: UNLIMITED,
    canExport: true,
    tagline: 'Billed yearly · save ~17%',
    features: [
      'Unlimited projects',
      'Export to Shopify theme (ZIP)',
      'All premium features',
      'Priority generation',
    ],
  },
};

/** The two paid plans, in display order. */
export const PAID_PLANS: PlanDefinition[] = [PLANS.monthly, PLANS.yearly];

/** A plan is "paid" when it isn't the free tier. */
export function isPaidPlan(plan: PlanId): boolean {
  return plan !== 'free';
}

export function getPlan(plan: PlanId): PlanDefinition {
  return PLANS[plan];
}

/** Format a plan amount (in cents) as e.g. "$9.99". */
export function formatPrice(amountInCents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: amountInCents % 100 === 0 ? 0 : 2,
  }).format(amountInCents / 100);
}
