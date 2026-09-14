import "server-only";
import { headers } from "next/headers";
import { getSiteOrigin } from "@/shared/config/site";
import type { ServerFetchContext } from "./http";

/**
 * RSC 에서 apiFetch 에 넘길 컨텍스트를 현재 요청 헤더로부터 만든다.
 *
 * - origin: 서버가 자기 /api 를 절대 URL 로 호출해야 하므로 필요. host 헤더를 폴백으로 써서
 *   로컬 포트가 달라도 동작한다.
 * - cookie: Supabase 세션 쿠키를 그대로 전달해야 /api 쪽에서 로그인 사용자로 인식한다.
 *
 * `server-only` 를 import 하므로 클라이언트 컴포넌트에서 실수로 가져오면 빌드가 실패한다.
 * 그래서 shared/api/index.ts 에서는 내보내지 않고 직접 경로로 import 한다.
 */
export async function serverFetchContext(): Promise<ServerFetchContext> {
  const h = await headers();
  return {
    origin: getSiteOrigin({ host: h.get("host"), proto: h.get("x-forwarded-proto") }),
    cookie: h.get("cookie") ?? "",
  };
}
