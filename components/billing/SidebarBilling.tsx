'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronsUpDown,
  CreditCard,
  Crown,
  Gauge,
  Loader2,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useSubscription } from './SubscriptionProvider';
import { openBillingPortal } from '@/lib/billing/client';
import { FREE_PROJECT_LIMIT } from '@/lib/billing/plans';
import UpgradeDialog from './UpgradeDialog';

/**
 * Sidebar footer billing block. For Free users it shows project usage with a
 * progress bar and an Upgrade button; for paid users it shows an "Unlimited /
 * Pro Plan" badge. A billing popover exposes View Plan, Manage Billing, Upgrade
 * Plan, and View Usage (product spec §"Sidebar Usage UI" and §"Billing Popover").
 */
export default function SidebarBilling() {
  const { user } = useAuth();
  const { entitlement, loading } = useSubscription();
  const [menuOpen, setMenuOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  // Only relevant to signed-in users.
  if (!user) return null;

  if (loading && !entitlement) {
    return (
      <div className="mt-6 rounded-2xl border border-[#efe9e5] bg-[#fffdfc] p-4">
        <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
        <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-neutral-100" />
      </div>
    );
  }

  const isPaid = entitlement?.isPaid ?? false;
  const projectCount = entitlement?.projectCount ?? 0;
  const maxProjects = entitlement?.maxProjects ?? FREE_PROJECT_LIMIT;
  const remaining = entitlement?.remaining ?? Math.max(0, FREE_PROJECT_LIMIT - projectCount);
  const atLimit = !isPaid && remaining <= 0;
  const pct = isPaid || !maxProjects ? 100 : Math.min(100, Math.round((projectCount / maxProjects) * 100));

  async function manageBilling() {
    if (portalBusy) return;
    setPortalBusy(true);
    try {
      await openBillingPortal();
    } catch {
      setPortalBusy(false);
      // Fall back to the billing page if the portal isn't available yet.
      window.location.assign('/billing');
    }
  }

  return (
    <div className="mt-6" ref={menuRef}>
      {isPaid ? (
        <div className="relative rounded-2xl border border-[#ffe0b8] bg-gradient-to-br from-[#fff7ec] to-[#fff1e3] p-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#f59b14] shadow-sm">
              <Crown size={18} strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#111827]">Unlimited Projects</p>
              <p className="text-xs font-medium text-[#a15c12]">Pro Plan</p>
            </div>
            <button
              type="button"
              aria-label="Billing menu"
              onClick={() => setMenuOpen((o) => !o)}
              className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-[#a15c12] transition hover:bg-white/60"
            >
              <ChevronsUpDown size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#efe9e5] bg-[#fffdfc] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[#111827]">Projects</p>
            <button
              type="button"
              aria-label="Billing menu"
              onClick={() => setMenuOpen((o) => !o)}
              className="grid h-7 w-7 place-items-center rounded-lg text-[#9aa2af] transition hover:bg-[#f6f2ef]"
            >
              <ChevronsUpDown size={15} strokeWidth={2} />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {projectCount} of {maxProjects} used
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#f0eae6]">
            <div
              className={`h-full rounded-full transition-all ${atLimit ? 'bg-[#ef4444]' : 'bg-[#ff6747]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-[#6b7280]">
            {atLimit
              ? 'Upgrade to create more projects'
              : `${remaining} project${remaining === 1 ? '' : 's'} remaining`}
          </p>
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#ff6747] text-[13px] font-semibold text-white shadow-[0_10px_18px_rgba(255,103,71,0.18)] transition hover:bg-[#f85b3a]"
          >
            <Sparkles size={14} fill="currentColor" strokeWidth={1.5} />
            Upgrade
          </button>
        </div>
      )}

      {menuOpen && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-[#eee7e3] bg-white p-1.5 shadow-[0_20px_40px_rgba(31,41,55,0.14)]">
          <Link
            href="/billing"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[#111827] transition hover:bg-[#fff3ef]"
          >
            <CreditCard size={16} strokeWidth={1.9} className="text-[#6b7280]" />
            View Plan
          </Link>
          <button
            type="button"
            onClick={() => void manageBilling()}
            disabled={portalBusy}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#111827] transition hover:bg-[#fff3ef] disabled:opacity-60"
          >
            {portalBusy ? (
              <Loader2 size={16} className="animate-spin text-[#6b7280]" />
            ) : (
              <Receipt size={16} strokeWidth={1.9} className="text-[#6b7280]" />
            )}
            Manage Billing
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setUpgradeOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#111827] transition hover:bg-[#fff3ef]"
          >
            <Sparkles size={16} strokeWidth={1.9} className="text-[#ff6747]" />
            Upgrade Plan
          </button>
          <Link
            href="/billing#usage"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[#111827] transition hover:bg-[#fff3ef]"
          >
            <Gauge size={16} strokeWidth={1.9} className="text-[#6b7280]" />
            View Usage
          </Link>
        </div>
      )}

      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
