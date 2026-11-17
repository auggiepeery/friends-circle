import { sql } from "./db";
import { id, shareToken } from "./ids";
import type {
  Comment,
  Expense,
  Plan,
  Poll,
  PollOption,
  Profile,
  Rsvp,
} from "./types";

export async function listUpcomingForUser(userId: string): Promise<
  (Plan & { my_rsvp: string | null; going_count: number })[]
> {
  return sql(
    `select p.*,
       (select r.response from plan_rsvps r where r.plan_id = p.id and r.user_id = $1) as my_rsvp,
       (select count(*)::int from plan_rsvps r where r.plan_id = p.id and r.response = 'going') as going_count
     from plans p
     where p.status = 'open'
       and (
         p.creator_id = $1
         or exists (select 1 from plan_rsvps r where r.plan_id = p.id and r.user_id = $1)
         or exists (
           select 1 from friendships f
           where f.status = 'accepted'
             and ((f.user_id = $1 and f.friend_id = p.creator_id)
               or (f.friend_id = $1 and f.user_id = p.creator_id))
         )
       )
       and (p.starts_at is null or p.starts_at >= now() - interval '12 hours')
     order by coalesce(p.starts_at, p.created_at) asc
     limit 40`,
    [userId],
  );
}

export async function listWeekendForUser(userId: string): Promise<
  (Plan & { my_rsvp: string | null; going_count: number })[]
> {
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const toFri = (5 - day + 7) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + toFri);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);
  return sql(
    `select p.*,
       (select r.response from plan_rsvps r where r.plan_id = p.id and r.user_id = $1) as my_rsvp,
       (select count(*)::int from plan_rsvps r where r.plan_id = p.id and r.response = 'going') as going_count
     from plans p
     where p.status = 'open'
       and p.starts_at is not null
       and p.starts_at >= $2::timestamptz
       and p.starts_at < $3::timestamptz
       and (
         p.creator_id = $1
         or exists (select 1 from plan_rsvps r where r.plan_id = p.id and r.user_id = $1)
         or exists (
           select 1 from friendships f
           where f.status = 'accepted'
             and ((f.user_id = $1 and f.friend_id = p.creator_id)
               or (f.friend_id = $1 and f.user_id = p.creator_id))
         )
       )
     order by p.starts_at asc`,
    [userId, start.toISOString(), end.toISOString()],
  );
}

export async function getPlan(planId: string): Promise<Plan | null> {
  const rows = await sql<Plan>(`select * from plans where id = $1`, [planId]);
  return rows[0] ?? null;
}

export async function getPlanByShare(token: string): Promise<Plan | null> {
  const rows = await sql<Plan>(`select * from plans where share_token = $1`, [
    token,
  ]);
  return rows[0] ?? null;
}

export async function createPlan(input: {
  creatorId: string;
  title: string;
  description?: string;
  place?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  template?: string;
  outdoor?: boolean;
  lat?: number | null;
  lon?: number | null;
  reminderAt?: string | null;
  recurringRule?: string;
}): Promise<Plan> {
  const planId = id("plan");
  const token = shareToken();
  const rows = await sql<Plan>(
    `insert into plans (
       id, share_token, creator_id, title, description, place,
       starts_at, ends_at, template, outdoor, lat, lon, reminder_at, recurring_rule
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning *`,
    [
      planId,
      token,
      input.creatorId,
      input.title.trim(),
      (input.description ?? "").trim(),
      (input.place ?? "").trim(),
      input.startsAt || null,
      input.endsAt || null,
      input.template || "custom",
      Boolean(input.outdoor),
      input.lat ?? null,
      input.lon ?? null,
      input.reminderAt || null,
      input.recurringRule || "",
    ],
  );
  await sql(
    `insert into plan_rsvps (plan_id, user_id, response) values ($1,$2,'going')
     on conflict (plan_id, user_id) do update set response = 'going', updated_at = now()`,
    [planId, input.creatorId],
  );
  return rows[0];
}

export async function updatePlan(
  planId: string,
  patch: Partial<{
    title: string;
    description: string;
    place: string;
    startsAt: string | null;
    endsAt: string | null;
    outdoor: boolean;
    lat: number | null;
    lon: number | null;
    reminderAt: string | null;
    recurringRule: string;
    status: string;
  }>,
): Promise<Plan | null> {
  const rows = await sql<Plan>(
    `update plans set
       title = coalesce($2, title),
       description = coalesce($3, description),
       place = coalesce($4, place),
       starts_at = case when $5::text = '__omit' then starts_at else nullif($5, '')::timestamptz end,
       ends_at = case when $6::text = '__omit' then ends_at else nullif($6, '')::timestamptz end,
       outdoor = coalesce($7, outdoor),
       lat = case when $8::text = '__omit' then lat else $8::float8 end,
       lon = case when $9::text = '__omit' then lon else $9::float8 end,
       reminder_at = case when $10::text = '__omit' then reminder_at else nullif($10, '')::timestamptz end,
       recurring_rule = coalesce($11, recurring_rule),
       status = coalesce($12, status),
       updated_at = now()
     where id = $1
     returning *`,
    [
      planId,
      patch.title ?? null,
      patch.description ?? null,
      patch.place ?? null,
      patch.startsAt === undefined ? "__omit" : patch.startsAt ?? "",
      patch.endsAt === undefined ? "__omit" : patch.endsAt ?? "",
      patch.outdoor ?? null,
      patch.lat === undefined ? "__omit" : patch.lat,
      patch.lon === undefined ? "__omit" : patch.lon,
      patch.reminderAt === undefined ? "__omit" : patch.reminderAt ?? "",
      patch.recurringRule ?? null,
      patch.status ?? null,
    ],
  );
  return rows[0] ?? null;
}

