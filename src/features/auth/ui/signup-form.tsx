"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/shared/api";
import { signupSchema } from "@/shared/contracts";
import { Button, Field, Input } from "@/shared/ui";
import { useSignup } from "../api/mutations";

export function SignupForm() {
  const signup = useSignup();
  const [fieldError, setFieldError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signupSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setFieldError("이름(1~30자), 이메일 형식, 8자 이상 비밀번호를 확인하세요.");
      return;
    }
    setFieldError(null);
    signup.mutate(parsed.data);
  }

  const serverError =
    signup.error instanceof ApiError
      ? signup.error.message
      : signup.error
        ? "가입에 실패했습니다."
        : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="이름" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={30} />
      </Field>
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="비밀번호" htmlFor="password" error={fieldError ?? undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
      <Button type="submit" disabled={signup.isPending}>
        {signup.isPending ? "가입 중..." : "회원가입"}
      </Button>
    </form>
  );
}
