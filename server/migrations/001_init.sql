-- players are guests or accounts. names are unique across both
create table players (
  id bigserial primary key,
  name text not null unique,
  kind text not null check (kind in ('guest', 'account')),
  pass_hash text, -- scrypt, null for guests
  created_at timestamptz not null default now()
);

-- the raw token only lives in the cookie, we keep its sha256
create table sessions (
  token_hash bytea primary key,
  player_id bigint not null references players on delete cascade,
  expires_at timestamptz not null
);

-- match ids are opaque. owner + lease_until is the directory once there's more than one pod
create table matches (
  id text primary key,
  mode text not null,
  config jsonb not null, -- MatchConfig, includes the seed
  engine_version text not null,
  status text not null check (status in ('live', 'done', 'abandoned')),
  result jsonb,
  owner text,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index matches_live on matches (status) where status = 'live';

create table match_seats (
  match_id text not null references matches,
  seat int not null,
  player_id bigint references players, -- null for bot seats
  primary key (match_id, seat)
);
create index match_seats_player on match_seats (player_id);

-- written before every broadcast. n = 0, 1, 2... a gap is a bug
create table match_actions (
  match_id text not null references matches,
  n int not null,
  seat int not null,
  action jsonb not null,
  auto boolean not null, -- timeout default or bot
  at timestamptz not null default now(),
  primary key (match_id, n)
);

-- one engine version per daily, pinned by the first start of the day
create table dailies (
  day date primary key,
  engine_version text not null,
  seed_hash text not null
);

create table daily_best (
  day date not null,
  difficulty text not null,
  player_id bigint not null references players,
  match_id text not null references matches, -- the run that set the best
  score int not null,
  first_score int not null, -- first finished run of the day
  attempts int not null, -- finished runs, best or not
  achieved_at timestamptz not null, -- tie-break: whoever got there first
  engine_version text not null,
  primary key (day, difficulty, player_id)
);
create index daily_best_board on daily_best (day, difficulty, score desc, achieved_at);
create index daily_first_board on daily_best (day, difficulty, first_score desc);
