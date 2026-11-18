import { noStore, requireViewer } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/csrf";
import { requireCircleMember } from "@/lib/group";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Email/name friend search removed — use circle invite links instead. */
export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  return Response.json(
    { error: "use_invite_link", friends: [], pending: [] },
    { status: 410, headers: noStore },
  );
}

export async function POST(request: Request) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  if (!rateLimit(clientKey(request, "friends-write"), 20, 60_000)) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStore },
    );
  }
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;
  return Response.json(
    { error: "use_invite_link" },
    { status: 410, headers: noStore },
  );
}