export async function listRsvps(planId: string): Promise<Rsvp[]> {
  return sql(
    `select r.*, p.display_name
     from plan_rsvps r
     join profiles p on p.id = r.user_id
     where r.plan_id = $1
     order by r.updated_at asc`,
    [planId],
  );
}

export async function setRsvp(
  planId: string,
  userId: string,
  response: string,
): Promise<void> {
  await sql(
    `insert into plan_rsvps (plan_id, user_id, response)
     values ($1,$2,$3)
     on conflict (plan_id, user_id) do update
       set response = excluded.response, updated_at = now()`,
    [planId, userId, response],
  );
}

export async function listComments(planId: string): Promise<Comment[]> {
  return sql(
    `select c.*, p.display_name
     from plan_comments c
     join profiles p on p.id = c.user_id
     where c.plan_id = $1
     order by c.created_at asc`,
    [planId],
  );
}

export async function addComment(
  planId: string,
  userId: string,
  body: string,
): Promise<Comment> {
  const commentId = id("cmt");
  const rows = await sql<Comment>(
    `insert into plan_comments (id, plan_id, user_id, body)
     values ($1,$2,$3,$4)
     returning *`,
    [commentId, planId, userId, body.trim()],
  );
  return rows[0];
}

export async function listPolls(
  planId: string,
  userId: string,
): Promise<Poll[]> {
  const polls = await sql<{
    id: string;
    plan_id: string;
    kind: string;
    question: string;
  }>(`select * from plan_polls where plan_id = $1 order by created_at asc`, [
    planId,
  ]);
  const result: Poll[] = [];
  for (const poll of polls) {
    const options = await sql<PollOption>(
      `select o.*,
         (select count(*)::int from poll_votes v where v.option_id = o.id) as votes,
         exists(select 1 from poll_votes v where v.option_id = o.id and v.user_id = $2) as voted
       from poll_options o
       where o.poll_id = $1
       order by o.sort_order asc`,
      [poll.id, userId],
    );
    result.push({ ...poll, options });
  }
  return result;
}

export async function createPoll(input: {
  planId: string;
  kind: string;
  question: string;
  options: string[];
}): Promise<Poll> {
  const pollId = id("poll");
  await sql(
    `insert into plan_polls (id, plan_id, kind, question) values ($1,$2,$3,$4)`,
    [pollId, input.planId, input.kind, input.question.trim()],
  );
  const options: PollOption[] = [];
  for (let i = 0; i < input.options.length; i++) {
    const label = input.options[i].trim();
    if (!label) continue;
    const optionId = id("opt");
    await sql(
      `insert into poll_options (id, poll_id, label, sort_order) values ($1,$2,$3,$4)`,
      [optionId, pollId, label, i],
    );
    options.push({
      id: optionId,
      poll_id: pollId,
      label,
      sort_order: i,
      votes: 0,
      voted: false,
    });
  }
  return {
    id: pollId,
    plan_id: input.planId,
    kind: input.kind,
    question: input.question.trim(),
    options,
  };
}

export async function votePoll(
  optionId: string,
  userId: string,
): Promise<void> {
  const option = await sql<{ poll_id: string }>(
    `select poll_id from poll_options where id = $1`,
    [optionId],
  );
  if (!option[0]) return;
  const siblingIds = await sql<{ id: string }>(
    `select id from poll_options where poll_id = $1`,
    [option[0].poll_id],
  );
  for (const sib of siblingIds) {
    await sql(`delete from poll_votes where option_id = $1 and user_id = $2`, [
      sib.id,
      userId,
    ]);
  }
  await sql(
    `insert into poll_votes (option_id, user_id) values ($1,$2)
     on conflict do nothing`,
    [optionId, userId],
  );
}

export async function listExpenses(planId: string): Promise<Expense[]> {
  return sql(
    `select e.*, p.display_name
     from expenses e
     join profiles p on p.id = e.payer_id
     where e.plan_id = $1
     order by e.created_at asc`,
    [planId],
  );
}

export async function addExpense(input: {
  planId: string;
  payerId: string;
  description: string;
  amountCents: number;
}): Promise<Expense> {
  const expenseId = id("exp");
  const rows = await sql<Expense>(
    `insert into expenses (id, plan_id, payer_id, description, amount_cents)
     values ($1,$2,$3,$4,$5)
     returning *`,
    [
      expenseId,
      input.planId,
      input.payerId,
      input.description.trim(),
      Math.max(0, Math.round(input.amountCents)),
    ],
  );
  return rows[0];
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await sql<Profile>(`select * from profiles where id = $1`, [
    userId,
  ]);
  return rows[0] ?? null;
}

export async function notify(input: {
  userId: string;
  kind?: string;
  title: string;
  body?: string;
  href?: string;
}): Promise<void> {
  await sql(
    `insert into notifications (id, user_id, kind, title, body, href)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      id("ntf"),
      input.userId,
      input.kind || "info",
      input.title,
      input.body || "",
      input.href || "",
    ],
  );
}
