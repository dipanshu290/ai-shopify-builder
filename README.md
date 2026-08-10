# AI Shopify Theme Builder

AI Shopify Theme Builder is a Next.js app for generating Shopify storefront concepts from prompts, previewing them in real time, editing sections inline, and exporting the result into Shopify-friendly theme assets.

## Requirements

- Node.js 20 or newer
- npm
- An InsForge project
- A Gemini API key
- Optional: an ImageKit account
- Optional: a Stripe account

## Install

```bash
npm install
```

## Create `.env.local`

Create the local environment file:

```bash
cp .env.example .env.local
```

Then fill in the values below.

### Required keys

```bash
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Optional keys

```bash
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
INSFORGE_ADMIN_KEY=
NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET=theme-exports
NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET=project-thumbnails
```

## How To Get Each API Key

### InsForge public keys

Get these from your InsForge project dashboard:

- `NEXT_PUBLIC_INSFORGE_URL`: your project API base URL
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`: your browser-safe publishable anon key

These are safe for client-side use and are required for authentication and app data access.

### InsForge admin key

Use this only for server-side features like billing webhooks and enforced project limits:

- `INSFORGE_ADMIN_KEY`

Get it from your local InsForge project config or InsForge admin/project settings. Keep it server-only and never expose it in browser code.

### Gemini API key

Create or copy your Gemini key from Google AI Studio, then set:

- `GEMINI_API_KEY`

Recommended defaults:

```bash
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
```

### ImageKit endpoint

If you want ImageKit-backed image delivery and transforms, copy your public URL endpoint from the ImageKit dashboard:

- `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`

Example:

```bash
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_imagekit_id
```

### Stripe keys

Needed only if you want billing flows locally:

- `STRIPE_SECRET_KEY`: from Stripe Developers -> API keys
- `STRIPE_WEBHOOK_SECRET`: from your Stripe webhook endpoint signing secret

## Run Locally

Start the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Local Run Steps

1. Install dependencies with `npm install`.
2. Create `.env.local` from `.env.example`.
3. Add your InsForge URL and anon key.
4. Add `AI_PROVIDER`, `AI_MODEL`, and `GEMINI_API_KEY`.
5. Optionally add ImageKit, Stripe, and InsForge admin values.
6. Run `npm run dev`.
7. Open `http://localhost:3000`.
8. Sign in or sign up.
9. Create a project and test generation.

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Setup Guides

For full backend provisioning and feature setup, see:

- [projectsetup.md](./projectsetup.md)
- [docs/billing-setup.md](./docs/billing-setup.md)
- [docs/shopify-export-setup.md](./docs/shopify-export-setup.md)
- [docs/projects-thumbnails-setup.md](./docs/projects-thumbnails-setup.md)
