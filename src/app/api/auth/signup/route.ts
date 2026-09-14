import { signup } from "@/app/api/_server/auth/auth.service";
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { signupSchema } from "@/shared/contracts";

/** POST /api/auth/signup — 가입 + 즉시 로그인. 201 + MeDto */
export const POST = withErrorHandling(async (req) => {
  const input = await parseBody(req, signupSchema);
  const supabase = await createServerSupabase();
  const me = await signup(supabase, input);
  return ok(me, 201);
});
