import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireAdmin, requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { createRoom, listRooms } from "@/app/api/_server/rooms/rooms.service";
import { createRoomSchema } from "@/shared/contracts";

/** GET /api/rooms — 로그인 사용자 전원. RoomDto[] */
export const GET = withErrorHandling(async () => {
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  return ok(await listRooms(supabase));
});

/** POST /api/rooms — admin. 201 + RoomDto */
export const POST = withErrorHandling(async (req) => {
  const supabase = await createServerSupabase();
  const admin = await requireAdmin(supabase);
  const input = await parseBody(req, createRoomSchema);
  return ok(await createRoom(supabase, admin.id, input), 201);
});
