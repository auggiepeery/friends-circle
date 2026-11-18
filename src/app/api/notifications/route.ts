import { noStore, requireViewer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { requireCircleMember } from "@/lib/group";
import { clip, readJsonBounded } from "@/lib/http";
import { purgeOrphanPlanNotifications } from "@/lib/plans";
import type { Notification } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Alerts for the viewer, excluding any that deep-link to deleted plans. */
const LIVE_ALERTS_SQL = `select n.*
   from notifications n
   where n.user_id = $1
     and (
       n.href = ''
       or n.href not like '/plans/%'
       or exists (
         select 1 from plans p
         where n.href = '/plans/' || p.id
            or n.href like '/plans/' || p.id || '/%'
       )
     )
   order by n.created_at desc
   limit 40`;

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  // Clean legacy orphans, then list only live alerts.
  await purgeOrphanPlanNotifications(viewer.sub);
  const notifications = await sql<Notification>(LIVE_ALERTS_SQL, [viewer.sub]);
  return Response.json({ notifications }, { headers: noStore });
}

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  const body = await readJsonBounded<{ action?: string; id?: string }>(request);
  if (body instanceof Response) return body;
  if (body.action === "read_all") {
    await sql(
      `update notifications n
       set read = true
       where n.user_id = $1
         and n.read = false
         and (
           n.href = ''
           or n.href not like '/plans/%'
           or exists (
             select 1 from plans p
             where n.href = '/plans/' || p.id
                or n.href like '/plans/' || p.id || '/%'
           )
         )`,
      [viewer.sub],
    );
  } else if (body.action === "read") {
    const id = clip(body.id, 80);
    if (id) {
      await sql(
        `update notifications set read = true where id = $1 and user_id = $2`,
        [id, viewer.sub],
      );
    }
  }
  return Response.json({ ok: true }, { headers: noStore });
}
