import type { PageType } from '@/lib/ai/events';

/**
 * Types shared across the Shopify export pipeline (convert → validate → zip).
 * Kept isomorphic and free of React / server-only imports so the whole pipeline
 * can run client-side (AGENTS.md: conversion is deterministic and needs no
 * secrets).
 */

/** One generated storefront page fed into the converter. */
export interface ExportPage {
  /** Stable slug id, e.g. "home" (mirrors BuilderPage.id / project_pages.page_key). */
  key: string;
  label: string;
  type: PageType;
  /** Storefront-style path, e.g. "/" or "/products". */
  path: string;
  /** Final sanitized body HTML of the page. */
  html: string;
}

/** Everything the converter needs to build a theme. */
export interface ThemeExportInput {
  projectName: string;
  pages: ExportPage[];
  /** The project's global stylesheet (project_themes.css), applied to every page. */
  themeCss: string;
  /** Vendored Tailwind utilities embedded into assets/ (no external CDN). */
  tailwindCss: string;
}

/** A single file destined for the ZIP. Text files carry a string; binary a Uint8Array. */
export interface ThemeFile {
  /** Theme-relative path, e.g. "sections/home-hero.liquid". Always forward slashes. */
  path: string;
  contents: string | Uint8Array;
}

/** The result of converting an input into a full theme file set. */
export interface ThemeBuild {
  files: ThemeFile[];
  /** Distinct absolute image URLs referenced by the theme (for reporting). */
  imageUrls: string[];
}

/** A structured validation problem, reported per file. */
export interface ValidationIssue {
  file: string;
  message: string;
}

/** The eight visible export steps, in order. Progress is reported against these. */
export type ExportStepId =
  | 'analyze'
  | 'convert'
  | 'sections'
  | 'templates'
  | 'assets'
  | 'validate'
  | 'zip'
  | 'upload';

export interface ExportProgress {
  step: ExportStepId;
  /** Human-readable status line for the current step. */
  message: string;
  /** 0–100 overall completion. */
  percent: number;
}
