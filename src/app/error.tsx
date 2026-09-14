"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui";

/**
 * 라우트 세그먼트 렌더 중 던져진 예외의 공통 경계. (Route Handler 의 500 과는 별개)
 * reset() 은 세그먼트를 다시 렌더한다 — 일시적 네트워크 오류면 이걸로 회복된다.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page] 렌더 오류", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-lg font-medium">문제가 발생했습니다</h1>
      <p className="text-sm text-zinc-600">
        잠시 후 다시 시도하세요. 계속되면 새로고침하거나 다시 로그인해 주세요.
      </p>
      {error.digest ? <p className="text-xs text-zinc-400">오류 코드 {error.digest}</p> : null}
      <Button onClick={reset}>다시 시도</Button>
    </main>
  );
}
