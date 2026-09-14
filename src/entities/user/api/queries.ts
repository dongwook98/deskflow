import { queryOptions } from "@tanstack/react-query";
import { apiFetch, type ServerFetchContext } from "@/shared/api";
import type { MeDto } from "@/shared/contracts";
import { authKeys } from "../model/query-keys";

/**
 * 현재 사용자 쿼리. 서버 prefetch(ctx 있음)와 클라이언트 useQuery(ctx 없음)가 같은 키를 쓴다.
 * retry: false — 401 은 재시도해도 401. 기본 retry 정책도 4xx 를 걸러내지만 명시해 둔다.
 */
export const meQuery = (ctx?: ServerFetchContext) =>
  queryOptions({
    queryKey: authKeys.me(),
    queryFn: () => apiFetch<MeDto>("/api/auth/me", undefined, ctx),
    retry: false,
  });
