-- WRITE. Run once in your Supabase project (SQL Editor). Safe to share a project with other apps.
begin;

-- One entry per day: how it went, and what was on your mind.
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  written_on date not null,
  rating int not null check (rating between 1 and 10),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, written_on)
);

create index journal_by_day on public.journal_entries (user_id, written_on desc);

alter table public.journal_entries enable row level security;

create policy j_read   on public.journal_entries for select using (user_id = auth.uid());
create policy j_write  on public.journal_entries for insert with check (user_id = auth.uid());
create policy j_edit   on public.journal_entries for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy j_remove on public.journal_entries for delete using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;

commit;
