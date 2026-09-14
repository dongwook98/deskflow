import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import {
  createReservation,
  listMyReservations,
} from "@/app/api/_server/reservations/reservations.service";
import { createReservationSchema } from "@/shared/contracts";

/** GET /api/reservations — 내 예약 */
export const GET = withErrorHandling(async () => {
  const supabase = await createServerSupabase();
  const user = await requireUser(supabase);
  return ok(await listMyReservations(supabase, user.id));
});

/** POST /api/reservations — 201 | 409 reservation_overlap */
export const POST = withErrorHandling(async (req) => {
  const supabase = await createServerSupabase();
  const user = await requireUser(supabase);
  const input = await parseBody(req, createReservationSchema);
  return ok(await createReservation(supabase, user.id, input), 201);
});
