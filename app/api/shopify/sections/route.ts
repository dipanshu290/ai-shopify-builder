import { NextRequest } from 'next/server';
import { getAIProvider } from '@/lib/ai';
import { shopifySectionsRequestSchema } from '@/lib/ai/schema';

export const runtime = 'nodejs';

/**
 * Thin streaming route for AI Shopify section conversion (AGENTS.md §5/§15). The
 * export runs client-side, but AI calls must stay on the server (keys never
 * reach the browser). The client splits each designed page into regions and
 * POSTs them here; we convert each region into a structured Shopify section spec
 * with the active provider and stream one NDJSON result per region so the export
 * dialog can show real, per-section progress. A per-region failure is reported
 * (never fatal) so the client can fall back to a raw section for just that piece.
 */

/** How many section conversions to run at once. Balances speed vs. rate limits. */
const CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  const parsed = shopifySectionsRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { brandName, styleGuide, sections } = parsed.data;

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
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      // Simple worker pool: pull from a shared cursor until the queue drains.
      let cursor = 0;
      const total = sections.length;
      send({ type: 'start', total });

      const worker = async () => {
        while (cursor < sections.length && !abort.aborted) {
          const item = sections[cursor++];
          try {
            const spec = await provider.generateShopifySection({
              brandName,
              styleGuide,
              pageType: item.pageType,
              pageLabel: item.pageLabel,
              role: item.role,
              html: item.html,
              abortSignal: abort,
            });
            send({ type: 'section', ref: item.ref, spec });
          } catch (err) {
            send({
              type: 'section_error',
              ref: item.ref,
              message: err instanceof Error ? err.message : 'Section conversion failed.',
            });
          }
        }
      };

      try {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
        send({ type: 'done' });
      } catch (err) {
        if (!abort.aborted) {
          send({ type: 'error', message: err instanceof Error ? err.message : 'Conversion failed.' });
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
