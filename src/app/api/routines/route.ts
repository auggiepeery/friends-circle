import { noStore, requireViewer } from "@/lib/auth";
import { requireCircleMember } from "@/lib/group";
import { clip, readJsonBounded } from "@/lib/http";
import {
  MAX_ROUTINE_LABEL,
  createRoutine,
  deleteRoutine,
  describeRoutine,
  listRoutinesForUser,
  updateRoutine,
  validateRoutineInput,
} from "@/lib/routines";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const routines = await listRoutinesForUser(viewer.sub);
  return Response.json(
    {
      routines,
      count: routines.length,
      has_routines: routines.length > 0,
      described: routines.map(describeRoutine),
    },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const body = await readJsonBounded<{
    weekday?: number;
    start_minute?: number;
    end_minute?: number;
    label?: string;
  }>(request);
  if (body instanceof Response) return body;

  const validated = validateRoutineInput({
    weekday: body.weekday,
    start_minute: body.start_minute,
    end_minute: body.end_minute,
    label: clip(body.label, MAX_ROUTINE_LABEL),
  });
  if (!validated.ok) {
    return Response.json(
      { error: validated.error },
      { status: 400, headers: noStore },
    );
  }

  const result = await createRoutine(viewer.sub, validated.value);
  if (!result.ok) {
    const status = result.error === "routine_limit" ? 409 : 500;
    return Response.json({ error: result.error }, { status, headers: noStore });
  }
  return Response.json({ routine: result.routine }, { headers: noStore });
}

export async function PUT(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const body = await readJsonBounded<{
    id?: string;
    weekday?: number;
    start_minute?: number;
    end_minute?: number;
    label?: string;
  }>(request);
  if (body instanceof Response) return body;

  const routineId = clip(body.id, 64);
  if (!routineId) {
    return Response.json(
      { error: "id_required" },
      { status: 400, headers: noStore },
    );
  }

  const validated = validateRoutineInput({
    weekday: body.weekday,
    start_minute: body.start_minute,
    end_minute: body.end_minute,
    label: clip(body.label, MAX_ROUTINE_LABEL),
  });
  if (!validated.ok) {
    return Response.json(
      { error: validated.error },
      { status: 400, headers: noStore },
    );
  }

  const result = await updateRoutine(viewer.sub, routineId, validated.value);
  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: result.error === "not_found" ? 404 : 400, headers: noStore },
    );
  }
  return Response.json({ routine: result.routine }, { headers: noStore });
}

export async function DELETE(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const gate = await requireCircleMember(viewer.sub);
  if (gate !== true) return gate;

  const url = new URL(request.url);
  let routineId = clip(url.searchParams.get("id") || "", 64);
  if (!routineId) {
    const body = await readJsonBounded<{ id?: string }>(request);
    if (body instanceof Response) return body;
    routineId = clip(body.id, 64);
  }
  if (!routineId) {
    return Response.json(
      { error: "id_required" },
      { status: 400, headers: noStore },
    );
  }

  const result = await deleteRoutine(viewer.sub, routineId);
  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: 404, headers: noStore },
    );
  }
  return Response.json({ ok: true }, { headers: noStore });
}
