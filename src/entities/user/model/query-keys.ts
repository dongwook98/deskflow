/** 인증 관련 쿼리 키. 로그인/로그아웃 시 authKeys.me() 를 갱신·삭제한다. */
export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};
