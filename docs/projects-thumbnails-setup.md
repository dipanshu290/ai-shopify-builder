# Projects page & thumbnails — backend setup

The Projects page (`/projects`) lists every project as a card with an
auto-captured preview thumbnail, its derived title, and its created date. The
thumbnail is rendered client-side when a page finishes generating and uploaded
to InsForge Storage with the signed-in user's JWT under RLS.

Two one-time resources must be provisioned (they cannot be created with the
browser anon key — use the `insforge` CLI or the dashboard SQL editor).

## 1. Storage bucket

Create a **public** bucket named `project-thumbnails` (public so the saved
`thumbnail_url` resolves directly in the browser). If you use a different name,
set `NEXT_PUBLIC_INSFORGE_THUMBNAILS_BUCKET` in `.env.local` to match — the code
falls back to `project-thumbnails`.

```bash
insforge storage create-bucket project-thumbnails --public
```

## 2. Thumbnail columns on `projects` (run as a migration)

```sql
alter table public.projects
  add column if not exists thumbnail_url text,
  add column if not exists thumbnail_key text;
```

No new RLS policies are needed — the existing owner-only `projects` update
policy (`user_id = auth.uid()`) already authorizes writing these columns. If the
`projects` table does not yet have an update policy, add one:

```sql
create policy "projects_update_own" on public.projects
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
```

## Notes

- Capture runs client-side, reusing the same offscreen-iframe + `html-to-image`
  technique as "Export to PNG" (`lib/export/png.ts` / `lib/thumbnail.ts`),
  cropped to the top of the home page and downscaled to ~600px wide.
- Capture is best-effort and never blocks generation or persistence: if it
  fails, the card just shows a "Preview generating…" placeholder until the next
  successful turn.
- Thumbnails are stored under a versioned key (`<projectId>/thumb-<ts>.png`), so
  a re-capture never fights a cached object URL; the project row always points
  at the latest.
