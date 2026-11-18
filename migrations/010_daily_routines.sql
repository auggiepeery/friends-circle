-- Per-member recurring busy blocks (sports, church, school, etc.)

create table if not exists daily_routines (
  id text primary key,
  user_id text not null references profiles(id) on delete cascade,
  weekday int not null check (weekday >= 0 and weekday <= 6),
  start_minute int not null check (start_minute >= 0 and start_minute < 1440),
  end_minute int not null check (end_minute > 0 and end_minute <= 1440),
  label text not null,
  created_at timestamptz not null default now(),
  check (end_minute > start_minute)
);

create index if not exists daily_routines_user_idx
  on daily_routines (user_id, weekday);
