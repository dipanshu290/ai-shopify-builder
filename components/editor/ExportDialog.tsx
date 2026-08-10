'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  Loader2,
  RefreshCw,
  Store,
  X,
} from 'lucide-react';
import { getLatestExport, type ThemeExportRow } from '@/lib/exports';
import { runShopifyExport, type RunExportResult } from '@/lib/shopify/export';
import type { ExportPage, ExportProgress, ExportStepId } from '@/lib/shopify/types';

/**
 * "Export to Shopify" dialog (AGENTS.md §10/§16). Orchestrates the full flow:
 * check for an existing export, run the client-side export with live progress,
 * and show success (Download ZIP) or a retryable error. The dialog is
 * non-closable while an export is in progress so a run can't be interrupted or
 * duplicated.
 */

type DialogState = 'checking' | 'existing' | 'exporting' | 'success' | 'error';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  pages: ExportPage[];
  themeCss: string;
  styleGuide: string | null;
}

const STEP_LIST: { id: ExportStepId; label: string }[] = [
  { id: 'analyze', label: 'Analyzing generated pages' },
  { id: 'convert', label: 'Converting HTML into Shopify Liquid' },
  { id: 'sections', label: 'Generating reusable sections' },
  { id: 'templates', label: 'Creating templates and snippets' },
  { id: 'assets', label: 'Processing images and assets' },
  { id: 'validate', label: 'Validating the Shopify theme structure' },
  { id: 'zip', label: 'Creating the ZIP archive' },
  { id: 'upload', label: 'Uploading the ZIP file to InsForge Storage' },
];

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function triggerDownload(href: string, name: string, revoke = false) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 5000);
}

