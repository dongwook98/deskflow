import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/app/api/_server/db/env";

/** 로그인 없이 접근 가능한 경로. 그 외 전부 로그인 필요. */
const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/login", "/api/auth/signup"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Next 16 의 proxy (구 middleware). 매 요청 전에 실행.
 *
 * 1) Supabase 세션 갱신: 만료된 access token 을 refresh 하고 새 쿠키를 응답에 싣는다.
 *    RSC 는 쿠키를 쓸 수 없으므로 갱신은 반드시 여기서 해야 한다.
 * 2) 미로그인: 페이지는 /login?next=원래경로 로 리다이렉트, API 는 401 JSON.
 * 3) 로그인 상태에서 /login, /signup 접근: /rooms 로 보낸다.
 *
 * admin 여부는 여기서 판단하지 않는다 (DB 조회 필요). (admin) layout 의 role 확인,
 * Route Handler 의 requireAdmin, RLS 세 겹이 담당한다.
 */
export async function proxy(request: NextRequest) {
  const { url, key } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 갱신된 쿠키를 (1) 이번 요청의 하위 핸들러가 읽도록 request 에, (2) 브라우저에 전달되도록 response 에 둘 다 쓴다.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser 는 토큰을 Auth 서버에 검증시킨다. 여기서 refresh 도 일어난다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "로그인이 필요합니다." } },
        { status: 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const roomsUrl = request.nextUrl.clone();
    roomsUrl.pathname = "/rooms";
    roomsUrl.search = "";
    return NextResponse.redirect(roomsUrl);
  }

  return response;
}

export const config = {
  // 정적 파일과 이미지는 제외. 나머지 전부(페이지 + /api) 통과.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
