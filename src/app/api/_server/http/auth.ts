import type { ServerSupabase } from "../db/supabase";
import { ApiHttpError, mapPostgresError } from "./errors";

export interface AuthUser {
  id: string;
}

/**
 * 로그인 사용자 확인. 없으면 401.
 * getUser() 는 Supabase Auth 서버에 토큰을 검증시킨다. getSession() 은 쿠키를 읽기만 하므로
 * 위조된 쿠키를 신뢰할 수 있어 서버에서는 쓰지 않는다.
 */
export async function requireUser(supabase: ServerSupabase): Promise<AuthUser> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiHttpError(401, "unauthorized", "로그인이 필요합니다.");
  return { id: user.id };
}

/**
 * admin 확인. 아니면 403.
 * RLS 가 최종 방어선이라 이 검사가 없어도 쓰기는 실패한다. 여기서 막는 이유는
 * 빠른 실패와 명확한 메시지(RLS 거부는 "권한 없음" 만 알려준다).
 */
export async function requireAdmin(supabase: ServerSupabase): Promise<AuthUser> {
  const user = await requireUser(supabase);
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (error) throw mapPostgresError(error);
  if (data.role !== "admin") {
    throw new ApiHttpError(403, "forbidden", "관리자만 사용할 수 있습니다.");
  }
  return user;
}
