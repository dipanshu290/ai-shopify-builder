import { NextRequest } from 'next/server';
import { getAIProvider } from '@/lib/ai';
import { aiRequestSchema } from '@/lib/ai/schema';
import { sanitizeGeneratedHtml, sanitizeThemeCss } from '@/lib/ai/sanitize';
import { sanitizePatchOperations } from '@/lib/ai/patch';
import { encodeEvent, type AIStreamEvent, type BuilderPage } from '@/lib/ai/events';

export const runtime = 'nodejs';

/**
 * Thin streaming route handler (AGENTS.md §5: route handlers stay thin — no AI
 * or business logic here). It validates input, delegates to the active AI
 * provider, and streams NDJSON events back to the builder client.
 */
export async function POST(req: NextRequest) {
  const parsed = aiRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { messages, pages, activePageId, activePageHtml, theme } = parsed.data;

  let provider;
  try {
    provider = getAIProvider();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'AI provider unavailable.' },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  const abort = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AIStreamEvent) => controller.enqueue(encoder.encode(encodeEvent(event)));

      try {
        // Phase 1 — decide what to say and whether to build one page.
        const plan = await provider.planTurn({
          messages,
          existingPages: pages,
          activePageId,
          abortSignal: abort,
        });

        send({ type: 'message', text: plan.reply });

        if (plan.plannedPages.length > 0) {
          send({ type: 'plan', pages: plan.plannedPages });
        }

        // The open page, if we were given its current HTML — the only page we can
        // apply a scoped edit to this turn.
        const openPage = activePageId ? pages.find((p) => p.id === activePageId) ?? null : null;
        const canEdit = plan.action === 'edit_page' && openPage != null && !!activePageHtml;

        // The project's shared style guide keeps every page on one design system.
        let styleGuide = theme?.styleGuide ?? null;

        if (canEdit && openPage) {
          // Phase 2a — scoped edit: change only the requested pieces of the open
          // page instead of regenerating it.
          const patch = await provider.editPage({
            page: openPage,
            html: activePageHtml as string,
            styleGuide,
            messages,
            abortSignal: abort,
          });
          if (patch.operations.length > 0) {
            send({
              type: 'page_patch',
              pageId: openPage.id,
              operations: sanitizePatchOperations(patch.operations),
            });
          }
        } else {
          // Phase 2b — generate exactly one page, if requested. An `edit_page`
          // with no usable HTML falls back to a full generation of the open page.
          const target: BuilderPage | null | undefined =
            plan.action === 'generate_page'
              ? plan.targetPage ?? plan.plannedPages[0] ?? null
              : plan.action === 'edit_page'
                ? plan.targetPage ?? openPage ?? null
                : null;

          if (target) {
            // Ensure the project has ONE global theme before its first page, so
            // every page shares the same design, colours, logo, and components.
            if (!theme) {
              try {
                const generated = await provider.generateTheme({ messages, abortSignal: abort });
                styleGuide = generated.styleGuide;
                send({ type: 'theme', css: sanitizeThemeCss(generated.css), styleGuide: generated.styleGuide });
              } catch {
                // Non-fatal — fall back to generating the page without a shared theme.
              }
            }

            const siblingPages = plan.plannedPages.length > 0 ? plan.plannedPages : pages;
            send({ type: 'page_start', page: target });
            let html = '';
            for await (const chunk of provider.streamPage({ page: target, siblingPages, styleGuide, messages, abortSignal: abort })) {
              if (abort.aborted) break;
              html += chunk;
              // Stream the small incremental chunk — the client accumulates and
              // sanitizes for the live preview. Avoids re-sending the whole
              // (growing) document on every tick.
              send({ type: 'page_delta', pageId: target.id, chunk });
            }
            // Final authoritative, fully-sanitized document for the page.
            send({ type: 'page_end', pageId: target.id, html: sanitizeGeneratedHtml(html) });
          }
        }

        send({ type: 'done' });
      } catch (err) {
        if (!abort.aborted) {
          send({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed.' });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
