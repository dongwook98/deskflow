import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireAdmin } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseQuery } from "@/app/api/_server/http/validate";
import { listAllReservations } from "@/app/api/_server/reservations/reservations.service";
import { adminReservationsQuerySchema } from "@/shared/contracts";

/** GET /api/admin/reservations?roomId&date — admin */
export const GET = withErrorHandling(async (req) => {
  const supabase = await createServerSupabase();
  await requireAdmin(supabase);
  const query = parseQuery(new URL(req.url), adminReservationsQuerySchema);
  return ok(await listAllReservations(supabase, query));
});
