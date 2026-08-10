'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell, GoogleButton, Input, Button, useAuth } from '@/components';
import { insforge } from '@/lib/insforge';

const PASSWORD_MIN_LENGTH = 6;

type Step = 'form' | 'verify';

interface SignUpResult {
  accessToken?: string | null;
  requireEmailVerification?: boolean;
}

export default function SignUpPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const finishSignedIn = async () => {
    await refresh();
    router.push('/');
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await insforge.auth.signUp({
      email: email.trim(),
      password,
      name: name.trim(),
      redirectTo: `${window.location.origin}/sign-in`,
    });

    if (signUpError) {
      setError(signUpError.message ?? 'Unable to create your account.');
      setLoading(false);
      return;
    }

    // The account (and its profile row, via a DB trigger) now exists. If a
    // session was returned, verification is off — go straight in. Otherwise
    // collect the 6-digit code InsForge just emailed.
    const result = (data ?? {}) as SignUpResult;
    if (result.accessToken) {
      await finishSignedIn();
      return;
    }

    setNotice(`We sent a 6-digit verification code to ${email.trim()}.`);
    setStep('verify');
    setLoading(false);
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: verifyError } = await insforge.auth.verifyEmail({
      email: email.trim(),
      otp: code.trim(),
    });

    if (verifyError) {
      setError(verifyError.message ?? 'Invalid or expired code.');
      setLoading(false);
      return;
    }

    // Some backends return a session on verify; if not, sign in with the
    // credentials we already have.
    const result = (data ?? {}) as SignUpResult;
    if (!result.accessToken) {
      const { error: signInError } = await insforge.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError('Email verified. Please sign in to continue.');
        setLoading(false);
        router.push('/sign-in');
        return;
      }
    }

    await finishSignedIn();
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    const { error: resendError } = await insforge.auth.resendVerificationEmail({
      email: email.trim(),
      redirectTo: `${window.location.origin}/sign-in`,
    });
    setNotice(
      resendError
        ? null
        : `We sent a new code to ${email.trim()}.`
    );
    if (resendError) setError(resendError.message ?? 'Could not resend the code.');
  };

  if (step === 'verify') {
    return (
      <AuthShell
        title="Verify your email"
        subtitle="Enter the 6-digit code we emailed you to finish setting up your account."
        footer={
          <button
            type="button"
            onClick={() => setStep('form')}
            className="font-semibold text-primary-600 hover:underline"
          >
            Use a different email
          </button>
        }
      >
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          {notice && (
            <p className="rounded-base bg-primary-100 px-3 py-2 text-sm text-primary-600">
              {notice}
            </p>
          )}
          <Input
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />

          {error && (
            <p className="rounded-base bg-[#fef2f2] px-3 py-2 text-sm text-error">{error}</p>
          )}

          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? 'Verifying…' : 'Verify & continue'}
          </Button>

          <button
            type="button"
            onClick={handleResend}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
          >
            Didn&apos;t get a code? Resend
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start generating production-ready Shopify themes with AI."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-semibold text-primary-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" />

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-neutral-100" />
        <span className="text-xs text-neutral-500">or</span>
        <span className="h-px flex-1 bg-neutral-100" />
      </div>

      <form onSubmit={handleSignUp} className="flex flex-col gap-4">
        <Input
          label="Full name"
          type="text"
          autoComplete="name"
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
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
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helperText={`Minimum ${PASSWORD_MIN_LENGTH} characters.`}
          required
        />

        {error && (
          <p className="rounded-base bg-[#fef2f2] px-3 py-2 text-sm text-error">{error}</p>
        )}

        <Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
