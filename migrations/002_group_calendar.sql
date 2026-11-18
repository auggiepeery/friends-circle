-- Shared small-group calendar: one circle, all members see all plans

create table if not exists circles (
  id text primary key,
  name text not null default 'Our circle',
  created_at timestamptz not null default now()
);

create table if not exists circle_members (
  circle_id text not null references circles(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create index if not exists circle_members_user_idx on circle_members (user_id);

alter table plans add column if not exists circle_id text references circles(id);

insert into circles (id, name)
values ('circle_default', 'Fun Peepers')
on conflict (id) do nothing;

update plans set circle_id = 'circle_default' where circle_id is null;
