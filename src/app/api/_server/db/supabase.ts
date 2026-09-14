import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/** 서비스 함수들이 인자로 받는 타입. 테스트에서는 이 모양의 가짜 객체를 주입한다. */
export type ServerSupabase = SupabaseClient<Database>;

/**
 * Route Handler 전용 Supabase 클라이언트.
 * 요청 쿠키에서 세션을 복원하므로 이후 쿼리는 로그인 사용자 권한(RLS)으로 실행된다.
 * 요청마다 새로 만든다. 모듈 싱글톤으로 두면 사용자 간 세션이 섞인다.
 */
export async function createServerSupabase(): Promise<ServerSupabase> {
  const { url, key } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Route Handler 에서는 쿠키 쓰기가 가능하다 (로그인 시 세션 쿠키 발급, 토큰 갱신).
        // RSC 에서 호출되면 Next 가 throw 하므로 무시한다. RSC 의 세션 갱신은 proxy.ts 가 담당.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* RSC 컨텍스트: 쓰기 불가, 무시 */
        }
      },
    },
  });
}
