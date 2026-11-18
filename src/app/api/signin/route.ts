import { noStore } from "@/lib/auth";
import { founderSetupSecret, memberCount } from "@/lib/group";

export const dynamic = "force-dynamic";

/**
 * Public status only — never returns friend names or IDs
 * (roster would enable credential stuffing against known names).
 */
export async function GET() {
  const empty = (await memberCount()) === 0;
  return Response.json(
    {
      empty,
      founderAvailable: Boolean(founderSetupSecret()),
    },
    { headers: noStore },
  );
}
