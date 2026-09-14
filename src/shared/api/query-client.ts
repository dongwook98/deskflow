import { QueryClient, isServer } from "@tanstack/react-query";
import { ApiError } from "./http";

/**
 * QueryClient 기본 옵션.
 *
 * - staleTime 60초: 서버에서 prefetch 해 hydrate 한 데이터를 클라이언트가 마운트 직후
 *   다시 fetch 하지 않도록 한다. 0 이면 prefetch 의 의미가 없다 (TanStack SSR 가이드 권장값).
 * - retry: 4xx 는 다시 보내도 결과가 같으므로 재시도하지 않는다. 5xx/네트워크 오류만 최대 2회.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * 서버: 호출마다 새 클라이언트. 요청 간에 캐시가 섞이면 다른 사용자의 데이터가 새어 나갈 수 있다.
 * 브라우저: 모듈 싱글톤. React 가 suspend 로 리렌더해도 같은 캐시를 유지해야 한다.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
