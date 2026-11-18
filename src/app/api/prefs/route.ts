import { noStore, requireViewer } from "@/lib/auth";
import { requireCircleMember } from "@/lib/group";
import { readJsonBounded } from "@/lib/http";
import { getUiPrefs, setUiPrefs } from "@/lib/prefs-server";
import { type ClientPrefs, normalizePrefs } from "@/lib/prefs-shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  const { prefs, empty } = await getUiPrefs(viewer.sub);
  return Response.json(
    { prefs, empty, userId: viewer.sub },
    { headers: noStore },
  );
}

export async function PUT(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  const body = await readJsonBounded<{ prefs?: Partial<ClientPrefs> }>(request);
  if (body instanceof Response) return body;
  const prefs = await setUiPrefs(viewer.sub, normalizePrefs(body.prefs ?? {}));
  return Response.json(
    { prefs, empty: false, userId: viewer.sub },
    { headers: noStore },
  );
}
