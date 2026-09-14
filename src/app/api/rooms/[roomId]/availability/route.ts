import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseQuery } from "@/app/api/_server/http/validate";
import { getSeatAvailability } from "@/app/api/_server/reservations/availability.service";
import { availabilityQuerySchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ roomId: string }> };

/** GET /api/rooms/:roomId/availability?startAt=&endAt= */
export const GET = withErrorHandling<Ctx>(async (req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  const query = parseQuery(new URL(req.url), availabilityQuerySchema);
  return ok(await getSeatAvailability(supabase, roomId, query));
});
