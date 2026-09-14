"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/shared/api";
import type { LoginInput, MeDto, SignupInput } from "@/shared/contracts";
import { authKeys } from "@/entities/user";

/**
 * 로그인/가입 성공 공통 처리.
 * - me 캐시를 응답으로 채워 헤더가 즉시 이름을 표시
 * - router.refresh(): RSC 레이아웃이 새 쿠키로 다시 렌더되도록 (proxy 가 세션을 인식)
 */
function useAuthSuccess() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return (me: MeDto, next: string) => {
    queryClient.setQueryData(authKeys.me(), me);
    router.replace(next);
    router.refresh();
  };
}

export function useLogin(next = "/rooms") {
  const onSuccess = useAuthSuccess();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiFetch<MeDto>("/api/auth/login", { method: "POST", body: input }),
    onSuccess: (me) => onSuccess(me, next),
  });
}

export function useSignup(next = "/rooms") {
  const onSuccess = useAuthSuccess();
  return useMutation({
    mutationFn: (input: SignupInput) =>
      apiFetch<MeDto>("/api/auth/signup", { method: "POST", body: input }),
    onSuccess: (me) => onSuccess(me, next),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      // 다른 사용자로 다시 로그인할 수 있으므로 캐시 전체를 비운다
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
  });
}
