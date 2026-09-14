import type { LayoutDto, SaveLayoutInput, SaveLayoutResultDto } from "@/shared/contracts";
import type { Json } from "../db/database.types";
import type { ServerSupabase } from "../db/supabase";
import { mapPostgresError } from "../http/errors";
import { toSpaceObjectDto, type SpaceObjectRowWithSeat } from "./layout.mapper";
import { getRoom } from "./rooms.service";

/** room 메타 + 오브젝트 전체. 에디터와 뷰어의 초기 문서. */
export async function getLayout(supabase: ServerSupabase, roomId: string): Promise<LayoutDto> {
  const room = await getRoom(supabase, roomId); // 없으면 404
  const { data, error } = await supabase
    .from("space_objects")
    .select("*, seats(*)")
    .eq("room_id", roomId)
    .order("z_index");
  if (error) throw mapPostgresError(error);

  return {
    roomId: room.id,
    width: room.width,
    height: room.height,
    layoutVersion: room.layoutVersion,
    objects: (data as SpaceObjectRowWithSeat[]).map(toSpaceObjectDto),
  };
}

/**
 * 레이아웃 전체 저장. DB 함수 save_room_layout 이 한 트랜잭션으로
 * 삭제(문서에 없는 것) → space_objects upsert → seats upsert → layout_version+1 을 수행한다.
 * p_objects 는 계약 DTO 모양(camelCase) 그대로. SQL 쪽이 그 키를 읽는다.
 * 버전 불일치는 P0001 'version_conflict' → 409, 예약 있는 좌석 삭제는 23503 → 409.
 */
export async function saveLayout(
  supabase: ServerSupabase,
  roomId: string,
  input: SaveLayoutInput,
): Promise<SaveLayoutResultDto> {
  const { data, error } = await supabase.rpc("save_room_layout", {
    p_room_id: roomId,
    p_expected_version: input.expectedVersion,
    p_objects: input.objects as unknown as Json,
  });
  if (error) throw mapPostgresError(error);
  return { layoutVersion: data };
}
