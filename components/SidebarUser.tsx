'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';

/** Two-letter initials for the avatar fallback, derived from name or email. */
function getInitials(name: string | null | undefined, email: string): string {
  const source = (name?.trim() || email.split('@')[0] || '').trim();
  if (!source) return '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Sidebar footer identity block. Shows the signed-in user's avatar, name, and
 * email with a sign-out action; falls back to a prompt when signed out.
 */
export default function SidebarUser() {
  const { user, loading, signOut } = useAuth();
  const [imageFailed, setImageFailed] = useState(false);

  if (loading) {
    return (
      <div className="mt-auto border-t border-[#ece6e2] px-1 pt-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-neutral-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
            <div className="h-2.5 w-32 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mt-auto border-t border-[#ece6e2] px-1 pt-6">
        <p className="mb-3 text-sm leading-6 text-[#6b7280]">
          Sign in to save your themes and generation history.
        </p>
        <Link
          href="/sign-in"
          className="grid h-10 place-items-center rounded-xl bg-[#ff6747] text-[15px] font-medium text-white shadow-[0_12px_22px_rgba(255,103,71,0.18)] transition hover:bg-[#f85b3a]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const displayName = user.name || user.email.split('@')[0];
  const showImage = user.avatarUrl && !imageFailed;

  return (
    <div className="mt-auto border-t border-[#ece6e2] px-1 pt-6">
      <div className="flex items-center gap-3 rounded-xl px-1 py-1">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary OAuth hosts; <img> avoids remotePatterns config.
          <img
            src={user.avatarUrl as string}
            alt={displayName}
            width={40}
            height={40}
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fff3ef] text-sm font-semibold text-[#f05a32]">
            {getInitials(user.name, user.email)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#111827]">
            {displayName}
          </p>
          <p className="truncate text-xs text-[#6b7280]">{user.email}</p>
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#fff3ef] hover:text-[#f05a32]"
        >
          <LogOut size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
