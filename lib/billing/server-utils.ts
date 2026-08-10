import 'server-only';

/**
 * Resolve the public origin to build Stripe success/cancel/return URLs. Prefers
 * an explicit `NEXT_PUBLIC_APP_URL`, then the request's `origin` header, then a
 * localhost fallback for development.
 */
export function appOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');

  const origin = req.headers.get('origin');
  if (origin) return origin.replace(/\/$/, '');

  return 'http://localhost:3000';
}
