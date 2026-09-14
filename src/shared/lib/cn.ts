/**
 * 조건부 클래스 결합. falsy 는 버리고 공백으로 이어 붙인다.
 * tailwind-merge 는 쓰지 않는다 — 충돌하는 유틸리티(p-2 vs p-4)는 호출자가 피한다. 의존성 하나 아낌.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
