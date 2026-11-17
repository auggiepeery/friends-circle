import { noStore, requireViewer } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { Notification } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const notifications = await sql<Notification>(
    `select * from notifications
     where user_id = $1
     order by created_at desc
     limit 40`,
    [viewer.sub],
  );
  return Response.json({ notifications }, { headers: noStore });
}

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const body = (await request.json()) as { action?: string; id?: string };
  if (body.action === "read_all") {
    await sql(
      `update notifications set read = true where user_id = $1 and read = false`,
      [viewer.sub],
    );
  } else if (body.action === "read" && body.id) {
    await sql(
      `update notifications set read = true where id = $1 and user_id = $2`,
      [body.id, viewer.sub],
    );
  }
  return Response.json({ ok: true }, { headers: noStore });
}
