import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { meQuery } from "@/entities/user";
import { AppHeader } from "@/widgets/app-header";

/**
 * admin 전용 레이아웃. role 이 admin 이 아니면 /rooms 로.
 * UX 목적의 1차 차단. API 는 requireAdmin, DB 는 RLS 가 각각 다시 막는다.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const me = await queryClient.fetchQuery(meQuery(await serverFetchContext())).catch(() => null);
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/rooms");

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AppHeader me={me} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
    </HydrationBoundary>
  );
}
