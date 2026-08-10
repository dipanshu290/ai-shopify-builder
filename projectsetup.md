# Project Setup

This guide walks through the full local setup for the AI Shopify Theme Builder, including environment variables, InsForge provisioning, optional billing, Shopify export storage, and project thumbnails.

## 1. Prerequisites

- Node.js 20 or newer
- npm
- An InsForge project
- A Gemini API key
- Optional: ImageKit account
- Optional: Stripe account

## 2. Install dependencies

```bash
npm install
```

## 3. Create local environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Then update `.env.local`.

### Required for core app usage

```bash
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=
```

### Optional but recommended

```bash
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET=theme-exports
NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET=project-thumbnails
```

### Required for billing flows

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
INSFORGE_ADMIN_KEY=
```

## 4. InsForge setup

### Public client values

Add these from your InsForge project:

- `NEXT_PUBLIC_INSFORGE_URL`: your InsForge API base URL
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`: your publishable anon key

### Admin key

For billing webhooks and server-enforced project limits, copy the `api_key` from `.insforge/project.json` into:

```bash
INSFORGE_ADMIN_KEY=
```

Keep this server-only. Never expose it to browser code.

## 5. AI provider setup

The app reads the active provider and model from environment variables.

Current supported provider in code:

- `AI_PROVIDER=gemini`

Recommended default:

```bash
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your_key_here
```

## 6. ImageKit setup

ImageKit is optional. If it is not configured, the app falls back gracefully for image placeholders.

Set:

```bash
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_imagekit_id
```

This project only needs the public delivery endpoint for current frontend image generation and transformation URL building. Do not expose private ImageKit credentials in the browser.

## 7. Billing setup

Billing requires Stripe and InsForge admin access.

Read and complete:

- [docs/billing-setup.md](./docs/billing-setup.md)

That includes:

- creating the `subscriptions` table
- configuring Stripe webhook events
- enabling the Stripe customer portal
- setting `STRIPE_SECRET_KEY`
- setting `STRIPE_WEBHOOK_SECRET`
- setting `INSFORGE_ADMIN_KEY`

## 8. Shopify export setup

To enable export downloads, complete:

- [docs/shopify-export-setup.md](./docs/shopify-export-setup.md)

That provisions:

- a public InsForge storage bucket, default `theme-exports`
- the `theme_exports` table

If you use a custom bucket name, set:

```bash
NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET=your-bucket-name
```

## 9. Project thumbnail setup

To enable dashboard preview thumbnails, complete:

- [docs/projects-thumbnails-setup.md](./docs/projects-thumbnails-setup.md)

That provisions:

- a public InsForge storage bucket, default `project-thumbnails`
- `thumbnail_url` and `thumbnail_key` columns on `projects`

If you use a custom bucket name, set:

```bash
NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET=your-bucket-name
```

## 10. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## 11. Validation commands

Run the available checks:

```bash
npm run lint
```

Also useful:

```bash
npm run build
```

## 12. Recommended manual test flow

After setup, verify these paths:

1. Sign up or sign in.
2. Create a project from a prompt.
3. Confirm the editor opens.
4. Trigger AI generation and verify streamed output appears in preview.
5. Confirm the projects page loads existing projects.
6. If ImageKit is configured, verify generated/transformed image URLs use your ImageKit endpoint.
7. If billing is configured, verify checkout and portal routes work.
8. If Shopify export is configured, verify an export record and downloadable file are created.
9. If thumbnails are configured, verify project cards eventually show a saved preview image.

## 13. Current scripts

From `package.json`:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

`typecheck` and `test` are not currently defined as npm scripts, so they are not included in the verification section yet.
