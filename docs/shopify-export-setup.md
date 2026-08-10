# Shopify Export — backend setup

The "Export to Shopify" feature needs two InsForge resources that must be
provisioned once (the app code reads/writes them at runtime with the signed-in
user's JWT under RLS). Run these in an interactive InsForge session
(`insforge` CLI or the dashboard SQL editor) — they cannot be created with the
browser anon key.

## 1. Storage bucket

Create a **public** bucket named `theme-exports` (public so the saved
`download_url` resolves directly in the browser). If you use a different name,
set `NEXT_PUBLIC_INSFORGE_EXPORTS_BUCKET` in `.env.local` to match — the code
falls back to `theme-exports`.

```bash
insforge storage create-bucket theme-exports --public
```

## 2. `theme_exports` table (run as a migration)

```sql
create table if not exists public.theme_exports (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name     text not null,
  storage_key   text not null,
  download_url  text not null,
  status        text not null default 'ready',
  file_size     bigint not null default 0,
  theme_version text not null default '1.0.0',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One export row per project is kept current (we upsert on project_id).
create unique index if not exists theme_exports_project_id_key
  on public.theme_exports (project_id);

create index if not exists theme_exports_user_id_idx
  on public.theme_exports (user_id);

alter table public.theme_exports enable row level security;

-- Owner-only access (mirrors the projects / project_pages policies).
create policy "theme_exports_select_own" on public.theme_exports
  for select using (user_id = auth.uid());

create policy "theme_exports_insert_own" on public.theme_exports
  for insert with check (user_id = auth.uid());

create policy "theme_exports_update_own" on public.theme_exports
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "theme_exports_delete_own" on public.theme_exports
  for delete using (user_id = auth.uid());
```

## Notes

- The exporter runs client-side (matches `projects` / `project_pages` /
  `project_themes`): conversion + ZIP building are deterministic and need no
  secrets, and the storage upload uses the user's JWT.
- The Tailwind utilities are vendored at `public/shopify/tailwind.css` and
  embedded into each exported theme's `assets/` — no external CDN, no build step
  (Tailwind Play CDN is never exported, per AGENTS.md §10).
