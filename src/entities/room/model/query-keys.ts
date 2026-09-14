/**
 * room 관련 쿼리 키 팩토리. 계층 구조라 `roomKeys.all` 무효화 한 번으로 하위 전부 갱신된다.
 * layout / availability 는 Plan B, C 에서 사용.
 */
export const roomKeys = {
  all: ["rooms"] as const,
  list: () => [...roomKeys.all, "list"] as const,
  detail: (roomId: string) => [...roomKeys.all, "detail", roomId] as const,
  layout: (roomId: string) => [...roomKeys.all, "layout", roomId] as const,
  availability: (roomId: string, startAt: string, endAt: string) =>
    [...roomKeys.all, "availability", roomId, startAt, endAt] as const,
};
