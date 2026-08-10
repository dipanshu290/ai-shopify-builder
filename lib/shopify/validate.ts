import type { ThemeBuild, ValidationIssue } from './types';

/**
 * Structural validation of a built theme before it is zipped (AGENTS.md §11).
 * Confirms the required folders/files exist, JSON parses, every template's
 * referenced sections resolve to a real section file, and no unsafe ZIP paths
 * sneak in. Returns issues per file; a non-empty list blocks the export.
 */

const REQUIRED_FILES = [
  'layout/theme.liquid',
  'config/settings_schema.json',
  'config/settings_data.json',
  'templates/index.json',
  'templates/product.json',
  'templates/collection.json',
  'templates/cart.json',
  'snippets/meta-tags.liquid',
];

const REQUIRED_DIR_PREFIXES = [
  'assets/',
  'config/',
  'layout/',
  'locales/',
  'sections/',
  'snippets/',
  'templates/',
  'templates/customers/',
];

function isUnsafePath(path: string): boolean {
  return (
    path.startsWith('/') ||
    path.includes('..') ||
    path.includes('\\') ||
    /^[a-zA-Z]:/.test(path) // drive-letter absolute path
  );
}

export function validateTheme(build: ThemeBuild): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const paths = new Set(build.files.map((f) => f.path));

  // 1. Unsafe / absolute ZIP paths.
  for (const file of build.files) {
    if (isUnsafePath(file.path)) {
      issues.push({ file: file.path, message: 'Unsafe or absolute theme path.' });
    }
  }

  // 2. Required files.
  for (const required of REQUIRED_FILES) {
    if (!paths.has(required)) {
      issues.push({ file: required, message: 'Required theme file is missing.' });
    }
  }

  // 3. Required folders (at least one file under each prefix).
  for (const prefix of REQUIRED_DIR_PREFIXES) {
    const has = build.files.some((f) => f.path.startsWith(prefix));
    if (!has) {
      issues.push({ file: prefix, message: 'Required theme folder is empty or missing.' });
    }
  }

  // 4. JSON files must parse; templates must reference existing sections.
  const sectionTypes = new Set(
    build.files
      .filter((f) => f.path.startsWith('sections/') && f.path.endsWith('.liquid'))
      .map((f) => f.path.slice('sections/'.length, -'.liquid'.length))
  );

  for (const file of build.files) {
    if (!file.path.endsWith('.json') || typeof file.contents !== 'string') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(file.contents);
    } catch {
      issues.push({ file: file.path, message: 'Invalid JSON.' });
      continue;
    }

    // Template JSON references sections by `type`; each must have a section file.
    if (file.path.startsWith('templates/') && parsed && typeof parsed === 'object') {
      const sections = (parsed as { sections?: Record<string, { type?: string }> }).sections;
      if (sections) {
        for (const [id, def] of Object.entries(sections)) {
          const type = def?.type;
          if (!type || !sectionTypes.has(type)) {
            issues.push({
              file: file.path,
              message: `Template section "${id}" references missing section "${type ?? '(none)'}".`,
            });
          }
        }
      }
    }
  }

  // 5. Every section .liquid must carry a schema block.
  for (const file of build.files) {
    if (
      file.path.startsWith('sections/') &&
      file.path.endsWith('.liquid') &&
      typeof file.contents === 'string' &&
      !/\{%-?\s*schema\s*-?%\}/.test(file.contents)
    ) {
      issues.push({ file: file.path, message: 'Section is missing a {% schema %} block.' });
    }
  }

  return issues;
}
