import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { meQuery } from "@/entities/user";
import { AppHeader } from "@/widgets/app-header";

/**
 * 로그인 사용자 공통 레이아웃. me 를 서버에서 가져와 헤더에 넘기고, 캐시를 dehydrate 해서
 * 클라이언트의 useQuery(meQuery()) 가 네트워크 없이 같은 값을 읽게 한다.
 * proxy 가 미로그인을 이미 걸러내지만, 세션 만료 경합을 대비해 한 번 더 redirect.
 */
export default async function UserLayout({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const me = await queryClient.fetchQuery(meQuery(await serverFetchContext())).catch(() => null);
  if (!me) redirect("/login");

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AppHeader me={me} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
    </HydrationBoundary>
  );
}
