import { noStore } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Share-by-link disabled — use circle invite codes instead. */
export async function GET(_request: Request, _ctx: Ctx) {
  return Response.json(
    { error: "use_invite_link" },
    { status: 410, headers: noStore },
  );
}

export async function POST(_request: Request, _ctx: Ctx) {
  return Response.json(
    { error: "use_invite_link" },
    { status: 410, headers: noStore },
  );
}
