-- Planet Wars SI — rewards: daily epochs (leaderboard + lottery), airdrop allocations, lottery rounds.
-- Written only by the server (service role). Public read: everything here is also published on-chain
-- (Merkle roots, commitments) and must be independently verifiable.

create table if not exists public.reward_epochs (
  epoch_id          numeric(78, 0) primary key,
  kind              text        not null check (kind in ('rewards', 'airdrop')),
  day               date,
  root              text        not null check (root ~ '^0x[0-9a-f]{64}$'),
  total             numeric(78, 0) not null check (total >= 0),
  leaderboard_total numeric(78, 0) not null default 0,
  lottery_total     numeric(78, 0) not null default 0,
  recipients        integer     not null check (recipients >= 0),
  tx_hash           text,
  status            text        not null default 'pending' check (status in ('pending', 'published', 'empty')),
  meta              jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  published_at      timestamptz
);
create index if not exists reward_epochs_kind_idx on public.reward_epochs (kind, epoch_id desc);

create table if not exists public.reward_allocations (
  epoch_id     numeric(78, 0) not null references public.reward_epochs (epoch_id) on delete cascade,
  account      text        not null check (account ~ '^0x[0-9a-f]{40}$'),
  amount       numeric(78, 0) not null check (amount > 0),
  leaderboard  numeric(78, 0) not null default 0,
  lottery      numeric(78, 0) not null default 0,
  rank         integer,
  proof        jsonb       not null,
  primary key (epoch_id, account)
);
create index if not exists reward_allocations_account_idx on public.reward_allocations (account);

create table if not exists public.leaderboard_scores (
  day        date        not null,
  account    text        not null check (account ~ '^0x[0-9a-f]{40}$'),
  rank       integer     not null check (rank > 0),
  score      numeric     not null,
  breakdown  jsonb       not null default '{}'::jsonb,
  primary key (day, account)
);
create index if not exists leaderboard_scores_day_rank_idx on public.leaderboard_scores (day, rank);

create table if not exists public.lottery_rounds (
  round          integer     primary key,
  day            date        not null,
  status         text        not null check (status in ('committed', 'closed', 'revealed', 'voided', 'skipped')),
  seed_hash      text,
  entrants_hash  text,
  entrants       jsonb       not null default '[]'::jsonb,
  winners        jsonb       not null default '[]'::jsonb,
  target_block   bigint,
  randomness     text,
  txs            jsonb       not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

alter table public.reward_epochs      enable row level security;
alter table public.reward_allocations enable row level security;
alter table public.leaderboard_scores enable row level security;
alter table public.lottery_rounds     enable row level security;

drop policy if exists "reward_epochs public read" on public.reward_epochs;
create policy "reward_epochs public read" on public.reward_epochs for select to anon, authenticated using (true);
drop policy if exists "reward_allocations public read" on public.reward_allocations;
create policy "reward_allocations public read" on public.reward_allocations for select to anon, authenticated using (true);
drop policy if exists "leaderboard_scores public read" on public.leaderboard_scores;
create policy "leaderboard_scores public read" on public.leaderboard_scores for select to anon, authenticated using (true);
drop policy if exists "lottery_rounds public read" on public.lottery_rounds;
create policy "lottery_rounds public read" on public.lottery_rounds for select to anon, authenticated using (true);

grant select on public.reward_epochs, public.reward_allocations, public.leaderboard_scores, public.lottery_rounds
  to anon, authenticated;
grant all on public.reward_epochs, public.reward_allocations, public.leaderboard_scores, public.lottery_rounds
  to service_role;
