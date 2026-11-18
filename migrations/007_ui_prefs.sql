-- Per signed-in profile UI preferences (theme, calendar defaults, etc.)
alter table profiles
  add column if not exists ui_prefs jsonb not null default '{}'::jsonb;
