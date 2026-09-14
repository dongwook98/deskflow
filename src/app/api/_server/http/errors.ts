import type { ApiErrorCode } from "@/shared/contracts";

/**
 * 서비스 계층이 던지는 에러. withErrorHandling 이 잡아서 HTTP 응답으로 바꾼다.
 * 서비스는 NextResponse 를 모른다 → 테스트에서 Response 없이 서비스만 검증 가능.
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
  }
}

/** supabase-js 가 돌려주는 PostgrestError / RPC 예외의 공통 모양 */
export interface PostgrestLikeError {
  code?: string | null;
  message: string;
  details?: string | null;
}

/**
 * Postgres SQLSTATE → API 에러 코드.
 *
 * 23P01 exclusion_violation   : reservations_no_overlap 제약. 같은 좌석·겹치는 시간
 * 23503 foreign_key_violation : reservations.seat_id on delete restrict. 예약 있는 좌석 삭제 시도
 *                               (현재 스키마에서 사용자 요청으로 도달 가능한 FK 위반은 이것뿐)
 * P0001 raise_exception       : save_room_layout 의 `raise exception 'version_conflict'`
 * P0002 no_data_found         : save_room_layout 의 `room_not_found`
 * PGRST116                    : .single() 이 0행 (RLS 로 안 보이는 행 포함 → 존재 여부 노출 안 함)
 * 42501 insufficient_privilege: RLS 거부. 서비스 앞단의 requireAdmin 을 우회해도 여기서 막힌다
 */
export function mapPostgresError(err: PostgrestLikeError): ApiHttpError {
  switch (err.code) {
    case "23P01":
      return new ApiHttpError(409, "reservation_overlap", "이미 예약된 시간입니다.");
    case "23503":
      return new ApiHttpError(
        409,
        "seat_has_reservations",
        "예약이 있는 좌석은 삭제할 수 없습니다. 예약을 먼저 취소하세요.",
      );
    case "P0001":
      if (err.message.includes("version_conflict")) {
        return new ApiHttpError(
          409,
          "version_conflict",
          "다른 곳에서 먼저 저장되었습니다. 최신 내용을 불러온 뒤 다시 시도하세요.",
        );
      }
      return new ApiHttpError(500, "internal", err.message);
    case "P0002":
    case "PGRST116":
      return new ApiHttpError(404, "not_found", "대상을 찾을 수 없습니다.");
    case "42501":
      return new ApiHttpError(403, "forbidden", "권한이 없습니다.");
    default:
      return new ApiHttpError(500, "internal", err.message);
  }
}
