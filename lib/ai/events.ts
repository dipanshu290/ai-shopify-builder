/**
 * Streaming protocol shared by the AI route handler (server) and the builder
 * client (browser). Keep this module isomorphic — no server-only imports — so
 * both sides encode/decode the exact same event shapes.
 *
 * The `/api/ai` route responds with newline-delimited JSON (NDJSON): one event
 * object per line. The client reads the stream and reduces these events into
 * chat messages, page tabs, and the live preview.
 */

/** The Shopify storefront page kinds we can generate (one at a time). */
export type PageType = 'home' | 'product' | 'collection' | 'cart' | 'checkout' | 'custom';

/** A page tab shown in the preview browser strip. */
export interface BuilderPage {
  /** Stable slug id, e.g. "home" or "product". Never an array index. */
  id: string;
  label: string;
  type: PageType;
  /** Storefront-style path used only for the fake address bar. */
  path: string;
}

/**
 * A single scoped edit to one already-generated page. Edits target elements by
 * their stable `data-builder-element-id` / `data-builder-section-id` so a small
 * change updates just that piece of the page — the page is never regenerated
 * from scratch (AGENTS.md §8). `targetId` matches either an element id or a
 * section id.
 */
export type PatchOperation =
  /** Replace the inner HTML of the matched element. */
  | { op: 'replace_inner'; targetId: string; html: string }
  /** Replace the entire matched element (e.g. swap out a whole section). */
  | { op: 'replace_outer'; targetId: string; html: string }
  /** Set the text content of the matched element (safe, no markup). */
  | { op: 'set_text'; targetId: string; text: string }
  /** Replace the Tailwind class list of the matched element. */
  | { op: 'set_classes'; targetId: string; className: string }
  /** Set a single attribute (image/link/alt updates). */
  | { op: 'set_attribute'; targetId: string; name: 'src' | 'alt' | 'href' | 'title'; value: string };

export type AIStreamEvent =
  /** A conversational assistant reply (answer, clarification, or confirmation ask). */
  | { type: 'message'; text: string }
  /** The project's global theme (design tokens + reusable component CSS) was
   *  (re)generated. Applies to every page so the store stays visually consistent. */
  | { type: 'theme'; css: string; styleGuide: string }
  /** The set of page tabs to create when the user asked for a full store. */
  | { type: 'plan'; pages: BuilderPage[] }
  /** Page HTML generation is about to start streaming for this page. */
  | { type: 'page_start'; page: BuilderPage }
  /** An incremental raw HTML chunk — the client appends and sanitizes it. */
  | { type: 'page_delta'; pageId: string; chunk: string }
  /** Page generation finished; `html` is the final sanitized document body. */
  | { type: 'page_end'; pageId: string; html: string }
  /** A scoped edit to an existing page — the client applies the ops in place. */
  | { type: 'page_patch'; pageId: string; operations: PatchOperation[] }
  /** Terminal error for the turn. */
  | { type: 'error'; message: string }
  /** The turn is complete; no more events follow. */
  | { type: 'done' };

/** Encode one event as a single NDJSON line (including the trailing newline). */
export function encodeEvent(event: AIStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Stateful NDJSON line splitter. Feed it raw decoded text chunks; it returns the
 * complete events parsed so far and buffers any partial trailing line.
 */
export function createEventParser() {
  let buffer = '';
  return {
    push(chunk: string): AIStreamEvent[] {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      const events: AIStreamEvent[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed) as AIStreamEvent);
        } catch {
          // Ignore malformed lines rather than breaking the whole stream.
        }
      }
      return events;
    },
  };
}
