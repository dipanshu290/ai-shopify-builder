/**
 * Shared constants for the Shopify export pipeline (AGENTS.md §10). Kept in one
 * isomorphic module so the exporter, storage layer, and repository agree on the
 * bucket name and the theme version stamped into every export.
 */

/** InsForge Storage bucket that holds the exported theme ZIPs (public). */
export const THEME_EXPORTS_BUCKET =
  process.env.NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET?.trim() || 'theme-exports';

/** Version stamped into the theme (`config/settings_schema.json`) and DB row. */
export const SHOPIFY_THEME_VERSION = '1.0.0';

/** Public path of the vendored Tailwind stylesheet embedded into every theme. */
export const VENDORED_TAILWIND_PATH = '/shopify/tailwind.css';
