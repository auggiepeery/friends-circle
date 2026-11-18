-- Guest vs Fun Peeps plan audiences
alter table plans
  add column if not exists audience text not null default 'fun_peeps';

update plans
set audience = 'fun_peeps'
where audience is null or audience = '';

-- Soft guard: only known audiences
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plans_audience_check'
  ) then
    alter table plans
      add constraint plans_audience_check
      check (audience in ('fun_peeps', 'guest'));
  end if;
end $$;

create index if not exists plans_audience_idx on plans (audience);
