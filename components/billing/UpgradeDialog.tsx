'use client';

import { useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { PAID_PLANS, formatPrice } from '@/lib/billing/plans';
import { startCheckout } from '@/lib/billing/client';

/**
 * Reusable upgrade modal shown when a Free user hits the project limit or tries
 * to export. Presents the Monthly and Yearly plans and starts Stripe Checkout
 * for the chosen one. Purely presentational beyond the checkout call.
 */
interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export default function UpgradeDialog({
  open,
  onClose,
  title = 'Upgrade to unlock more',
  description = 'You’re on the Free plan. Upgrade to create unlimited projects and export Shopify themes.',
}: UpgradeDialogProps) {
  const [busy, setBusy] = useState<null | 'monthly' | 'yearly'>(null);
  const [error, setError] = useState('');

  if (!open) return null;

  async function choose(plan: 'monthly' | 'yearly') {
    if (busy) return;
    setError('');
    setBusy(plan);
    try {
      await startCheckout(plan);
      // On success the browser navigates to Stripe; nothing else to do.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#eee7e3] bg-white shadow-[0_32px_64px_rgba(31,41,55,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#f1ebe7] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#fff3ef] text-[#ff6747]">
              <Sparkles size={20} fill="currentColor" strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#111827]">{title}</h2>
              <p className="mt-0.5 text-sm text-[#6b7280]">{description}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy !== null}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9aa2af] transition hover:bg-[#f6f2ef] hover:text-[#111827] disabled:opacity-40"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          {PAID_PLANS.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col rounded-2xl border border-[#eee7e3] bg-[#fffdfc] p-5"
            >
              <div className="mb-3">
                <p className="text-sm font-semibold text-[#111827]">{plan.name}</p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-[#111827]">
                    {formatPrice(plan.amount, plan.currency)}
                  </span>
                  <span className="text-sm text-[#6b7280]">/{plan.interval}</span>
                </p>
                <p className="mt-0.5 text-xs text-[#9aa2af]">{plan.tagline}</p>
              </div>
              <ul className="mb-5 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[13px] text-[#4b5563]">
                    <Check size={15} strokeWidth={2.4} className="mt-0.5 shrink-0 text-[#35b86b]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void choose(plan.id as 'monthly' | 'yearly')}
                disabled={busy !== null}
                className="mt-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6747] text-sm font-semibold text-white shadow-[0_12px_22px_rgba(255,103,71,0.2)] transition hover:bg-[#f85b3a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === plan.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  `Choose ${plan.name}`
                )}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="px-6 pb-5 text-center text-sm font-medium text-[#ef4444]">{error}</p>
        )}
      </div>
    </div>
  );
}
