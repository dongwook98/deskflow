import { NextResponse, type NextRequest } from "next/server";
import type { ApiErrorBody, ApiErrorCode } from "@/shared/contracts";
import { ApiHttpError } from "./errors";

/** 성공 응답. 봉투 없이 데이터 그대로 (D-12). */
export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

/** 본문 없는 성공(로그아웃, 삭제). 클라이언트 apiFetch 는 204 를 undefined 로 받는다. */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/** 실패 응답. shared/contracts 의 ApiErrorBody 계약을 따른다. */
export function fail(
  status: number,
  code: ApiErrorCode,
  message: string,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response>;

/**
 * 모든 Route Handler 를 감싸는 래퍼.
 * - ApiHttpError → 그 상태 코드와 계약 코드로 응답
 * - 그 외 예외 → 500. 내부 메시지는 클라이언트에 노출하지 않고 서버 로그에만 남긴다
 * Ctx 는 동적 라우트의 `{ params: Promise<...> }` 를 그대로 통과시키기 위한 제네릭.
 */
export function withErrorHandling<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof ApiHttpError) return fail(error.status, error.code, error.message);
      console.error("[api] 처리되지 않은 오류", error);
      return fail(500, "internal", "서버 오류가 발생했습니다.");
    }
  };
}
