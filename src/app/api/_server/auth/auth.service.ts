import type { LoginInput, MeDto, SignupInput } from "@/shared/contracts";
import type { ServerSupabase } from "../db/supabase";
import { ApiHttpError, mapPostgresError } from "../http/errors";

/** profiles 에서 현재 사용자 정보. role 은 여기서만 읽는다 (auth.users 의 metadata 는 사용자가 바꿀 수 있으므로 신뢰하지 않음). */
export async function getMe(supabase: ServerSupabase, userId: string): Promise<MeDto> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", userId)
    .single();
  if (error) throw mapPostgresError(error);
  return { id: data.id, name: data.name, role: data.role };
}

/**
 * 회원가입. 성공하면 세션 쿠키가 발급되고(createServerSupabase 의 setAll) 바로 로그인 상태가 된다.
 * name 은 raw_user_meta_data 로 전달 → DB 트리거 handle_new_user 가 profiles.name 으로 복사.
 */
export async function signup(supabase: ServerSupabase, input: SignupInput): Promise<MeDto> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { name: input.name } },
  });
  if (error) throw new ApiHttpError(400, "invalid_input", error.message);
  if (!data.user) throw new ApiHttpError(500, "internal", "회원가입 결과가 비어 있습니다.");
  if (!data.session) {
    // Supabase Auth 의 "Confirm email" 이 켜져 있으면 세션 없이 user 만 돌아온다 (D-35)
    throw new ApiHttpError(
      400,
      "invalid_input",
      "이메일 확인이 필요한 설정입니다. Supabase 대시보드 Authentication > Email 에서 Confirm email 을 끄세요.",
    );
  }
  return getMe(supabase, data.user.id);
}

/** 이메일/비밀번호 로그인. 어느 쪽이 틀렸는지는 알려주지 않는다 (계정 존재 여부 노출 방지). */
export async function login(supabase: ServerSupabase, input: LoginInput): Promise<MeDto> {
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error || !data.user) {
    throw new ApiHttpError(401, "unauthorized", "이메일 또는 비밀번호가 올바르지 않습니다.");
  }
  return getMe(supabase, data.user.id);
}

/** 세션 종료. 쿠키 삭제는 setAll 이 처리한다. */
export async function logout(supabase: ServerSupabase): Promise<void> {
  await supabase.auth.signOut();
}
