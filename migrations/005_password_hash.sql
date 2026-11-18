-- Real hashed passwords for named friends (never store plaintext)
alter table profiles
  add column if not exists password_hash text not null default '';
