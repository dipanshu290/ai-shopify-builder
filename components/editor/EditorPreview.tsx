'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Check,
  Grid3x3,
  Home,
  Loader2,
  Monitor,
  Pencil,
  RotateCw,
  ShoppingCart,
  Smartphone,
  Tablet,
  Wallet,
  X,
} from 'lucide-react';
import { buildPreviewShell } from '@/lib/ai/sanitize';
import { useBuilder, type PageState } from './BuilderContext';
import type { PageType } from '@/lib/ai/events';

const PAGE_ICONS: Record<PageType, typeof Home> = {
  home: Home,
  product: Box,
  collection: Grid3x3,
  cart: ShoppingCart,
  checkout: Wallet,
  custom: Grid3x3,
};

type Viewport = 'desktop' | 'tablet' | 'mobile';

const VIEWPORTS: { id: Viewport; label: string; icon: typeof Monitor; width: string }[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, width: '100%' },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: '768px' },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: '390px' },
];

const STORE_DOMAIN = 'your-store.myshopify.com';

export default function EditorPreview() {
  const {
    pages,
    activePage,
    activePageId,
    themeCss,
    setActivePage,
    closePage,
    generatingPageId,
    isImageGenerating,
    sendMessage,
    updatePageHtml,
  } = useBuilder();
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const [editMode, setEditMode] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  // The last body HTML we received *from* the iframe (an inline edit). Guards the
  // postBody effect so we never echo an edit straight back and reset the frame.
  const lastSyncedHtmlRef = useRef<string | null>(null);
  const viewportWidth = VIEWPORTS.find((v) => v.id === viewport)?.width ?? '100%';

  // The iframe document is built once (Tailwind loads a single time); content is
  // streamed in via postMessage so live updates never reload the frame.
  const shell = useMemo(() => buildPreviewShell(), []);
  const activeHtml = activePage?.html ?? '';

  const postBody = (html: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'builder:setBody', html }, '*');
  };

  const postTheme = (css: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'builder:setTheme', css }, '*');
  };

  const postEditMode = (enabled: boolean) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'builder:setEditMode', enabled }, '*');
  };

  // Latest values the (mount-once) message listener needs, without re-subscribing.
  const ctxRef = useRef({ activePageId, activeHtml, themeCss, editMode, sendMessage, updatePageHtml });
  useEffect(() => {
    ctxRef.current = { activePageId, activeHtml, themeCss, editMode, sendMessage, updatePageHtml };
  });

  // Single listener for every iframe -> parent message. The iframe owns the
  // preview DOM (sandboxed, no same-origin), so inline edits and AI requests all
  // arrive here as postMessages.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data.type !== 'string') return;
      const ctx = ctxRef.current;

      if (data.type === 'builder:ready') {
        readyRef.current = true;
        postTheme(ctx.themeCss);
        postBody(ctx.activeHtml);
        if (ctx.editMode) postEditMode(true);
      } else if (data.type === 'builder:bodyChanged') {
        // An inline edit was applied inside the preview; persist just this page.
        if (!ctx.activePageId || typeof data.html !== 'string') return;
        lastSyncedHtmlRef.current = ctx.updatePageHtml(ctx.activePageId, data.html);
      } else if (data.type === 'builder:requestAIEdit' || data.type === 'builder:requestAIImage') {
        const isImage = data.type === 'builder:requestAIImage';
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';
        const prompt = typeof data.prompt === 'string' ? data.prompt : '';
        if (!prompt) return;
        ctx.sendMessage(
          isImage
            ? `Update the image in the element with id "${targetId}": ${prompt}`
            : `In the element with id "${targetId}": ${prompt}`,
          { source: isImage ? 'image-edit' : 'chat' }
        );
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Switching pages invalidates the echo guard (each page has its own HTML).
  useEffect(() => {
    lastSyncedHtmlRef.current = null;
  }, [activePageId]);

  useEffect(() => {
    if (!readyRef.current) return;
    // Skip when this HTML is the inline edit we just received from the iframe —
    // re-posting it would wipe the frame's live edit state.
    if (activeHtml === lastSyncedHtmlRef.current) return;
    postBody(activeHtml);
  }, [activeHtml, activePageId]);

  // Push the global stylesheet whenever it changes so every page stays on-theme.
  useEffect(() => {
    if (readyRef.current) postTheme(themeCss);
  }, [themeCss]);

  // Toggle edit mode inside the preview whenever the button flips.
  useEffect(() => {
    if (readyRef.current) postEditMode(editMode);
  }, [editMode]);

  // A manual reload remounts the frame, so it must re-handshake.
  useEffect(() => {
    readyRef.current = false;
  }, [reloadKey]);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#ece6e2] bg-white shadow-[0_10px_30px_rgba(31,41,55,0.05)]">
        {/* Browser tab strip */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#efeae6] bg-[#f4f0ec] px-2 pt-2">
          {pages.length === 0 && (
            <div className="flex h-9 items-center px-3 text-sm text-[#9aa2af]">No pages yet</div>
          )}
          {pages.map((tab) => (
            <PreviewTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activePageId}
              isGenerating={tab.id === generatingPageId}
              onSelect={() => setActivePage(tab.id)}
              onClose={() => closePage(tab.id)}
            />
          ))}
        </div>

        {/* Browser toolbar / address bar */}
        <div className="flex items-center gap-3 border-b border-[#efeae6] bg-white px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#eee7e3] bg-[#faf8f6] px-3 py-1.5">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-[#e8f6ee] text-[9px] font-bold text-[#35b86b]">
              ✓
            </span>
            <span className="truncate text-[13px] text-[#6b7280]">
              {STORE_DOMAIN}
              <span className="text-[#9aa2af]">{activePage?.path ?? '/'}</span>
            </span>
            <button
              aria-label="Reload preview"
              onClick={() => setReloadKey((k) => k + 1)}
              className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#9aa2af] transition hover:bg-black/5 hover:text-[#4b5563]"
            >
              <RotateCw size={14} strokeWidth={2} />
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#eee7e3] bg-white p-0.5">
            {VIEWPORTS.map((v) => {
              const Icon = v.icon;
              const isActive = v.id === viewport;
              return (
                <button
                  key={v.id}
                  aria-label={v.label}
                  aria-pressed={isActive}
                  onClick={() => setViewport(v.id)}
                  className={`grid h-7 w-7 place-items-center rounded-md transition ${isActive
                      ? 'bg-[#fff3ef] text-[#f05a32]'
                      : 'text-[#9aa2af] hover:bg-[#faf8f6] hover:text-[#4b5563]'
                    }`}
                >
                  <Icon size={15} strokeWidth={1.9} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-[#fafafa]">
          <div
            className="relative mx-auto h-full min-h-full overflow-hidden rounded-xl border border-[#ece6e2] bg-white transition-[max-width] duration-300"
            style={{ maxWidth: viewportWidth }}
          >
            {/* Inline-edit toggle — top-right of the preview. */}
            {activePage && activeHtml && (
              <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
                {isImageGenerating && (
                  <div className="flex items-center gap-2 rounded-lg border border-[#ffd7ce] bg-white/95 px-3 py-1.5 text-[13px] font-medium text-[#c0432f] shadow-sm backdrop-blur">
                    <Loader2 size={15} strokeWidth={2.2} className="animate-spin" />
                    Generating image…
                  </div>
                )}
                <button
                  onClick={() => setEditMode((v) => !v)}
                  aria-pressed={editMode}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium shadow-sm transition ${
                    editMode
                      ? 'border-transparent bg-[#f05a32] text-white hover:bg-[#e14a24]'
                      : 'border-[#eee7e3] bg-white/90 text-[#4b5563] backdrop-blur hover:bg-white hover:text-[#111827]'
                  }`}
                >
                  {editMode ? <Check size={15} strokeWidth={2.2} /> : <Pencil size={15} strokeWidth={2} />}
                  {editMode ? 'Done' : 'Edit'}
                </button>
              </div>
            )}

            {activePage ? (
              <iframe
                key={reloadKey}
                ref={iframeRef}
                title={`${activePage.label} preview`}
                srcDoc={shell}
                sandbox="allow-scripts"
                onLoad={() => {
                  // Reliable trigger (independent of the postMessage handshake):
                  // by load, the shell's listener is attached and Tailwind is ready.
                  readyRef.current = true;
                  lastSyncedHtmlRef.current = null;
                  postTheme(themeCss);
                  postBody(activeHtml);
                  if (editMode) postEditMode(true);
                }}
                className="h-full min-h-[320px] w-full border-0"
              />
            ) : (
              <div className="grid h-full min-h-[320px] place-items-center">
                <div className="flex flex-col items-center gap-3 text-center text-[#9aa2af]">
                  {generatingPageId ? (
                    <>
                      <Loader2 size={22} className="animate-spin text-[#ff8a66]" />
                      <p className="text-sm font-medium">Generating your preview…</p>
                    </>
                  ) : (
                    <p className="text-sm font-medium">
                      Your storefront preview will appear here.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Overlay while a page is still empty and generating. */}
            {activePage && !activeHtml && generatingPageId === activePage.id && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white">
                <div className="flex flex-col items-center gap-3 text-center text-[#9aa2af]">
                  <Loader2 size={22} className="animate-spin text-[#ff8a66]" />
                  <p className="text-sm font-medium">Generating your {activePage.label}…</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewTab({
  tab,
  isActive,
  isGenerating,
  onSelect,
  onClose,
}: {
  tab: PageState;
  isActive: boolean;
  isGenerating: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const Icon = PAGE_ICONS[tab.type] ?? Grid3x3;
  return (
    <div
      className={`group flex h-9 min-w-0 max-w-[180px] shrink-0 items-center gap-2 rounded-t-lg px-3 text-sm transition ${isActive
          ? '-mb-px border-x border-t border-[#efeae6] bg-white font-medium text-[#111827]'
          : 'text-[#6b7280] hover:bg-white/60'
        }`}
    >
      <button onClick={onSelect} className="flex min-w-0 items-center gap-2">
        {isGenerating ? (
          <Loader2 size={14} className="animate-spin text-[#f05a32]" />
        ) : (
          <Icon size={15} strokeWidth={1.9} className={isActive ? 'text-[#f05a32]' : 'text-[#9aa2af]'} />
        )}
        <span className="truncate">{tab.label}</span>
      </button>
      <button
        aria-label={`Close ${tab.label}`}
        onClick={onClose}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[#9aa2af] opacity-0 transition hover:bg-black/5 hover:text-[#4b5563] group-hover:opacity-100"
      >
        <X size={13} strokeWidth={2.2} />
      </button>
    </div>
  );
}
