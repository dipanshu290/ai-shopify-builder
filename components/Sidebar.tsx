'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Home, FolderOpen, Lightbulb, CreditCard } from 'lucide-react';
import SidebarUser from './SidebarUser';
import SidebarBilling from './billing/SidebarBilling';

const navigationItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/billing', label: 'Billing', icon: CreditCard },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#e7e2df] bg-white px-5 py-8">
      <Link href="/" className="mb-9 flex items-center gap-3 px-1">
        <Image
          src="/logo.png"
          alt="Shopify Theme Builder"
          width={50}
          height={50}
          className="shrink-0 rounded-lg"
          priority
        />
        <div className="leading-tight">
          <p className="text-base font-bold text-[#111827]">Shopify</p>
          <p className="text-base font-bold text-[#111827]">Theme Builder</p>
        </div>
      </Link>

      <nav className="space-y-3">
        {navigationItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition-colors ${isActive
                ? 'bg-[#fff3ef] text-[#f05a32]'
                : 'text-[#1f2937] hover:bg-[#fff8f5]'
                }`}
            >
              <span className={`grid h-7 w-7 place-items-center rounded-lg ${isActive ? 'bg-white/60' : 'bg-neutral-50'}`}>
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <SidebarBilling />
        <SidebarUser />
      </div>
    </aside>
  );
}
