'use client';

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUp,
  Box,
  Grid3x3,
  LayoutTemplate,
  Loader2,
  Plus,
  Settings,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { AuthButtons, useAuth } from "@/components";
import { createProject, ProjectLimitError } from "@/lib/projects";
import { useSubscription } from "@/components/billing/SubscriptionProvider";
import UpgradeDialog from "@/components/billing/UpgradeDialog";

const templateCards = [
  {
    icon: LayoutTemplate,
    title: "Create a landing page",
    desc: "High-converting hero section with modern design",
    color: "bg-[#fff0ec]",
    iconColor: "text-[#ff6b47]",
    prompt:
      "Create a high-converting landing page for my Shopify store with a modern hero section, featured products, and a strong call to action.",
  },
  {
    icon: Box,
    title: "Build product page",
    desc: "Beautiful product showcase that drives sales",
    color: "bg-[#f0e9ff]",
    iconColor: "text-[#8b6df5]",
    prompt:
      "Build a beautiful Shopify product page with a large gallery, product details, variant selectors, and related products.",
  },
  {
    icon: ShoppingCart,
    title: "Design cart page",
    desc: "Streamlined cart experience that boosts checkout",
    color: "bg-[#eaffef]",
    iconColor: "text-[#35b86b]",
    prompt:
      "Design a streamlined Shopify cart page with clear line items, order summary, and a prominent checkout button.",
  },
  {
    icon: Grid3x3,
    title: "Explore collection page",
    desc: "Display your products in stunning collections",
    color: "bg-[#fff7e7]",
    iconColor: "text-[#f59b14]",
    prompt:
      "Create a Shopify collection page with a responsive product grid, filters, sorting, and a clean header.",
  },
];

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { entitlement, refresh: refreshEntitlement } = useSubscription();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  async function startProject(rawPrompt: string) {
    const trimmed = rawPrompt.trim();
    if (!trimmed || submitting) return;

    if (!authLoading && !user) {
      router.push("/sign-in");
      return;
    }

    // Fast-path: if we already know the Free limit is reached, show the upgrade
    // dialog without a round-trip. The server still enforces this authoritatively.
    if (entitlement && !entitlement.canCreateProject) {
      setUpgradeOpen(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject(trimmed);
      router.push(`/editor/${project.id}`);
    } catch (err) {
      if (err instanceof ProjectLimitError) {
        // Server rejected creation — surface the upgrade dialog and resync usage.
        setUpgradeOpen(true);
        void refreshEntitlement();
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void startProject(prompt);
  }

  function applySuggestion(nextPrompt: string) {
    setPrompt(nextPrompt);
    setError(null);
    promptRef.current?.focus();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fffdfc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_24%,rgba(255,116,82,0.12),transparent_24%),radial-gradient(circle_at_32%_33%,rgba(125,158,255,0.12),transparent_26%),linear-gradient(135deg,rgba(247,250,255,0.86)_0%,rgba(255,245,241,0.9)_52%,rgba(255,255,255,0.98)_100%)]" />
      <div className="pointer-events-none absolute right-0 top-28 h-64 w-64 rounded-l-full bg-[#f6eefc]/80 blur-2xl" />

      <div className="relative mx-auto flex min-h-screen max-w-[960px] flex-col px-8 py-8">
        <div className="mb-10 flex justify-end gap-3">
          <button
            aria-label="Settings"
            className="grid h-10 w-10 place-items-center rounded-xl border border-[#e8e2de] bg-white text-[#111827] shadow-[0_10px_24px_rgba(31,41,55,0.04)] transition hover:bg-[#fff8f5]"
          >
            <Settings size={18} strokeWidth={1.8} />
          </button>
          <AuthButtons />
        </div>

        <section className="mx-auto w-full max-w-[780px]">
          <div className="mb-6 text-center">
            <h1 className="text-[42px] font-bold leading-[1.18] tracking-normal text-[#111827]">
              Build stunning Shopify themes
              <br className="hidden sm:block" />
              {" "}with the power of <span className="text-[#ff6747]">AI</span>{" "}
              <Sparkles className="mb-1 inline-block text-[#ff8a66]" size={26} fill="currentColor" strokeWidth={1.5} />
            </h1>
            <p className="mt-5 text-base leading-7 text-[#4b5563]">
              Describe a page, pick a starting point, or get inspired.
              <br />
              I&apos;ll generate a fully editable Shopify template for you.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-[#e8e2de] bg-white p-4 shadow-[0_18px_40px_rgba(31,41,55,0.07)]"
          >
            <textarea
              ref={promptRef}
              aria-label="Describe a Shopify page or theme"
              placeholder="Ask me to build a Shopify page or theme..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void startProject(prompt);
                }
              }}
              disabled={submitting}
              className="h-[82px] w-full resize-none border-0 bg-transparent px-2 py-2 text-base text-[#111827] outline-none placeholder:text-[#7b8492] disabled:opacity-60"
            />
            <div className="flex items-end justify-between">
              <div className="flex gap-2">

                <button type="button" aria-label="Mention" className="grid h-10 w-11 place-items-center rounded-xl border border-[#e8e2de] bg-white text-[#4b5563] transition hover:bg-[#fff8f5]">
                  <Plus size={16} strokeWidth={1.8} />
                </button>
              </div>
              <button
                type="submit"
                aria-label="Submit prompt"
                disabled={submitting || !prompt.trim()}
                className="grid h-11 w-11 place-items-center rounded-xl bg-[#ff6747] text-white shadow-[0_12px_22px_rgba(255,103,71,0.2)] transition hover:bg-[#f85b3a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 size={20} strokeWidth={2.2} className="animate-spin" />
                ) : (
                  <ArrowUp size={22} strokeWidth={2} />
                )}
              </button>
            </div>
          </form>

          {error && (
            <p className="mt-3 text-center text-sm font-medium text-[#ef4444]">{error}</p>
          )}
          <div className="mb-7" />

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {templateCards.map((card) => {
              const IconComponent = card.icon;
              return (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => applySuggestion(card.prompt)}
                  disabled={submitting}
                  className="group flex min-h-[100px] items-center justify-between gap-4 rounded-2xl border border-[#eee7e3] bg-white p-4 text-left shadow-[0_10px_24px_rgba(31,41,55,0.035)] transition hover:border-[#ffd4c7] hover:shadow-[0_16px_32px_rgba(31,41,55,0.06)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-center gap-4">
                    <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-xl ${card.color}`}>
                      <IconComponent size={30} className={card.iconColor} strokeWidth={1.8} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold leading-6 text-[#111827]">{card.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-[#5f6673]">{card.desc}</p>
                    </div>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#eee7e3] text-[#111827] transition group-hover:translate-x-1 group-hover:border-[#ffb8a6] group-hover:text-[#ff6747]">
                    <ArrowRight size={19} strokeWidth={1.8} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative overflow-hidden items-center flex rounded-2xl border border-[#ffe2dc] bg-[#fff1ec] px-6 py-6 shadow-[0_10px_24px_rgba(31,41,55,0.035)]">
            <div className="relative z-10 flex items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-[#ff6747] shadow-[0_12px_24px_rgba(255,103,71,0.1)]">
                <Sparkles size={26} fill="currentColor" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-base font-bold leading-6 text-[#111827]">
                  From idea to live store
                </h2>
                <p className="mt-1 text-sm leading-5 text-[#5f6673]">
                  Generate, customize, and export production-ready themes in minutes.
                </p>
              </div>
            </div>
            <Image
              src="/shopify-logo.png"
              alt="Shopify preview"
              width={170}
              height={120}
              className="absolute bottom-0 right-10 hidden h-auto w-[80px] opacity-90 md:block"
            />
          </div>
        </section>
      </div>

      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="You’ve reached your project limit"
        description="The Free plan includes 2 projects. Upgrade to create unlimited projects and export Shopify themes."
      />
    </div>
  );
}
