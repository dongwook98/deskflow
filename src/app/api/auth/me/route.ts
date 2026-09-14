import { getMe } from "@/app/api/_server/auth/auth.service";
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";

/** GET /api/auth/me — 현재 사용자. 레이아웃의 role 가드와 헤더가 사용 */
export const GET = withErrorHandling(async () => {
  const supabase = await createServerSupabase();
  const user = await requireUser(supabase);
  return ok(await getMe(supabase, user.id));
});
