import Link from "next/link";
import { LoginForm } from "@/features/auth";

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  // 오픈 리다이렉트 방지: 같은 사이트의 절대 경로만 허용 ("//evil.com" 도 차단)
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">DeskFlow 로그인</h1>
      <LoginForm next={safeNext} />
      <p className="text-sm text-zinc-600">
        계정이 없나요?{" "}
        <Link href="/signup" className="underline">
          회원가입
        </Link>
      </p>
    </main>
  );
}
