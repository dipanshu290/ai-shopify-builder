'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell, GoogleButton, Input, Button, useAuth } from '@/components';
import { insforge } from '@/lib/insforge';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await insforge.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message ?? 'Unable to sign in. Please try again.');
      setLoading(false);
      return;
    }

    await refresh();
    const next = searchParams.get('next');
    router.push(next && next.startsWith('/') ? next : '/');
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep building your Shopify themes."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="font-semibold text-primary-600 hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <GoogleButton label="Continue with Google" />

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-neutral-100" />
        <span className="text-xs text-neutral-500">or</span>
        <span className="h-px flex-1 bg-neutral-100" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="rounded-base bg-[#fef2f2] px-3 py-2 text-sm text-error">{error}</p>
        )}

        <Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}

// `useSearchParams` opts the page out of static prerendering unless it sits
// behind a Suspense boundary, so keep the form in its own subtree.
export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          title="Welcome back"
          subtitle="Sign in to keep building your Shopify themes."
          footer={null}
        >
          <div className="h-64 animate-pulse rounded-base bg-neutral-100" />
        </AuthShell>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
