import type { PatchOperation } from './events';
import { sanitizeGeneratedHtml } from './sanitize';

/**
 * Scoped-edit helpers shared by the AI route (which sanitizes model-produced
 * operations) and the builder client (which applies them to the live page).
 *
 * Applying an edit as a set of targeted operations — rather than regenerating
 * the page — is what keeps sibling sections and unrelated markup untouched
 * (AGENTS.md §8).
 */

const UNSAFE_URL = /^\s*(javascript:|data:text\/html)/i;

/** Sanitize model-produced operations before they leave the server. */
export function sanitizePatchOperations(operations: PatchOperation[]): PatchOperation[] {
  return operations.map((op) => {
    switch (op.op) {
      case 'replace_inner':
      case 'replace_outer':
        return { ...op, html: sanitizeGeneratedHtml(op.html) };
      case 'set_attribute':
        if ((op.name === 'src' || op.name === 'href') && UNSAFE_URL.test(op.value)) {
          return { ...op, value: '#' };
        }
        return op;
      default:
        // set_text / set_classes carry no markup or URLs — safe as-is.
        return op;
    }
  });
}

/** Find an element by either its builder element id or section id. */
function findTarget(root: Document, targetId: string): Element | null {
  return (
    root.querySelector(`[data-builder-element-id="${targetId}"]`) ??
    root.querySelector(`[data-builder-section-id="${targetId}"]`)
  );
}

/**
 * Apply scoped edit operations to a page's HTML body and return the new body
 * HTML. Runs in the browser (uses DOMParser); if the DOM API is unavailable or
 * a target id can't be found, the relevant change is skipped and the rest of the
 * page is preserved untouched. `targetId` values are pre-validated to a safe id
 * slug, so they are safe to interpolate into the attribute selector.
 */
export function applyPatchOperations(html: string, operations: PatchOperation[]): string {
  if (typeof DOMParser === 'undefined' || operations.length === 0) return html;

  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');

  for (const op of operations) {
    const el = findTarget(doc, op.targetId);
    if (!el) continue;
    switch (op.op) {
      case 'replace_inner':
        el.innerHTML = op.html;
        break;
      case 'replace_outer':
        el.outerHTML = op.html;
        break;
      case 'set_text':
        el.textContent = op.text;
        break;
      case 'set_classes':
        el.setAttribute('class', op.className);
        break;
      case 'set_attribute':
        el.setAttribute(op.name, op.value);
        break;
    }
  }

  return doc.body.innerHTML;
}
