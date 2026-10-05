-- One Supabase project per chain: the server stamps its chain id here on first use and refuses to
-- run against a project stamped for another chain (see src/server/store/chain-guard.ts).
create table if not exists public.app_meta (
  key        text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
alter table public.app_meta enable row level security;
-- No public policies: only the service role (server) reads/writes this table.
