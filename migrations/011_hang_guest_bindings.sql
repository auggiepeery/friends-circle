-- Bind hang-code guests to the invite that admitted them so revoke/expiry
-- can invalidate active sessions (not only block new redemptions).

create table if not exists hang_guest_bindings (
  user_id text primary key references profiles(id) on delete cascade,
  invite_id text not null references plan_guest_invites(id) on delete cascade,
  plan_id text not null references plans(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists hang_guest_bindings_invite_idx
  on hang_guest_bindings (invite_id);

create index if not exists hang_guest_bindings_plan_idx
  on hang_guest_bindings (plan_id);
