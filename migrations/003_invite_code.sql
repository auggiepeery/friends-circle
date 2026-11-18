-- Invite-only circle access

alter table circles add column if not exists invite_code text;

create unique index if not exists circles_invite_code_uidx
  on circles (invite_code)
  where invite_code is not null;
