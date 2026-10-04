-- Planet Wars SI — off-chain game state (SI broadcasts, attacks, defenses).
-- Ownership, tokens and the marketplace live on-chain; this schema only stores game events.
-- Writes happen server-side with the service-role key; the public (anon) role can read.

create table if not exists public.si_broadcasts (
  day            date primary key,
  title          text        not null check (char_length(title) <= 200),
  body           text        not null check (char_length(body) <= 4000),
  threat_level   smallint    not null check (threat_level between 1 and 5),
  focus_body_id  integer     not null check (focus_body_id > 0),
  source         text        not null default 'template' check (source in ('template', 'llm')),
  created_at     timestamptz not null default now()
);

create table if not exists public.si_attacks (
  id         text        primary key,
  day        date        not null,
  body_id    integer     not null check (body_id > 0),
  sector     text        not null,
  kind       text        not null,
  severity   integer     not null check (severity > 0),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists si_attacks_day_idx on public.si_attacks (day desc);
create index if not exists si_attacks_body_idx on public.si_attacks (body_id, ends_at desc);

create table if not exists public.si_defenses (
  id         bigint generated always as identity primary key,
  attack_id  text        not null references public.si_attacks (id) on delete cascade,
  wallet     text        not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  token_id   numeric(78, 0) not null,
  power      integer     not null check (power >= 0),
  signature  text        not null,
  created_at timestamptz not null default now(),
  -- one commitment per territory per attack
  unique (attack_id, token_id)
);
create index if not exists si_defenses_attack_idx on public.si_defenses (attack_id);
create index if not exists si_defenses_wallet_idx on public.si_defenses (wallet);

-- Row level security: public read, no client writes (service role bypasses RLS).
alter table public.si_broadcasts enable row level security;
alter table public.si_attacks    enable row level security;
alter table public.si_defenses   enable row level security;

drop policy if exists "si_broadcasts public read" on public.si_broadcasts;
create policy "si_broadcasts public read" on public.si_broadcasts for select to anon, authenticated using (true);
drop policy if exists "si_attacks public read" on public.si_attacks;
create policy "si_attacks public read" on public.si_attacks for select to anon, authenticated using (true);
drop policy if exists "si_defenses public read" on public.si_defenses;
create policy "si_defenses public read" on public.si_defenses for select to anon, authenticated using (true);
