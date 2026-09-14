import { logout } from "@/app/api/_server/auth/auth.service";
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { noContent, withErrorHandling } from "@/app/api/_server/http/response";

/** POST /api/auth/logout — 204. 미로그인 상태여도 204 (멱등) */
export const POST = withErrorHandling(async () => {
  const supabase = await createServerSupabase();
  await logout(supabase);
  return noContent();
});
