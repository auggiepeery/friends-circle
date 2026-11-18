-- Named friends vs ephemeral guests on the shared circle
alter table circle_members
  add column if not exists role text not null default 'friend';

create index if not exists circle_members_role_idx
  on circle_members (circle_id, role);
