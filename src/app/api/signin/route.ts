import { noStore } from "@/lib/auth";
import { founderSetupSecret, listPickerFriends, memberCount } from "@/lib/group";

export const dynamic = "force-dynamic";

/** Public roster for the who-are-you picker. */
export async function GET() {
  const friends = await listPickerFriends();
  const empty = (await memberCount()) === 0;
  return Response.json(
    {
      friends,
      empty,
      founderAvailable: Boolean(founderSetupSecret()),
    },
    { headers: noStore },
  );
}
