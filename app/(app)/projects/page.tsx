'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, ImageOff, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/components';
import { listProjects, type Project } from '@/lib/projects';
import { ensureProjectThumbnail } from '@/lib/thumbnail';

type LoadState = 'loading' | 'ready' | 'error';

/** Format an ISO timestamp as e.g. "Jul 21, 2026". */
function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (authLoading || !user) return;

    let active = true;
    (async () => {
      try {
        const rows = await listProjects();
        if (!active) return;
        setProjects(rows);
        setState('ready');

        // Backfill previews for projects that don't have one yet (e.g. generated
        // before this feature). Sequential + best-effort so a burst of offscreen
        // renders doesn't hog the main thread; each card updates as it resolves.
        for (const project of rows) {
          if (!active) return;
          if (project.thumbnail_url) continue;
          const url = await ensureProjectThumbnail(project);
          if (!active) return;
          if (url) {
            setProjects((prev) =>
              prev.map((p) => (p.id === project.id ? { ...p, thumbnail_url: url } : p))
            );
          }
        }
      } catch {
        if (active) setState('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  return (
    <div className="min-h-screen bg-[#fffdfc] px-8 py-10">
      <div className="mx-auto max-w-[1120px]">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold leading-tight text-[#111827]">Your projects</h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              Every storefront you&apos;ve generated, ready to reopen and edit.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#ff6747] px-4 text-sm font-semibold text-white shadow-[0_12px_22px_rgba(255,103,71,0.2)] transition hover:bg-[#f85b3a]"
          >
            <Plus size={17} strokeWidth={2.2} />
            New project
          </Link>
        </header>

        {state === 'loading' && (
          <div className="grid place-items-center py-28 text-[#6b7280]">
            <div className="flex items-center gap-3 text-sm font-medium">
              <Loader2 size={18} className="animate-spin text-[#ff6747]" />
              Loading your projects…
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="grid place-items-center py-28 text-center">
            <p className="text-sm font-medium text-[#ef4444]">
              We couldn&apos;t load your projects. Please refresh and try again.
            </p>
          </div>
        )}

        {state === 'ready' && projects.length === 0 && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-[#e7e2df] bg-white py-24 text-center">
            <div className="flex flex-col items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#fff3ef] text-[#f05a32]">
                <FolderOpen size={26} strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#111827]">No projects yet</h2>
                <p className="mt-1 text-sm text-[#6b7280]">
                  Describe a Shopify page on the home screen to create your first one.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff6747] px-4 text-sm font-semibold text-white transition hover:bg-[#f85b3a]"
              >
                <Plus size={17} strokeWidth={2.2} />
                Create a project
              </Link>
            </div>
          </div>
        )}

        {state === 'ready' && projects.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/editor/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[#eee7e3] bg-white shadow-[0_10px_24px_rgba(31,41,55,0.035)] transition hover:-translate-y-0.5 hover:border-[#ffd4c7] hover:shadow-[0_16px_32px_rgba(31,41,55,0.08)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#f6f2ef]">
        {project.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote InsForge Storage URL, not optimizable at build time.
          <img
            src={project.thumbnail_url}
            alt={`${project.name} preview`}
            className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[#c3bcb6]">
            <div className="flex flex-col items-center gap-2">
              <ImageOff size={26} strokeWidth={1.6} />
              <span className="text-xs font-medium">Preview generating…</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[#111827]">
          {project.name}
        </h3>
        <p className="mt-auto pt-2 text-xs font-medium text-[#9aa2af]">
          Created {formatCreatedAt(project.created_at)}
        </p>
      </div>
    </Link>
  );
}
