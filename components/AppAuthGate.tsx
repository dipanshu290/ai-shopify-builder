'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export default function AppAuthGate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const isPublicRoute = pathname === '/';

  useEffect(() => {
    if (loading || user || isPublicRoute) return;

    const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    router.replace(`/sign-in${next}`);
  }, [isPublicRoute, loading, pathname, router, user]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#fffdfc] text-[#6b7280]">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Loader2 size={18} className="animate-spin text-[#ff6747]" />
          Redirecting to sign in…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
