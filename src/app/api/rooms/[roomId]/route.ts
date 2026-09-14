import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireAdmin, requireUser } from "@/app/api/_server/http/auth";
import { noContent, ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { deleteRoom, getRoom, updateRoom } from "@/app/api/_server/rooms/rooms.service";
import { updateRoomSchema } from "@/shared/contracts";

// Next 16: 동적 세그먼트 params 는 Promise
type Ctx = { params: Promise<{ roomId: string }> };

/** GET /api/rooms/:roomId — 로그인 사용자 전원 */
export const GET = withErrorHandling<Ctx>(async (_req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  return ok(await getRoom(supabase, roomId));
});

/** PATCH /api/rooms/:roomId — admin. 부분 수정 */
export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireAdmin(supabase);
  const input = await parseBody(req, updateRoomSchema);
  return ok(await updateRoom(supabase, roomId, input));
});

/** DELETE /api/rooms/:roomId — admin. 204 */
export const DELETE = withErrorHandling<Ctx>(async (_req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireAdmin(supabase);
  await deleteRoom(supabase, roomId);
  return noContent();
});
