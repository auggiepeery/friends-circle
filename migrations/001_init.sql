-- Fun Peepers: friends planning schema

create table if not exists profiles (
  id text primary key,
  email text not null default '',
  display_name text not null default '',
  availability_hint text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists friendships (
  id text primary key,
  user_id text not null references profiles(id) on delete cascade,
  friend_id text not null references profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

create table if not exists plans (
  id text primary key,
  share_token text not null unique,
  creator_id text not null references profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  place text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  template text not null default 'custom',
  outdoor boolean not null default false,
  lat double precision,
  lon double precision,
  reminder_at timestamptz,
  recurring_rule text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_rsvps (
  plan_id text not null references plans(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  response text not null default 'going',
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

create table if not exists plan_comments (
  id text primary key,
  plan_id text not null references plans(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists plan_polls (
  id text primary key,
  plan_id text not null references plans(id) on delete cascade,
  kind text not null default 'time',
  question text not null,
  created_at timestamptz not null default now()
);

create table if not exists poll_options (
  id text primary key,
  poll_id text not null references plan_polls(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create table if not exists poll_votes (
  option_id text not null references poll_options(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

create table if not exists expenses (
  id text primary key,
  plan_id text not null references plans(id) on delete cascade,
  payer_id text not null references profiles(id) on delete cascade,
  description text not null default '',
  amount_cents int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  user_id text not null references profiles(id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text not null default '',
  href text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists plans_starts_at_idx on plans (starts_at);
create index if not exists notifications_user_idx on notifications (user_id, read, created_at desc);
create index if not exists friendships_user_idx on friendships (user_id, status);
