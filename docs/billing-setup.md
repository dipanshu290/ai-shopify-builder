# Billing & subscriptions setup (Stripe + InsForge)

This wires up the subscription system: Free / Monthly ($9.99) / Yearly ($99.99)
plans, Stripe Checkout, the Customer Portal, webhooks, and server-enforced
project limits. Complete these one-time steps before the feature works.

## 1. Create the `subscriptions` table (InsForge)

Run this SQL in the InsForge dashboard (SQL editor) or via `insforge` CLI. One
row per user; only the user can read their own row, and only the service key
(webhook / server routes) can write it.

```sql
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free',
  billing_interval text,
  status text not null default 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

-- Users may read ONLY their own subscription. No client insert/update/delete:
-- all writes go through the server (admin key) in the Stripe webhook.
create policy "read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);
```

> The webhook and server routes use the InsForge **admin** key, which bypasses
> RLS, so no write policies are needed for anon/authenticated roles.

The existing `projects` table is unchanged — the project-limit check counts rows
there server-side.

## 2. Stripe dashboard

1. Grab your **Secret key** (`sk_test_…`) from Developers → API keys.
2. Create a **webhook endpoint** pointing at `https://<your-domain>/api/billing/webhook`
   and subscribe to these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   Copy the endpoint's **Signing secret** (`whsec_…`).
3. Enable the **Customer Portal** (Settings → Billing → Customer portal) so
   "Manage Billing" works.

We do **not** create Products or Prices in Stripe — plan name, interval, and
amount are sent inline as `price_data` from `lib/billing/plans.ts`.

## 3. Environment variables (`.env.local`, server-only)

```bash
# Stripe — never expose these to the browser (no NEXT_PUBLIC_ prefix).
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# InsForge admin (service) key — the `api_key` from .insforge/project.json.
# Server-only: bypasses RLS, used by the webhook and project-limit routes.
INSFORGE_ADMIN_KEY=ik_xxx

# Public base URL used for Stripe success/cancel/return URLs.
# Optional in dev (falls back to the request origin / http://localhost:3000).
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 4. Local webhook testing

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET, then:
stripe trigger checkout.session.completed
```

## 5. How enforcement works

- **Project limit** — creation goes through `POST /api/projects`, which verifies
  the user's token, computes their entitlement (subscription + live project
  count), and rejects Free users at 2 projects with HTTP 402. The client maps
  402 to an upgrade dialog. The browser cannot bypass this.
- **Shopify export** — gated in the editor by the server-provided entitlement
  (`canExport`); Free users see the upgrade dialog instead of the export flow.
- **Sync** — the webhook mirrors every Stripe subscription change into the
  `subscriptions` table, so permissions update automatically after checkout,
  renewal, cancellation, or a failed payment.
