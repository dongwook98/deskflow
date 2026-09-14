import type { CreateRoomInput, RoomDto, UpdateRoomInput } from "@/shared/contracts";
import type { ServerSupabase } from "../db/supabase";
import { ApiHttpError, mapPostgresError } from "../http/errors";
import { toRoomDto } from "./rooms.mapper";

// 쓰기 함수들은 호출 전 requireAdmin 을 통과했다고 가정한다. 통과하지 않아도 RLS 가 42501 로 막는다.

export async function listRooms(supabase: ServerSupabase): Promise<RoomDto[]> {
  const { data, error } = await supabase.from("rooms").select("*").order("created_at");
  if (error) throw mapPostgresError(error);
  return data.map(toRoomDto);
}

export async function getRoom(supabase: ServerSupabase, roomId: string): Promise<RoomDto> {
  // maybeSingle: 0행이면 error 가 아니라 null. 존재하지 않는 id 를 404 로 명확히 구분한다.
  const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) throw mapPostgresError(error);
  if (!data) throw new ApiHttpError(404, "not_found", "공간을 찾을 수 없습니다.");
  return toRoomDto(data);
}

export async function createRoom(
  supabase: ServerSupabase,
  userId: string,
  input: CreateRoomInput,
): Promise<RoomDto> {
  const { data, error } = await supabase
    .from("rooms")
    .insert({ ...input, created_by: userId })
    .select("*")
    .single();
  if (error) throw mapPostgresError(error);
  return toRoomDto(data);
}

export async function updateRoom(
  supabase: ServerSupabase,
  roomId: string,
  input: UpdateRoomInput,
): Promise<RoomDto> {
  const { data, error } = await supabase
    .from("rooms")
    .update(input)
    .eq("id", roomId)
    .select("*")
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  if (!data) throw new ApiHttpError(404, "not_found", "공간을 찾을 수 없습니다.");
  return toRoomDto(data);
}

/** rooms 삭제는 space_objects → seats 로 cascade. 예약 있는 좌석이 있으면 23503 → 409. */
export async function deleteRoom(supabase: ServerSupabase, roomId: string): Promise<void> {
  const { error, count } = await supabase
    .from("rooms")
    .delete({ count: "exact" })
    .eq("id", roomId);
  if (error) throw mapPostgresError(error);
  if (!count) throw new ApiHttpError(404, "not_found", "공간을 찾을 수 없습니다.");
}
