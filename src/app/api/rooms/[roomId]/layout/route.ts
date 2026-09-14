import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireAdmin, requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { getLayout, saveLayout } from "@/app/api/_server/rooms/layout.service";
import { saveLayoutSchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ roomId: string }> };

/** GET /api/rooms/:roomId/layout — 로그인 사용자. 에디터·뷰어 공용 */
export const GET = withErrorHandling<Ctx>(async (_req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  return ok(await getLayout(supabase, roomId));
});

/** PUT /api/rooms/:roomId/layout — admin. body: { expectedVersion, objects }. 409 on conflict */
export const PUT = withErrorHandling<Ctx>(async (req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireAdmin(supabase);
  const input = await parseBody(req, saveLayoutSchema);
  return ok(await saveLayout(supabase, roomId, input));
});