export default function ExportDialog({
  open,
  onClose,
  projectId,
  projectName,
  pages,
  themeCss,
  styleGuide,
}: ExportDialogProps) {
  const [state, setState] = useState<DialogState>('checking');
  const [existing, setExisting] = useState<ThemeExportRow | null>(null);
  const [progress, setProgress] = useState<ExportProgress>({
    step: 'analyze',
    message: 'Starting…',
    percent: 0,
  });
  const [result, setResult] = useState<RunExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const runningRef = useRef(false);

  const startExport = useCallback(async () => {
    if (runningRef.current) return; // guard against duplicate runs
    runningRef.current = true;
    setState('exporting');
    setProgress({ step: 'analyze', message: 'Analyzing generated pages…', percent: 2 });
    try {
      const res = await runShopifyExport({
        projectId,
        projectName,
        pages,
        themeCss,
        styleGuide,
        onProgress: setProgress,
      });
      setResult(res);
      setState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Export failed. Please try again.');
      setState('error');
    } finally {
      runningRef.current = false;
    }
  }, [projectId, projectName, pages, themeCss, styleGuide]);

  // On open: reset, then check for an existing export. If one exists, offer the
  // choices; otherwise begin the export immediately.
  useEffect(() => {
    if (!open) return;
    let active = true;

    (async () => {
      // Reset inside the async callback (not the effect body) so a fresh open
      // starts from the checking state without a synchronous cascading render.
      setState('checking');
      setResult(null);
      setExisting(null);
      setErrorMessage('');
      try {
        const latest = await getLatestExport(projectId);
        if (!active) return;
        if (latest && latest.status === 'ready') {
          setExisting(latest);
          setState('existing');
          return;
        }
      } catch {
        // A lookup failure shouldn't block exporting — fall through to start one.
      }
      if (active) void startExport();
    })();

    return () => {
      active = false;
    };
  }, [open, projectId, startExport]);

  const dismissable = state !== 'exporting' && state !== 'checking';
  const handleBackdrop = () => {
    if (dismissable) onClose();
  };

  // Block Escape while an export is running.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dismissable, onClose]);

  if (!open) return null;

  const activeStepIndex = STEP_LIST.findIndex((s) => s.id === progress.step);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
      onMouseDown={handleBackdrop}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Export to Shopify"
          className="flex max-h-[min(720px,calc(100vh-2rem))] w-[min(42rem,calc(100vw-2rem))] min-w-[320px] flex-col overflow-hidden rounded-2xl border border-[#eee7e3] bg-white shadow-[0_32px_64px_rgba(31,41,55,0.24)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#f1ebe7] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eafaf0]">
                <Store size={18} strokeWidth={2} className="text-[#35b86b]" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#111827]">Export to Shopify</h2>
                <p className="truncate text-[11px] text-[#9aa2af]">
                  {projectName || 'Storefront theme'}
                </p>
              </div>
            </div>
            {dismissable && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-[#9aa2af] transition hover:bg-[#f6f1ee] hover:text-[#4b5563]"
              >
                <X size={17} strokeWidth={2} />
              </button>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto px-5 py-5">
            {state === 'checking' && (
              <div className="flex items-center gap-3 py-6 text-sm text-[#4b5563]">
                <Loader2 size={18} className="animate-spin text-[#ff6747]" />
                Checking for an existing export…
              </div>
            )}

            {state === 'existing' && existing && (
              <div>
                <p className="text-sm text-[#4b5563]">
                  A Shopify export already exists for this project.
                </p>
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#eee7e3] bg-[#faf7f5] px-3.5 py-3">
                  <FileArchive size={20} className="shrink-0 text-[#6b7280]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#111827]">
                      {existing.file_name}
                    </p>
                    <p className="text-[11px] text-[#9aa2af]">
                      {formatSize(existing.file_size)} · v{existing.theme_version} ·{' '}
                      {new Date(existing.updated_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-2.5">
                  <button
                    onClick={() => triggerDownload(existing.download_url, existing.file_name)}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6747] px-4 text-sm font-semibold text-white transition hover:bg-[#f85b3a]"
                  >
                    <Download size={17} strokeWidth={2} />
                    Download existing export
                  </button>
                  <button
                    onClick={() => void startExport()}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e8e2de] bg-white px-4 text-sm font-semibold text-[#111827] transition hover:bg-[#fff8f5]"
                  >
                    <RefreshCw size={16} strokeWidth={2} />
                    Regenerate export
                  </button>
                  <button
                    onClick={onClose}
                    className="flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-[#6b7280] transition hover:bg-[#f6f1ee]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {state === 'exporting' && (
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#111827]">{progress.message}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[#ff6747]">
                    {Math.round(progress.percent)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#f1ebe7]">
                  <div
                    className="h-full rounded-full bg-[#ff6747] transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(2, progress.percent)}%` }}
                  />
                </div>
                <ul className="mt-5 space-y-2">
                  {STEP_LIST.map((step, index) => {
                    const done = index < activeStepIndex;
                    const active = index === activeStepIndex;
                    return (
                      <li key={step.id} className="flex items-center gap-2.5 text-[13px]">
                        {done ? (
                          <CheckCircle2 size={16} className="shrink-0 text-[#35b86b]" />
                        ) : active ? (
                          <Loader2 size={16} className="shrink-0 animate-spin text-[#ff6747]" />
                        ) : (
                          <span className="grid h-4 w-4 shrink-0 place-items-center">
                            <span className="h-2 w-2 rounded-full bg-[#e0d8d1]" />
                          </span>
                        )}
                        <span
                          className={
                            done
                              ? 'text-[#6b7280]'
                              : active
                                ? 'font-semibold text-[#111827]'
                                : 'text-[#b7ada4]'
                          }
                        >
                          {step.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 text-[11px] text-[#9aa2af]">
                  Please keep this window open — the export is in progress.
                </p>
              </div>
            )}

            {state === 'success' && result && (
              <div className="text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eafaf0]">
                  <CheckCircle2 size={30} strokeWidth={2} className="text-[#35b86b]" />
                </span>
                <h3 className="mt-3 text-base font-bold text-[#111827]">Theme exported</h3>
                <p className="mt-1 text-[13px] text-[#6b7280]">
                  Your Shopify theme is ready and saved to storage.
                </p>
                <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-[#9aa2af]">
                  <FileArchive size={13} />
                  {result.fileName} · {formatSize(result.row.file_size)} · v{result.row.theme_version}
                </div>
                {result.sectionStats.total > 0 && (
                  <p className="mt-2 text-[11px] text-[#9aa2af]">
                    {result.sectionStats.total} editable section
                    {result.sectionStats.total === 1 ? '' : 's'} generated
                    {result.sectionStats.ai > 0 && ` · ${result.sectionStats.ai} AI-authored`}
                    {result.sectionStats.fallback > 0 &&
                      ` · ${result.sectionStats.fallback} basic (AI unavailable)`}
                  </p>
                )}
                <div className="mt-5 flex flex-col gap-2.5">
                  <button
                    onClick={() => {
                      if (result.row.download_url) {
                        triggerDownload(result.row.download_url, result.fileName);
                        return;
                      }
                      const url = URL.createObjectURL(result.blob);
                      triggerDownload(url, result.fileName, true);
                    }}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6747] px-4 text-sm font-semibold text-white transition hover:bg-[#f85b3a]"
                  >
                    <Download size={17} strokeWidth={2} />
                    Download ZIP
                  </button>
                  <button
                    onClick={onClose}
                    className="flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-[#6b7280] transition hover:bg-[#f6f1ee]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {state === 'error' && (
              <div className="text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#fdeceb]">
                  <AlertTriangle size={28} strokeWidth={2} className="text-[#e5533d]" />
                </span>
                <h3 className="mt-3 text-base font-bold text-[#111827]">Export failed</h3>
                <p className="mt-1 break-words text-[13px] text-[#6b7280]">{errorMessage}</p>
                <div className="mt-5 flex flex-col gap-2.5">
                  <button
                    onClick={() => void startExport()}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff6747] px-4 text-sm font-semibold text-white transition hover:bg-[#f85b3a]"
                  >
                    <RefreshCw size={16} strokeWidth={2} />
                    Retry export
                  </button>
                  <button
                    onClick={onClose}
                    className="flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-[#6b7280] transition hover:bg-[#f6f1ee]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
