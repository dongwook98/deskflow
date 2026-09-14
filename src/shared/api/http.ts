import { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode } from "@/shared/contracts";

/**
 * API 호출 실패를 나타내는 에러.
 * TanStack Query 의 `error` 로 그대로 전달되므로, 컴포넌트는 `error instanceof ApiError` 로
 * 상태 코드와 계약상의 code 를 읽어 분기한다 (예: 409 version_conflict → 충돌 다이얼로그).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * RSC(서버 컴포넌트)에서 prefetch 할 때만 넘기는 컨텍스트.
 * 서버에는 "현재 origin" 과 "브라우저 쿠키" 라는 개념이 없으므로 요청 헤더에서 꺼내 명시적으로 전달한다.
 * 브라우저에서는 넘기지 않는다 (상대 경로 + 브라우저가 쿠키를 자동 첨부).
 */
export interface ServerFetchContext {
  origin: string;
  cookie: string;
}

export interface ApiFetchInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** 객체를 넘기면 JSON 으로 직렬화한다. */
  body?: unknown;
  signal?: AbortSignal;
}

/** 응답 본문이 계약(`{ error: { code, message } }`)을 따르는지 런타임 검사. */
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    typeof message === "string" &&
    typeof code === "string" &&
    (API_ERROR_CODES as readonly string[]).includes(code)
  );
}

/**
 * 실패 응답을 ApiError 로 변환.
 * 서버가 계약대로 응답하지 않는 경우(프록시의 HTML 502, 빈 본문 등)도 있으므로
 * JSON 파싱 실패나 형식 불일치는 전부 `internal` 로 감싼다.
 */
async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 본문이 JSON 이 아님. body 는 null 로 두고 아래 폴백으로 간다.
  }
  if (isApiErrorBody(body)) return new ApiError(res.status, body.error.code, body.error.message);
  return new ApiError(res.status, "internal", `요청 실패 (${res.status})`);
}

/**
 * 모든 API 호출의 단일 진입점. entities 의 queryOptions 와 features 의 mutation 이 이것만 쓴다.
 *
 * - 성공(2xx): 응답 JSON 을 T 로 반환. 204 는 본문이 없으므로 undefined
 * - 실패: ApiError throw. `!res.ok` 만 검사하므로 3xx 리다이렉트는 fetch 가 따라간 뒤의 결과로 판단
 * - `cache: 'no-store'`: Next 의 fetch 캐시를 끈다. 캐싱은 TanStack Query 가 담당
 * - ctx 가 있으면 서버 호출: 절대 URL + cookie 헤더 수동 전달
 */
export async function apiFetch<T>(
  path: string,
  init: ApiFetchInit = {},
  ctx?: ServerFetchContext,
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (ctx?.cookie) headers.set("cookie", ctx.cookie);

  const res = await fetch(ctx ? `${ctx.origin}${path}` : path, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    cache: "no-store",
    signal: init.signal,
  });

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
