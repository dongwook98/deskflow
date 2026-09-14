import Link from "next/link";
import { SignupForm } from "@/features/auth";

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">회원가입</h1>
      <SignupForm />
      <p className="text-sm text-zinc-600">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="underline">
          로그인
        </Link>
      </p>
    </main>
  );
}
