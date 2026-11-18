import { noStore } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Share-by-link disabled — use circle invite codes instead. */
export async function GET(_request: Request, _ctx: Ctx) {
  return Response.json(
    { error: "use_invite_link" },
    { status: 410, headers: noStore },
  );
}

export async function POST(request: Request, _ctx: Ctx) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  return Response.json(
    { error: "use_invite_link" },
    { status: 410, headers: noStore },
  );
}
