"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getQueryClient } from "./query-client";

/**
 * 루트 layout 에서 앱 전체를 감싼다.
 * useState 로 클라이언트를 만들지 않는 이유: 서버 렌더 중 하위에서 suspend 가 일어나면
 * useState 초기값이 버려지고 다시 만들어질 수 있다. getQueryClient 가 서버/브라우저를 알아서 구분한다.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
