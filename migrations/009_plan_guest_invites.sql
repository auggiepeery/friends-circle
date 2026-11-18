-- Per-hang guest invite links (expire after the plan ends)

create table if not exists plan_guest_invites (
  id text primary key,
  token text not null unique,
  plan_id text not null references plans(id) on delete cascade,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists plan_guest_invites_plan_idx
  on plan_guest_invites (plan_id);

create index if not exists plan_guest_invites_token_idx
  on plan_guest_invites (token);
