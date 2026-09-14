// API 실패 응답 계약. 서버(_server/http)와 클라이언트(shared/api/http) 가 공유한다.

export const API_ERROR_CODES = [
  "unauthorized", // 401 로그인 필요
  "forbidden", // 403 권한 없음 (admin 전용 등)
  "invalid_input", // 400 zod 검증 실패
  "not_found", // 404
  "version_conflict", // 409 레이아웃 저장 시 layout_version 불일치
  "reservation_overlap", // 409 좌석·시간 겹침 (Postgres 23P01)
  "seat_has_reservations", // 409 예약 있는 좌석 삭제 시도 (Postgres 23503)
  "internal", // 500
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}
