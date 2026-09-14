"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/shared/api";
import { loginSchema } from "@/shared/contracts";
import { Button, Field, Input } from "@/shared/ui";
import { useLogin } from "../api/mutations";

/**
 * 비제어 폼 + 제출 시 zod 검증. 서버와 같은 loginSchema 를 쓰므로 검증 규칙이 한 곳에 있다.
 * next: 로그인 후 돌아갈 경로. proxy 가 /login?next=... 로 붙여 준다.
 */
export function LoginForm({ next }: { next?: string }) {
  const login = useLogin(next);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setFieldError("이메일 형식과 8자 이상 비밀번호를 확인하세요.");
      return;
    }
    setFieldError(null);
    login.mutate(parsed.data);
  }

  const serverError =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? "로그인에 실패했습니다."
        : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="비밀번호" htmlFor="password" error={fieldError ?? undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? "로그인 중..." : "로그인"}
      </Button>
    </form>
  );
}
