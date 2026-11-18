-- Bumped on password change to revoke existing signed cookies
alter table profiles
  add column if not exists session_version integer not null default 0;
