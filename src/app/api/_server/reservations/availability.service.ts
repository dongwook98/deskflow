import type { AvailabilityDto, AvailabilityQuery } from "@/shared/contracts";
import type { ServerSupabase } from "../db/supabase";
import { mapPostgresError } from "../http/errors";

/**
 * 시간 범위와 겹치는 reserved 예약의 seat_id 만. security definer RPC 라 남의 예약 행은 노출되지 않는다.
 * 뷰어는 이 목록 + 좌석 status 로 available / reserved / mine / disabled 를 그린다.
 */
export async function getSeatAvailability(
  supabase: ServerSupabase,
  roomId: string,
  query: AvailabilityQuery,
): Promise<AvailabilityDto> {
  const { data, error } = await supabase.rpc("get_seat_availability", {
    p_room_id: roomId,
    p_start_at: query.startAt,
    p_end_at: query.endAt,
  });
  if (error) throw mapPostgresError(error);
  return { occupied: data.map((r) => ({ seatId: r.seat_id, mine: r.mine })) };
}
