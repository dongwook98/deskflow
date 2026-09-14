import type {
  AdminReservationsQuery,
  CreateReservationInput,
  ReservationDto,
} from "@/shared/contracts";
import type { ServerSupabase } from "../db/supabase";
import { ApiHttpError, mapPostgresError } from "../http/errors";
import { toReservationDto } from "./reservations.mapper";

// 서버는 entities 를 import 할 수 없으므로(레이어 경계) 타임존 상수를 여기 둔다 (D-33)
const KST_OFFSET = "+09:00";

/** 본인 예약 전체(취소 포함). RLS 가 user_id = auth.uid() 로 거른다. 시작 시각 내림차순 */
export async function listMyReservations(
  supabase: ServerSupabase,
  userId: string,
): Promise<ReservationDto[]> {
  const { data, error } = await supabase
    .from("reservation_details")
    .select("*")
    .eq("user_id", userId)
    .order("start_at", { ascending: false });
  if (error) throw mapPostgresError(error);
  return data.map(toReservationDto);
}

async function getReservation(supabase: ServerSupabase, id: string): Promise<ReservationDto> {
  const { data, error } = await supabase
    .from("reservation_details")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  if (!data) throw new ApiHttpError(404, "not_found", "예약을 찾을 수 없습니다.");
  return toReservationDto(data);
}

/**
 * 예약 생성. 겹침은 검사하지 않는다 — insert 가 23P01 이면 mapPostgresError 가 409 reservation_overlap.
 * 사전 검사는 UX 메시지를 위한 것만: 과거 시각, 사용 불가 좌석.
 */
export async function createReservation(
  supabase: ServerSupabase,
  userId: string,
  input: CreateReservationInput,
): Promise<ReservationDto> {
  if (new Date(input.startAt).getTime() <= Date.now()) {
    throw new ApiHttpError(400, "invalid_input", "지난 시각은 예약할 수 없습니다.");
  }

  const { data: seat, error: seatError } = await supabase
    .from("seats")
    .select("status")
    .eq("id", input.seatId)
    .maybeSingle();
  if (seatError) throw mapPostgresError(seatError);
  if (!seat) throw new ApiHttpError(404, "not_found", "좌석을 찾을 수 없습니다.");
  if (seat.status === "disabled") {
    throw new ApiHttpError(400, "invalid_input", "사용 불가 좌석입니다.");
  }

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      user_id: userId,
      seat_id: input.seatId,
      start_at: input.startAt,
      end_at: input.endAt,
    })
    .select("id")
    .single();
  if (error) throw mapPostgresError(error);
  return getReservation(supabase, data.id);
}

/** 취소(soft). RLS: 본인 또는 admin. 이미 취소된 예약은 그대로 반환(멱등). */
export async function cancelReservation(
  supabase: ServerSupabase,
  reservationId: string,
): Promise<ReservationDto> {
  const current = await getReservation(supabase, reservationId); // 없거나 권한 없으면 404
  if (current.status === "cancelled") return current;

  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw mapPostgresError(error);
  return getReservation(supabase, reservationId);
}

/** 관리자 현황. roomId / date(KST 하루) 필터. 취소 포함, 시작 시각 오름차순 */
export async function listAllReservations(
  supabase: ServerSupabase,
  query: AdminReservationsQuery,
): Promise<ReservationDto[]> {
  let q = supabase.from("reservation_details").select("*").order("start_at", { ascending: true });
  if (query.roomId) q = q.eq("room_id", query.roomId);
  if (query.date) {
    const dayStart = `${query.date}T00:00:00${KST_OFFSET}`;
    const nextDay = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("start_at", dayStart).lt("start_at", nextDay);
  }
  const { data, error } = await q;
  if (error) throw mapPostgresError(error);
  return data.map(toReservationDto);
}
