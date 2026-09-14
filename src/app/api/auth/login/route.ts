import { login } from "@/app/api/_server/auth/auth.service";
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { loginSchema } from "@/shared/contracts";

/** POST /api/auth/login — 200 + MeDto, 세션 쿠키 Set-Cookie */
export const POST = withErrorHandling(async (req) => {
  const input = await parseBody(req, loginSchema);
  const supabase = await createServerSupabase();
  const me = await login(supabase, input);
  return ok(me);
});
