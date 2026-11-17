import { noStore, requireViewer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { clip, readJsonBounded } from "@/lib/http";
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
  const body = await readJsonBounded<{ action?: string; id?: string }>(request);
  if (body instanceof Response) return body;
  if (body.action === "read_all") {
    await sql(
      `update notifications set read = true where user_id = $1 and read = false`,
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
