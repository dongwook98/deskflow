import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { cancelReservation } from "@/app/api/_server/reservations/reservations.service";

type Ctx = { params: Promise<{ reservationId: string }> };

/** POST /api/reservations/:id/cancel — 상태 전이는 동사 서브리소스 (D-13) */
export const POST = withErrorHandling<Ctx>(async (_req, { params }) => {
  const { reservationId } = await params;
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  return ok(await cancelReservation(supabase, reservationId));
});
