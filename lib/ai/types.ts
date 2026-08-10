import type { BuilderPage, PageType } from './events';
import type { TurnPlan, PagePatch, ThemeSpec, ShopifySectionSpec } from './schema';

/**
 * Provider-independent AI contract (AGENTS.md §7). The app never talks to a
 * model SDK directly — it goes through this interface, and model-specific code
 * stays inside the adapter under `providers/`. The active provider and model are
 * read from environment variables by the factory in `index.ts`.
 *
 * This is a focused subset of the full AGENTS.md interface: we implement only
 * the two capabilities the builder needs today (decide a turn, stream one page).
 * Editing patches and Shopify conversion get added to this contract when built.
 */

export interface PlanTurnInput {
  /** Full conversation so far (oldest first). */
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Page tabs that already exist. */
  existingPages: BuilderPage[];
  /** The page currently open in the preview, if any. */
  activePageId?: string | null;
  abortSignal?: AbortSignal;
}

export interface GenerateThemeInput {
  /** Full conversation, so the theme reflects the requested brand/industry. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  abortSignal?: AbortSignal;
}

export interface StreamPageInput {
  /** The page to generate. */
  page: BuilderPage;
  /** Sibling pages in the same store, so nav links stay connected. */
  siblingPages: BuilderPage[];
  /** The project's shared style guide, so the page reuses common components. */
  styleGuide?: string | null;
  /** Full conversation for design context. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  abortSignal?: AbortSignal;
}

export interface EditPageInput {
  /** The open page being edited. */
  page: BuilderPage;
  /** The page's current HTML — the model targets existing ids within it. */
  html: string;
  /** The project's shared style guide, so edits stay on-brand. */
  styleGuide?: string | null;
  /** Full conversation for the requested change. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  abortSignal?: AbortSignal;
}

export interface ShopifySectionInput {
  /** Store brand name, so the section copy/settings stay on-brand. */
  brandName: string;
  /** The project's shared style guide for design consistency. */
  styleGuide?: string | null;
  /** The page the region came from, so the prompt can tailor the section. */
  pageType: PageType;
  pageLabel: string;
  /** Where the region sits in the page. */
  role: 'header' | 'footer' | 'content';
  /** The static HTML region to convert into a Shopify section. */
  html: string;
  abortSignal?: AbortSignal;
}

export interface AIProvider {
  /**
   * Decide what to do with the latest user message: reply conversationally and,
   * when appropriate, plan the page tabs and pick the single page to build/edit.
   */
  planTurn(input: PlanTurnInput): Promise<TurnPlan>;
  /**
   * Produce the project's ONE global theme: a shared stylesheet (design tokens +
   * reusable component classes + brand/logo treatment) plus a short style guide
   * every page reuses so the store stays visually consistent.
   */
  generateTheme(input: GenerateThemeInput): Promise<ThemeSpec>;
  /** Stream the raw HTML body of one page as it is generated. */
  streamPage(input: StreamPageInput): AsyncIterable<string>;
  /**
   * Produce a small set of scoped edit operations for an already-generated page,
   * so a change updates only the affected pieces instead of regenerating it.
   */
  editPage(input: EditPageInput): Promise<PagePatch>;
  /**
   * Convert ONE designed page region into a real, editable Shopify section:
   * section markup plus structured settings/blocks (the caller assembles the
   * `{% schema %}`). Used by the Shopify export to turn generated pages into
   * reusable, Theme-Editor-friendly sections (AGENTS.md §10).
   */
  generateShopifySection(input: ShopifySectionInput): Promise<ShopifySectionSpec>;
}
