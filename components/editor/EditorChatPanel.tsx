'use client';

import { useEffect, useRef, useState } from 'react';
import { AtSign, ArrowUp, Check, Loader2, Paperclip, Plus, Sparkles, SquarePen } from 'lucide-react';
import { useBuilder } from './BuilderContext';

export default function EditorChatPanel() {
  const { messages, pages, isStreaming, generatingPageId, error, sendMessage, newChat } = useBuilder();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const generatingPage = pages.find((p) => p.id === generatingPageId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, generatingPageId]);

  function submit() {
    if (!draft.trim() || isStreaming) return;
    sendMessage(draft);
    setDraft('');
  }

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-r border-[#ece6e2] bg-white">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <button
          onClick={newChat}
          className="flex items-center gap-2 text-[15px] font-semibold text-[#ff6747] transition hover:text-[#f85b3a]"
        >
          <Plus size={18} strokeWidth={2.2} />
          New chat
        </button>
        <button
          aria-label="Edit chat"
          className="grid h-9 w-9 place-items-center rounded-lg border border-[#e8e2de] bg-white text-[#4b5563] transition hover:bg-[#fff8f5]"
        >
          <SquarePen size={16} strokeWidth={1.9} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 pb-6">
        <p className="text-xs font-medium text-[#9aa2af]">Today</p>

        {messages.length === 0 && !isStreaming && (
          <div className="flex gap-3">
            <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#f0e9ff] text-[#8b6df5]">
              <Sparkles size={14} fill="currentColor" strokeWidth={1.5} />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-[#eee7e3] bg-white px-4 py-3 text-sm leading-6 text-[#374151]">
              Describe the storefront you want and I&apos;ll build it page by page.
            </div>
          </div>
        )}

        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-[#fff3ef] px-4 py-3 text-sm leading-6 text-[#111827]">
                  {message.content}
                </div>
              </div>
            );
          }
          return (
            <div key={message.id} className="flex gap-3">
              <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#f0e9ff] text-[#8b6df5]">
                <Sparkles size={14} fill="currentColor" strokeWidth={1.5} />
              </span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-[#eee7e3] bg-white px-4 py-3 text-sm leading-6 text-[#374151]">
                {message.content ? (
                  <span className="whitespace-pre-wrap">{message.content}</span>
                ) : (
                  <span className="inline-flex gap-1 py-1">
                    <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {generatingPage && (
          <div className="rounded-2xl border border-[#eee7e3] bg-[#fffdfc] p-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="grid h-5 w-5 shrink-0 place-items-center text-[#9aa2af]">
                <Loader2 size={15} strokeWidth={2} className="animate-spin" />
              </span>
              <span className="font-medium text-[#374151]">
                Generating the {generatingPage.label}…
              </span>
            </div>
            {generatingPage.html && (
              <p className="mt-2 pl-8 text-xs text-[#9aa2af]">
                Streaming sections into the live preview →
              </p>
            )}
          </div>
        )}

        {pages.some((p) => p.status === 'ready') && !isStreaming && (
          <div className="flex items-center gap-2 pl-9 text-xs font-medium text-[#35b86b]">
            <Check size={13} strokeWidth={2.6} /> Preview updated
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-[#f6d5cd] bg-[#fff4f1] px-4 py-3 text-sm text-[#b4432a]">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-[#f0ebe7] p-4">
        <div className="rounded-2xl border border-[#e8e2de] bg-white p-3 shadow-[0_10px_24px_rgba(31,41,55,0.05)]">
          <textarea
            aria-label="Ask anything about your theme"
            placeholder="Ask anything about your theme..."
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={isStreaming}
            className="w-full resize-none border-0 bg-transparent px-1 py-1 text-sm text-[#111827] outline-none placeholder:text-[#9aa2af] disabled:opacity-60"
          />
          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-1.5">
              <button
                aria-label="AI suggestions"
                className="grid h-9 w-9 place-items-center rounded-lg text-[#6b7280] transition hover:bg-[#fff3ef]"
              >
                <Sparkles size={16} strokeWidth={1.9} />
              </button>
              <button
                aria-label="Mention"
                className="grid h-9 w-9 place-items-center rounded-lg text-[#6b7280] transition hover:bg-[#fff3ef]"
              >
                <AtSign size={16} strokeWidth={1.9} />
              </button>
              <button
                aria-label="Attach file"
                className="grid h-9 w-9 place-items-center rounded-lg text-[#6b7280] transition hover:bg-[#fff3ef]"
              >
                <Paperclip size={16} strokeWidth={1.9} />
              </button>
            </div>
            <button
              aria-label="Send message"
              onClick={submit}
              disabled={isStreaming || !draft.trim()}
              className="grid h-9 w-9 place-items-center rounded-lg bg-[#ff6747] text-white shadow-[0_10px_18px_rgba(255,103,71,0.22)] transition hover:bg-[#f85b3a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStreaming ? (
                <Loader2 size={17} strokeWidth={2.2} className="animate-spin" />
              ) : (
                <ArrowUp size={18} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Dot({ delay = '0ms' }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#c5bfd8]"
      style={{ animationDelay: delay }}
    />
  );
}
