'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components';
import { Settings } from 'lucide-react';

export default function Header() {
  return (
    <header className="fixed top-0 right-0 left-0 border-b border-neutral-200 bg-white z-40">
      <div className="flex items-center justify-between px-6 h-16">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Shopify Theme Builder"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <div className="flex flex-col">
              <p className="text-sm font-semibold text-neutral-900">Shopify</p>
              <p className="text-xs text-neutral-600">Theme Builder</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
            <Settings size={20} className="text-neutral-600" />
          </button>
          <Button variant="ghost" size="md">
            Sign in
          </Button>
          <Button variant="primary" size="md">
            Sign up
          </Button>
        </div>
      </div>
    </header>
  );
}
