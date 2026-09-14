/**
 * Supabase 연결에 필요한 env 를 읽는다.
 *
 * 호출 시점에 검증한다. 모듈 import 시점에 검증하면 env 가 빠졌을 때 proxy.ts 까지 죽어서
 * 모든 요청이 500 이 된다 (이전 프로젝트에서 실제로 겪은 문제).
 *
 * proxy.ts(미들웨어)에서도 쓰므로 next/headers 나 server-only 를 import 하지 않는다.
 */
export function getSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // 새 Supabase 프로젝트는 sb_publishable_ 키를 발급한다. 구 프로젝트의 anon 키도 같은 역할이라 폴백으로 둔다.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase env 누락: NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY(또는 NEXT_PUBLIC_SUPABASE_ANON_KEY) 를 .env.local 에 설정하세요.",
    );
  }
  return { url, key };
}
