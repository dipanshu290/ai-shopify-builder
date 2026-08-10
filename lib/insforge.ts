import { createClient } from '@insforge/sdk';

/**
 * Browser-safe InsForge client (singleton).
 *
 * Uses the public base URL plus the PUBLISHABLE anon key. The anon key is safe
 * to ship in browser code only because access is guarded by Postgres RLS (see
 * the `profiles` policies). Do NOT put the `ik_` admin key from
 * `.insforge/project.json` here — it bypasses RLS and would leak all user data.
 * User-scoped access is authorized by the signed-in user's JWT, which the SDK
 * attaches automatically after sign in.
 */
const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

if (!baseUrl) {
  throw new Error(
    'NEXT_PUBLIC_INSFORGE_URL is not set. Add it to .env.local (see AGENTS.md).'
  );
}

if (!anonKey) {
  throw new Error(
    'NEXT_PUBLIC_INSFORGE_ANON_KEY is not set. Copy the publishable anon key ' +
      'from your InsForge dashboard into .env.local.'
  );
}

export const insforge = createClient({ baseUrl, anonKey });
