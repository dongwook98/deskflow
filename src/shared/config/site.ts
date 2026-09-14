/**
 * 서버가 자기 자신의 /api 를 호출할 때(RSC prefetch, 대안 B) 사용할 origin.
 *
 * 우선순위:
 * 1. NEXT_PUBLIC_SITE_URL — 배포 환경에서 명시. 끝의 슬래시는 제거
 * 2. 요청 헤더의 host — 로컬 개발에서 포트가 달라도(3000, 3199 ...) 자동으로 맞음
 * 3. VERCEL_URL — Vercel 이 주입. 프로토콜이 없어 https 를 붙임
 * 4. localhost:3000 — 마지막 폴백
 */
export function getSiteOrigin(fallback?: { host: string | null; proto: string | null }): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (fallback?.host) return `${fallback.proto ?? "http"}://${fallback.host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
