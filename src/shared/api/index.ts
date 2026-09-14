// 클라이언트·서버 공용 진입점.
// server-fetch-context 는 server-only 라 여기서 내보내지 않는다 → "@/shared/api/server-fetch-context" 로 직접 import.
export { apiFetch, ApiError, type ApiFetchInit, type ServerFetchContext } from "./http";
export { getQueryClient, makeQueryClient } from "./query-client";
export { QueryProvider } from "./query-provider";
