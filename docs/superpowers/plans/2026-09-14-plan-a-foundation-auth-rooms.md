# Plan A: 기반 골격 + Auth + Room CRUD 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 → 관리자가 Room 을 만들고 → 사용자가 Room 목록/상세를 보는 흐름이 동작하는 상태. 이후 Editor(Plan B), 예약(Plan C)이 올라갈 공통 골격 포함.

**Architecture:** 프론트(widgets/features/entities/shared)는 `/api/*` 만 안다. 백엔드는 `src/app/api/_server/**` 에 격리되고 Supabase 를 유일하게 안다. 서버 상태는 TanStack Query 로, RSC 가 `/api` 를 prefetch 해 `HydrationBoundary` 로 넘긴다. 인증은 `/api/auth/*` + `proxy.ts` 세션 갱신.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, TanStack Query 5, Zod 4, @supabase/ssr, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-14-deskflow-mvp-design.md` (2, 3, 4, 6, 7, 8, 10, 11절). 결정 기록 `docs/decisions.md`.

## Global Constraints

- TypeScript strict + `noUncheckedIndexedAccess`. `any` 금지.
- 레이어 의존 방향: `route.ts → _server → shared`, `app → widgets → features → entities → shared`. `pnpm lint` 가 위반을 막는다.
- Server Action 금지. 응답: 성공 `T` 그대로, 실패 `{ error: { code, message } }` + 4xx/5xx.
- env 는 사용하는 함수 안에서 검증. 모듈 import 시점 parse 금지.
- Supabase 키 env 이름: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (폴백 `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- 각 Task 끝: `pnpm typecheck && pnpm lint && pnpm test` 통과 후 커밋. 커밋 전 사용자 컨펌.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 한국어 UI 문구. 컴포넌트 라이브러리 없음(Tailwind 직접).

---

## 파일 구조 (이 계획에서 생성)

```
src/
  proxy.ts
  app/
    layout.tsx                        (수정) QueryProvider, lang=ko
    page.tsx                          (수정) → redirect("/rooms")
    (public)/login/page.tsx
    (public)/signup/page.tsx
    (user)/layout.tsx                 AppHeader 포함
    (user)/rooms/page.tsx
    (user)/rooms/[roomId]/page.tsx
    (admin)/admin/layout.tsx          role 가드 + AppHeader
    (admin)/admin/rooms/page.tsx
    (admin)/admin/rooms/new/page.tsx
    (admin)/admin/rooms/[roomId]/page.tsx
    api/
      _server/db/env.ts
      _server/db/supabase.ts
      _server/db/database.types.ts    (생성)
      _server/http/errors.ts
      _server/http/response.ts
      _server/http/auth.ts
      _server/http/validate.ts
      _server/auth/auth.service.ts
      _server/rooms/rooms.mapper.ts
      _server/rooms/rooms.service.ts
      auth/login/route.ts  auth/signup/route.ts  auth/logout/route.ts  auth/me/route.ts
      rooms/route.ts  rooms/[roomId]/route.ts
  widgets/app-header/ui/app-header.tsx, index.ts
  features/auth/api/mutations.ts, ui/login-form.tsx, ui/signup-form.tsx, ui/logout-button.tsx, index.ts
  features/room-manage/api/mutations.ts, ui/room-form.tsx, ui/delete-room-button.tsx, index.ts
  entities/user/model/query-keys.ts, api/queries.ts, index.ts
  entities/room/model/query-keys.ts, api/queries.ts, ui/room-card.tsx, index.ts
  shared/config/site.ts
  shared/api/http.ts, http.test.ts, query-client.ts, query-provider.tsx, server-fetch-context.ts, index.ts
  shared/ui/button.tsx, input.tsx, field.tsx, index.ts
  shared/lib/cn.ts
```

---

### Task 1: shared/api — apiFetch, QueryClient, Provider, 루트 layout

**Files:**
- Create: `src/shared/config/site.ts`
- Create: `src/shared/api/http.ts`
- Create: `src/shared/api/http.test.ts`
- Create: `src/shared/api/query-client.ts`
- Create: `src/shared/api/query-provider.tsx`
- Create: `src/shared/api/server-fetch-context.ts`
- Create: `src/shared/api/index.ts`
- Modify: `src/app/layout.tsx`
- Modify: `.env.example`

**Interfaces:**
- Produces: `apiFetch<T>(path: string, init?: ApiFetchInit, ctx?: ServerFetchContext): Promise<T>`, `class ApiError { status: number; code: ApiErrorCode }`, `getQueryClient(): QueryClient`, `QueryProvider`, `serverFetchContext(): Promise<ServerFetchContext>`, `getSiteOrigin(fallback?): string`.

- [x] **Step 1: 실패하는 테스트 작성** — `src/shared/api/http.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./http";

function mockFetch(status: number, body: unknown, contentType = "application/json") {
  const fn = vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": contentType },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("parses JSON on success", async () => {
    mockFetch(200, { id: "1" });
    await expect(apiFetch<{ id: string }>("/api/x")).resolves.toEqual({ id: "1" });
  });

  it("returns undefined on 204", async () => {
    mockFetch(204, undefined);
    await expect(apiFetch<void>("/api/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws ApiError with server code on error body", async () => {
    mockFetch(409, { error: { code: "version_conflict", message: "stale" } });
    const err = await apiFetch("/api/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe("version_conflict");
    expect((err as ApiError).message).toBe("stale");
  });

  it("falls back to internal when error body is not ApiErrorBody", async () => {
    mockFetch(502, "<html>bad gateway</html>", "text/html");
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("internal");
    expect(err.status).toBe(502);
  });

  it("serializes body as JSON and sets content-type", async () => {
    const fn = mockFetch(201, { ok: true });
    await apiFetch("/api/x", { method: "POST", body: { a: 1 } });
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("uses absolute origin and forwards cookie when ctx is given", async () => {
    const fn = mockFetch(200, {});
    await apiFetch("/api/x", undefined, { origin: "http://localhost:3000", cookie: "sb=1" });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/x");
    expect(new Headers(init.headers).get("cookie")).toBe("sb=1");
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test src/shared/api/http.test.ts`
Expected: FAIL — `Failed to resolve import "./http"`

- [x] **Step 3: 구현**

`src/shared/config/site.ts`
```ts
/**
 * 서버가 자기 자신의 /api 를 호출할 때 쓰는 origin.
 * 우선순위: NEXT_PUBLIC_SITE_URL → 요청 헤더(host) → VERCEL_URL → localhost
 */
export function getSiteOrigin(fallback?: { host: string | null; proto: string | null }): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (fallback?.host) return `${fallback.proto ?? "http"}://${fallback.host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
```

`src/shared/api/http.ts`
```ts
import { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode } from "@/shared/contracts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** RSC 에서 prefetch 할 때 필요한 정보. 브라우저에서는 넘기지 않는다. */
export interface ServerFetchContext {
  origin: string;
  cookie: string;
}

export interface ApiFetchInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    typeof message === "string" &&
    typeof code === "string" &&
    (API_ERROR_CODES as readonly string[]).includes(code)
  );
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 비 JSON 응답
  }
  if (isApiErrorBody(body)) return new ApiError(res.status, body.error.code, body.error.message);
  return new ApiError(res.status, "internal", `요청 실패 (${res.status})`);
}

/**
 * 모든 API 호출의 단일 진입점.
 * - 성공: 응답 JSON 을 T 로 반환 (204 는 undefined)
 * - 실패: ApiError throw (TanStack Query 가 error 로 받는다)
 */
export async function apiFetch<T>(
  path: string,
  init: ApiFetchInit = {},
  ctx?: ServerFetchContext,
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (ctx?.cookie) headers.set("cookie", ctx.cookie);

  const res = await fetch(ctx ? `${ctx.origin}${path}` : path, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    cache: "no-store",
    signal: init.signal,
  });

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

`src/shared/api/query-client.ts`
```ts
import { QueryClient, isServer } from "@tanstack/react-query";
import { ApiError } from "./http";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // hydrate 직후 클라이언트에서 즉시 refetch 하지 않도록 (TanStack SSR 권장)
        staleTime: 60 * 1000,
        // 4xx 는 재시도 무의미
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** 서버: 요청마다 새 클라이언트(요청 간 캐시 공유 금지). 브라우저: 싱글톤. */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
```

`src/shared/api/query-provider.tsx`
```tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getQueryClient } from "./query-client";

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState 를 쓰지 않는다: 서버 렌더 중 suspend 되면 클라이언트가 버려질 수 있음 (TanStack 문서)
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

`src/shared/api/server-fetch-context.ts`
```ts
import "server-only";
import { headers } from "next/headers";
import { getSiteOrigin } from "@/shared/config/site";
import type { ServerFetchContext } from "./http";

/** RSC 에서 apiFetch 에 넘길 컨텍스트. 현재 요청의 쿠키와 origin 을 담는다. */
export async function serverFetchContext(): Promise<ServerFetchContext> {
  const h = await headers();
  return {
    origin: getSiteOrigin({ host: h.get("host"), proto: h.get("x-forwarded-proto") }),
    cookie: h.get("cookie") ?? "",
  };
}
```

`src/shared/api/index.ts`
```ts
export { apiFetch, ApiError, type ApiFetchInit, type ServerFetchContext } from "./http";
export { getQueryClient, makeQueryClient } from "./query-client";
export { QueryProvider } from "./query-provider";
```
(`server-fetch-context` 는 index 에서 내보내지 않는다. `server-only` 가 클라이언트 번들에 섞이지 않도록 직접 경로로 import.)

`src/app/layout.tsx` (전체 교체)
```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/shared/api";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DeskFlow",
  description: "공간 레이아웃을 편집하고 좌석을 예약하는 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

`.env.example` (전체 교체)
```
# Supabase 대시보드 > Project Settings > API Keys
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# 배포 시 서버가 자기 /api 를 호출할 origin (로컬은 비워도 됨)
NEXT_PUBLIC_SITE_URL=
```

- [x] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 테스트 13개 통과 (contracts 7 + http 6)

- [x] **Step 5: dev 확인**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` (dev 서버 실행 중일 때)
Expected: `200`

- [x] **Step 6: 커밋** (사용자 컨펌 후)

```bash
git add -A
git commit -m "feat(shared): add apiFetch, QueryClient, provider and site origin helper"
```

---

### Task 2: _server/db — Supabase 서버 클라이언트 + DB 타입

**Files:**
- Create: `src/app/api/_server/db/env.ts`
- Create: `src/app/api/_server/db/env.test.ts`
- Create: `src/app/api/_server/db/supabase.ts`
- Create: `src/app/api/_server/db/database.types.ts` (CLI 생성)

**Interfaces:**
- Produces: `getSupabaseEnv(): { url: string; key: string }`, `createServerSupabase(): Promise<ServerSupabase>`, `type ServerSupabase = SupabaseClient<Database>`, `type Tables<"rooms">` 등(생성 파일).

- [x] **Step 1: 실패하는 테스트** — `src/app/api/_server/db/env.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnv } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("getSupabaseEnv", () => {
  it("prefers publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(getSupabaseEnv()).toEqual({ url: "https://x.supabase.co", key: "sb_publishable_1" });
  });

  it("falls back to anon key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(getSupabaseEnv().key).toBe("anon");
  });

  it("throws with key names when missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/_server/db/env.test.ts`
Expected: FAIL — import 실패

- [x] **Step 3: 구현**

`src/app/api/_server/db/env.ts`
```ts
/**
 * Supabase 연결 env. 호출 시점에 검증한다 (모듈 import 시점 검증 금지 — 이전 프로젝트에서 전 요청 500 원인).
 * proxy.ts 도 이 함수를 쓴다. next/headers 를 import 하지 않는다.
 */
export function getSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase env 누락: NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY(또는 NEXT_PUBLIC_SUPABASE_ANON_KEY) 를 .env.local 에 설정하세요.",
    );
  }
  return { url, key };
}
```

`src/app/api/_server/db/supabase.ts`
```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

export type ServerSupabase = SupabaseClient<Database>;

/** Route Handler 용. 요청 쿠키로 세션을 복원한다. 요청마다 새로 만든다. */
export async function createServerSupabase(): Promise<ServerSupabase> {
  const { url, key } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Route Handler 에서는 쓰기 가능. (RSC 에서 호출되면 throw 하므로 무시 — 세션 갱신은 proxy.ts 담당)
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* noop */
        }
      },
    },
  });
}
```

DB 타입 생성:
```bash
supabase gen types typescript --linked --schema public > src/app/api/_server/db/database.types.ts
```
생성 파일 상단에 다음 주석을 추가한다 (재생성 방법 기록):
```ts
// 생성 파일. 수정 금지. 재생성:
//   supabase gen types typescript --linked --schema public > src/app/api/_server/db/database.types.ts
```
CLI 가 실패하면(네트워크 등) `supabase gen types typescript --local` 은 Docker 가 필요하므로 쓰지 않는다. 대신 사용자에게 알리고 중단.

- [x] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 통과. `database.types.ts` 에 `rooms`, `seats`, `space_objects`, `reservations`, `profiles` 와 `Functions.save_room_layout`, `Functions.get_seat_availability` 가 있는지 `grep` 으로 확인:
```bash
grep -c "save_room_layout\|get_seat_availability\|reservations" src/app/api/_server/db/database.types.ts
```
Expected: 3 이상

- [x] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(server): add Supabase server client, env loader and generated DB types"
```

---

### Task 3: _server/http — 에러 매핑, 응답, 인증 가드, 검증

**Files:**
- Create: `src/app/api/_server/http/errors.ts`
- Create: `src/app/api/_server/http/errors.test.ts`
- Create: `src/app/api/_server/http/response.ts`
- Create: `src/app/api/_server/http/validate.ts`
- Create: `src/app/api/_server/http/validate.test.ts`
- Create: `src/app/api/_server/http/auth.ts`

**Interfaces:**
- Consumes: `ServerSupabase` (Task 2), `ApiErrorCode`/`ApiErrorBody` (contracts).
- Produces:
  - `class ApiHttpError extends Error { status: number; code: ApiErrorCode }`
  - `mapPostgresError(err: PostgrestLikeError): ApiHttpError`
  - `ok<T>(data: T, status?: number): NextResponse`, `noContent(): NextResponse`, `fail(status, code, message): NextResponse`
  - `withErrorHandling<Ctx>(handler: (req: NextRequest, ctx: Ctx) => Promise<Response>): (req, ctx) => Promise<Response>`
  - `parseBody<S extends ZodType>(req: Request, schema: S): Promise<z.output<S>>`, `parseQuery<S extends ZodType>(url: URL, schema: S): z.output<S>`
  - `requireUser(supabase): Promise<{ id: string }>`, `requireAdmin(supabase): Promise<{ id: string }>`

- [x] **Step 1: 실패하는 테스트**

`src/app/api/_server/http/errors.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { ApiHttpError, mapPostgresError } from "./errors";

describe("mapPostgresError", () => {
  it("23P01 → 409 reservation_overlap", () => {
    const e = mapPostgresError({ code: "23P01", message: "conflicting key value" });
    expect(e).toBeInstanceOf(ApiHttpError);
    expect(e.status).toBe(409);
    expect(e.code).toBe("reservation_overlap");
  });

  it("23503 → 409 seat_has_reservations", () => {
    expect(mapPostgresError({ code: "23503", message: "fk" }).code).toBe("seat_has_reservations");
  });

  it("P0001 version_conflict → 409 version_conflict", () => {
    const e = mapPostgresError({ code: "P0001", message: "version_conflict" });
    expect(e.status).toBe(409);
    expect(e.code).toBe("version_conflict");
  });

  it("P0002 / PGRST116 → 404", () => {
    expect(mapPostgresError({ code: "P0002", message: "room_not_found" }).status).toBe(404);
    expect(mapPostgresError({ code: "PGRST116", message: "0 rows" }).status).toBe(404);
  });

  it("42501 → 403", () => {
    expect(mapPostgresError({ code: "42501", message: "rls" }).code).toBe("forbidden");
  });

  it("unknown → 500 internal", () => {
    const e = mapPostgresError({ code: "XX000", message: "boom" });
    expect(e.status).toBe(500);
    expect(e.code).toBe("internal");
  });
});
```

`src/app/api/_server/http/validate.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiHttpError } from "./errors";
import { parseBody, parseQuery } from "./validate";

const schema = z.object({ n: z.coerce.number().int().min(1) });

describe("parseBody", () => {
  it("returns parsed data", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ n: 3 }) });
    await expect(parseBody(req, schema)).resolves.toEqual({ n: 3 });
  });

  it("throws 400 invalid_input on invalid JSON", async () => {
    const req = new Request("http://x", { method: "POST", body: "{nope" });
    const e = (await parseBody(req, schema).catch((x: unknown) => x)) as ApiHttpError;
    expect(e).toBeInstanceOf(ApiHttpError);
    expect(e.status).toBe(400);
    expect(e.code).toBe("invalid_input");
  });

  it("throws 400 with field path on schema failure", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ n: 0 }) });
    const e = (await parseBody(req, schema).catch((x: unknown) => x)) as ApiHttpError;
    expect(e.status).toBe(400);
    expect(e.message).toContain("n");
  });
});

describe("parseQuery", () => {
  it("parses search params", () => {
    expect(parseQuery(new URL("http://x/?n=5"), schema)).toEqual({ n: 5 });
  });
  it("throws 400 on invalid", () => {
    expect(() => parseQuery(new URL("http://x/?n=abc"), schema)).toThrow(ApiHttpError);
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/_server/http`
Expected: FAIL — import 실패

- [x] **Step 3: 구현**

`src/app/api/_server/http/errors.ts`
```ts
import type { ApiErrorCode } from "@/shared/contracts";

/** 서비스 계층이 던지는 에러. withErrorHandling 이 HTTP 응답으로 바꾼다. */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
  }
}

/** supabase-js 의 PostgrestError / 함수 예외 모양 */
export interface PostgrestLikeError {
  code?: string | null;
  message: string;
  details?: string | null;
}

/**
 * Postgres SQLSTATE → API 에러.
 * 23P01 exclusion_violation  : 예약 겹침 (reservations_no_overlap)
 * 23503 foreign_key_violation: 예약 있는 좌석 삭제 (reservations.seat_id restrict)
 * P0001 raise exception      : save_room_layout 의 version_conflict
 * P0002 no_data_found        : save_room_layout 의 room_not_found
 * PGRST116                   : .single() 결과 0행 (RLS 로 안 보이는 경우 포함)
 * 42501 insufficient_privilege: RLS 거부
 */
export function mapPostgresError(err: PostgrestLikeError): ApiHttpError {
  switch (err.code) {
    case "23P01":
      return new ApiHttpError(409, "reservation_overlap", "이미 예약된 시간입니다.");
    case "23503":
      return new ApiHttpError(409, "seat_has_reservations", "예약이 있는 좌석은 삭제할 수 없습니다.");
    case "P0001":
      if (err.message.includes("version_conflict")) {
        return new ApiHttpError(409, "version_conflict", "다른 곳에서 먼저 저장되었습니다.");
      }
      return new ApiHttpError(500, "internal", err.message);
    case "P0002":
    case "PGRST116":
      return new ApiHttpError(404, "not_found", "대상을 찾을 수 없습니다.");
    case "42501":
      return new ApiHttpError(403, "forbidden", "권한이 없습니다.");
    default:
      return new ApiHttpError(500, "internal", err.message);
  }
}
```

`src/app/api/_server/http/response.ts`
```ts
import { NextResponse, type NextRequest } from "next/server";
import type { ApiErrorBody, ApiErrorCode } from "@/shared/contracts";
import { ApiHttpError } from "./errors";

export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function fail(status: number, code: ApiErrorCode, message: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response>;

/** Route Handler 래퍼. ApiHttpError → 해당 상태 코드, 그 외 → 500. */
export function withErrorHandling<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof ApiHttpError) return fail(error.status, error.code, error.message);
      console.error("[api] unhandled error", error);
      return fail(500, "internal", "서버 오류가 발생했습니다.");
    }
  };
}
```

`src/app/api/_server/http/validate.ts`
```ts
import type { z, ZodType } from "zod";
import { ApiHttpError } from "./errors";

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

export async function parseBody<S extends ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiHttpError(400, "invalid_input", "JSON 본문이 필요합니다.");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new ApiHttpError(400, "invalid_input", formatIssues(result.error));
  return result.data;
}

export function parseQuery<S extends ZodType>(url: URL, schema: S): z.output<S> {
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) throw new ApiHttpError(400, "invalid_input", formatIssues(result.error));
  return result.data;
}
```

`src/app/api/_server/http/auth.ts`
```ts
import type { ServerSupabase } from "../db/supabase";
import { ApiHttpError, mapPostgresError } from "./errors";

export interface AuthUser {
  id: string;
}

/** 세션 없으면 401. getUser 는 토큰을 서버에서 검증한다 (getSession 은 쿠키만 읽으므로 사용 금지). */
export async function requireUser(supabase: ServerSupabase): Promise<AuthUser> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiHttpError(401, "unauthorized", "로그인이 필요합니다.");
  return { id: user.id };
}

/** admin 아니면 403. RLS 가 최종 방어이므로 여기는 빠른 실패 + 명확한 메시지 목적. */
export async function requireAdmin(supabase: ServerSupabase): Promise<AuthUser> {
  const user = await requireUser(supabase);
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (error) throw mapPostgresError(error);
  if (data.role !== "admin") throw new ApiHttpError(403, "forbidden", "관리자만 사용할 수 있습니다.");
  return user;
}
```

- [x] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 통과 (테스트 27개)

- [x] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(server): add http helpers - error mapping, responses, auth guards, validation"
```

---

### Task 4: proxy.ts — 세션 갱신 + 접근 제어

**Files:**
- Create: `src/proxy.ts`
- Modify: `src/app/page.tsx` (→ `/rooms` 리다이렉트)

**Interfaces:**
- Consumes: `getSupabaseEnv()` (Task 2).
- Produces: 없음 (Next 파일 컨벤션).

- [x] **Step 1: 구현**

`src/proxy.ts`
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/app/api/_server/db/env";

/** 로그인 없이 접근 가능한 경로 */
const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/login", "/api/auth/signup"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 1) Supabase 세션 토큰 갱신 (만료된 access token 을 refresh 하고 쿠키에 다시 씀)
 * 2) 미로그인 → 페이지는 /login 리다이렉트, API 는 401
 * 3) 로그인 상태에서 /login, /signup 접근 → /rooms
 * admin 여부는 여기서 판단하지 않는다 (DB 조회 필요). (admin) layout 과 requireAdmin, RLS 가 담당.
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
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
```

`src/app/page.tsx` (전체 교체)
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/rooms");
}
```

- [x] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 통과

- [x] **Step 3: 동작 확인** (dev 서버 실행 중)

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/rooms
curl -s -w "\n%{http_code}\n" http://localhost:3000/api/rooms
```
Expected: 첫 줄 `307 http://localhost:3000/rooms` (page.tsx redirect), 둘째 줄 `307 http://localhost:3000/login?next=%2Frooms`, 셋째 줄 `{"error":{"code":"unauthorized",...}}` 와 `401`.

- [x] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat: add proxy for session refresh and auth redirects"
```

---

### Task 5: Auth API — /api/auth/{signup,login,logout,me}

**Files:**
- Create: `src/app/api/_server/auth/auth.service.ts`
- Create: `src/app/api/auth/signup/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/me/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `requireUser`, `parseBody`, `ok`, `noContent`, `withErrorHandling`, `ApiHttpError`, `mapPostgresError`, `loginSchema`, `signupSchema`, `MeDto`.
- Produces: `signup(supabase, input: SignupInput): Promise<MeDto>`, `login(supabase, input: LoginInput): Promise<MeDto>`, `logout(supabase): Promise<void>`, `getMe(supabase, userId: string): Promise<MeDto>`.

- [x] **Step 1: 구현**

`src/app/api/_server/auth/auth.service.ts`
```ts
import type { LoginInput, MeDto, SignupInput } from "@/shared/contracts";
import type { ServerSupabase } from "../db/supabase";
import { ApiHttpError, mapPostgresError } from "../http/errors";

export async function getMe(supabase: ServerSupabase, userId: string): Promise<MeDto> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", userId)
    .single();
  if (error) throw mapPostgresError(error);
  return { id: data.id, name: data.name, role: data.role };
}

export async function signup(supabase: ServerSupabase, input: SignupInput): Promise<MeDto> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { name: input.name } }, // handle_new_user 트리거가 profiles.name 으로 사용
  });
  if (error) throw new ApiHttpError(400, "invalid_input", error.message);
  if (!data.user) throw new ApiHttpError(500, "internal", "회원가입 결과가 비어 있습니다.");
  if (!data.session) {
    // Supabase Auth 의 "Confirm email" 이 켜져 있으면 세션이 없다 (D-35)
    throw new ApiHttpError(
      400,
      "invalid_input",
      "이메일 확인이 필요한 설정입니다. Supabase 대시보드에서 Confirm email 을 끄세요.",
    );
  }
  return getMe(supabase, data.user.id);
}

export async function login(supabase: ServerSupabase, input: LoginInput): Promise<MeDto> {
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error || !data.user) {
    throw new ApiHttpError(401, "unauthorized", "이메일 또는 비밀번호가 올바르지 않습니다.");
  }
  return getMe(supabase, data.user.id);
}

export async function logout(supabase: ServerSupabase): Promise<void> {
  await supabase.auth.signOut();
}
```

`src/app/api/auth/signup/route.ts`
```ts
import { signup } from "@/app/api/_server/auth/auth.service";
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { signupSchema } from "@/shared/contracts";

export const POST = withErrorHandling(async (req) => {
  const input = await parseBody(req, signupSchema);
  const supabase = await createServerSupabase();
  const me = await signup(supabase, input);
  return ok(me, 201);
});
```

`src/app/api/auth/login/route.ts`
```ts
import { login } from "@/app/api/_server/auth/auth.service";
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { loginSchema } from "@/shared/contracts";

export const POST = withErrorHandling(async (req) => {
  const input = await parseBody(req, loginSchema);
  const supabase = await createServerSupabase();
  const me = await login(supabase, input);
  return ok(me);
});
```

`src/app/api/auth/logout/route.ts`
```ts
import { logout } from "@/app/api/_server/auth/auth.service";
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { noContent, withErrorHandling } from "@/app/api/_server/http/response";

export const POST = withErrorHandling(async () => {
  const supabase = await createServerSupabase();
  await logout(supabase);
  return noContent();
});
```

`src/app/api/auth/me/route.ts`
```ts
import { getMe } from "@/app/api/_server/auth/auth.service";
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";

export const GET = withErrorHandling(async () => {
  const supabase = await createServerSupabase();
  const user = await requireUser(supabase);
  return ok(await getMe(supabase, user.id));
});
```

- [x] **Step 2: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [x] **Step 3: 동작 확인** (dev 실행 중. 테스트 계정은 나중에 삭제 가능)

```bash
curl -s -c /tmp/df.jar -H 'Content-Type: application/json' \
  -d '{"email":"tester1@example.com","password":"password123","name":"테스터"}' \
  http://localhost:3000/api/auth/signup; echo
curl -s -b /tmp/df.jar http://localhost:3000/api/auth/me; echo
curl -s -b /tmp/df.jar -X POST -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/auth/logout
curl -s -c /tmp/df.jar -H 'Content-Type: application/json' \
  -d '{"email":"tester1@example.com","password":"wrong"}' http://localhost:3000/api/auth/login; echo
```
Expected: 1) `{"id":"...","name":"테스터","role":"user"}` 2) 같은 객체 3) `204` 4) `{"error":{"code":"unauthorized",...}}`
(이미 가입된 이메일이면 1 은 400 — login 으로 대체.)

- [x] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(api): add auth endpoints - signup, login, logout, me"
```

---

### Task 6: Auth UI — 로그인/회원가입 페이지, shared/ui 프리미티브

**Files:**
- Create: `src/shared/lib/cn.ts`
- Create: `src/shared/ui/button.tsx`, `src/shared/ui/input.tsx`, `src/shared/ui/field.tsx`, `src/shared/ui/index.ts`
- Create: `src/entities/user/model/query-keys.ts`, `src/entities/user/api/queries.ts`, `src/entities/user/index.ts`
- Create: `src/features/auth/api/mutations.ts`, `src/features/auth/ui/login-form.tsx`, `src/features/auth/ui/signup-form.tsx`, `src/features/auth/ui/logout-button.tsx`, `src/features/auth/index.ts`
- Create: `src/app/(public)/login/page.tsx`, `src/app/(public)/signup/page.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `MeDto`, `loginSchema`, `signupSchema`.
- Produces: `authKeys.me()`, `meQuery(ctx?)`, `useLogin()`, `useSignup()`, `useLogout()`, `<LoginForm />`, `<SignupForm />`, `<LogoutButton />`, `<Button>`, `<Input>`, `<Field>`, `cn()`.

- [x] **Step 1: shared/ui + cn**

`src/shared/lib/cn.ts`
```ts
/** 조건부 클래스 결합. tailwind-merge 없이 단순 join (충돌 클래스는 호출자가 피한다). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

`src/shared/ui/button.tsx`
```tsx
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variantClass: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-400",
  secondary: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100",
  danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
  ghost: "text-zinc-700 hover:bg-zinc-100",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}
```

`src/shared/ui/input.tsx`
```tsx
import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-100",
        className,
      )}
      {...props}
    />
  );
}
```

`src/shared/ui/field.tsx`
```tsx
import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
```

`src/shared/ui/index.ts`
```ts
export { Button, type ButtonProps } from "./button";
export { Input } from "./input";
export { Field } from "./field";
```

- [x] **Step 2: entities/user**

`src/entities/user/model/query-keys.ts`
```ts
export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};
```

`src/entities/user/api/queries.ts`
```ts
import { queryOptions } from "@tanstack/react-query";
import { apiFetch, type ServerFetchContext } from "@/shared/api";
import type { MeDto } from "@/shared/contracts";
import { authKeys } from "../model/query-keys";

/** 서버 prefetch 와 클라이언트 useQuery 가 같은 옵션을 쓴다. ctx 는 서버에서만 넘긴다. */
export const meQuery = (ctx?: ServerFetchContext) =>
  queryOptions({
    queryKey: authKeys.me(),
    queryFn: () => apiFetch<MeDto>("/api/auth/me", undefined, ctx),
    retry: false,
  });
```

`src/entities/user/index.ts`
```ts
export { authKeys } from "./model/query-keys";
export { meQuery } from "./api/queries";
```

- [x] **Step 3: features/auth**

`src/features/auth/api/mutations.ts`
```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/shared/api";
import type { LoginInput, MeDto, SignupInput } from "@/shared/contracts";
import { authKeys } from "@/entities/user";

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
    mutationFn: (input: LoginInput) => apiFetch<MeDto>("/api/auth/login", { method: "POST", body: input }),
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
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
  });
}
```

`src/features/auth/ui/login-form.tsx`
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/shared/api";
import { loginSchema } from "@/shared/contracts";
import { Button, Field, Input } from "@/shared/ui";
import { useLogin } from "../api/mutations";

export function LoginForm({ next }: { next?: string }) {
  const login = useLogin(next);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) {
      setFieldError("이메일 형식과 8자 이상 비밀번호를 확인하세요.");
      return;
    }
    setFieldError(null);
    login.mutate(parsed.data);
  }

  const serverError =
    login.error instanceof ApiError ? login.error.message : login.error ? "로그인에 실패했습니다." : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="비밀번호" htmlFor="password" error={fieldError ?? undefined}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? "로그인 중..." : "로그인"}
      </Button>
    </form>
  );
}
```

`src/features/auth/ui/signup-form.tsx`
```tsx
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
    signup.error instanceof ApiError ? signup.error.message : signup.error ? "가입에 실패했습니다." : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="이름" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={30} />
      </Field>
      <Field label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="비밀번호" htmlFor="password" error={fieldError ?? undefined}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
      <Button type="submit" disabled={signup.isPending}>
        {signup.isPending ? "가입 중..." : "회원가입"}
      </Button>
    </form>
  );
}
```

`src/features/auth/ui/logout-button.tsx`
```tsx
"use client";

import { Button } from "@/shared/ui";
import { useLogout } from "../api/mutations";

export function LogoutButton() {
  const logout = useLogout();
  return (
    <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
      로그아웃
    </Button>
  );
}
```

`src/features/auth/index.ts`
```ts
export { LoginForm } from "./ui/login-form";
export { SignupForm } from "./ui/signup-form";
export { LogoutButton } from "./ui/logout-button";
export { useLogin, useSignup, useLogout } from "./api/mutations";
```

- [x] **Step 4: 페이지**

`src/app/(public)/login/page.tsx`
```tsx
import Link from "next/link";
import { LoginForm } from "@/features/auth";

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
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
```

`src/app/(public)/signup/page.tsx`
```tsx
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
```

- [x] **Step 5: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [x] **Step 6: 브라우저 확인**

`http://localhost:3000/signup` 에서 가입 → `/rooms` 로 이동(404 는 정상, Task 8 에서 생김). `/login` 재접속 시 `/rooms` 로 리다이렉트되면 세션 OK.

- [x] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(auth): add login/signup pages, auth mutations and shared ui primitives"
```

---

### Task 7: Rooms API — /api/rooms, /api/rooms/:roomId

**Files:**
- Create: `src/app/api/_server/rooms/rooms.mapper.ts`
- Create: `src/app/api/_server/rooms/rooms.mapper.test.ts`
- Create: `src/app/api/_server/rooms/rooms.service.ts`
- Create: `src/app/api/rooms/route.ts`
- Create: `src/app/api/rooms/[roomId]/route.ts`

**Interfaces:**
- Consumes: `Tables<"rooms">` (Task 2), `RoomDto`, `createRoomSchema`, `updateRoomSchema`, http 헬퍼.
- Produces: `toRoomDto(row: Tables<"rooms">): RoomDto`, `listRooms(supabase): Promise<RoomDto[]>`, `getRoom(supabase, id): Promise<RoomDto>`, `createRoom(supabase, userId, input: CreateRoomInput): Promise<RoomDto>`, `updateRoom(supabase, id, input: UpdateRoomInput): Promise<RoomDto>`, `deleteRoom(supabase, id): Promise<void>`.

- [x] **Step 1: 실패하는 테스트** — `src/app/api/_server/rooms/rooms.mapper.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { toRoomDto } from "./rooms.mapper";

describe("toRoomDto", () => {
  it("maps snake_case row to camelCase dto", () => {
    expect(
      toRoomDto({
        id: "r1",
        name: "Room",
        description: "",
        width: 800,
        height: 600,
        layout_version: 2,
        created_by: "u1",
        created_at: "2026-09-14T00:00:00+00:00",
        updated_at: "2026-09-14T01:00:00+00:00",
      }),
    ).toEqual({
      id: "r1",
      name: "Room",
      description: "",
      width: 800,
      height: 600,
      layoutVersion: 2,
      createdAt: "2026-09-14T00:00:00+00:00",
      updatedAt: "2026-09-14T01:00:00+00:00",
    });
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `pnpm test src/app/api/_server/rooms`
Expected: FAIL

- [x] **Step 3: 구현**

`src/app/api/_server/rooms/rooms.mapper.ts`
```ts
import type { RoomDto } from "@/shared/contracts";
import type { Tables } from "../db/database.types";

export function toRoomDto(row: Tables<"rooms">): RoomDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    width: row.width,
    height: row.height,
    layoutVersion: row.layout_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

`src/app/api/_server/rooms/rooms.service.ts`
```ts
import type { CreateRoomInput, RoomDto, UpdateRoomInput } from "@/shared/contracts";
import type { ServerSupabase } from "../db/supabase";
import { ApiHttpError, mapPostgresError } from "../http/errors";
import { toRoomDto } from "./rooms.mapper";

export async function listRooms(supabase: ServerSupabase): Promise<RoomDto[]> {
  const { data, error } = await supabase.from("rooms").select("*").order("created_at");
  if (error) throw mapPostgresError(error);
  return data.map(toRoomDto);
}

export async function getRoom(supabase: ServerSupabase, roomId: string): Promise<RoomDto> {
  const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) throw mapPostgresError(error);
  if (!data) throw new ApiHttpError(404, "not_found", "공간을 찾을 수 없습니다.");
  return toRoomDto(data);
}

export async function createRoom(
  supabase: ServerSupabase,
  userId: string,
  input: CreateRoomInput,
): Promise<RoomDto> {
  const { data, error } = await supabase
    .from("rooms")
    .insert({ ...input, created_by: userId })
    .select("*")
    .single();
  if (error) throw mapPostgresError(error);
  return toRoomDto(data);
}

export async function updateRoom(
  supabase: ServerSupabase,
  roomId: string,
  input: UpdateRoomInput,
): Promise<RoomDto> {
  const { data, error } = await supabase
    .from("rooms")
    .update(input)
    .eq("id", roomId)
    .select("*")
    .maybeSingle();
  if (error) throw mapPostgresError(error);
  if (!data) throw new ApiHttpError(404, "not_found", "공간을 찾을 수 없습니다.");
  return toRoomDto(data);
}

export async function deleteRoom(supabase: ServerSupabase, roomId: string): Promise<void> {
  const { error, count } = await supabase
    .from("rooms")
    .delete({ count: "exact" })
    .eq("id", roomId);
  if (error) throw mapPostgresError(error);
  if (!count) throw new ApiHttpError(404, "not_found", "공간을 찾을 수 없습니다.");
}
```

`src/app/api/rooms/route.ts`
```ts
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireAdmin, requireUser } from "@/app/api/_server/http/auth";
import { ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { createRoom, listRooms } from "@/app/api/_server/rooms/rooms.service";
import { createRoomSchema } from "@/shared/contracts";

export const GET = withErrorHandling(async () => {
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  return ok(await listRooms(supabase));
});

export const POST = withErrorHandling(async (req) => {
  const supabase = await createServerSupabase();
  const admin = await requireAdmin(supabase);
  const input = await parseBody(req, createRoomSchema);
  return ok(await createRoom(supabase, admin.id, input), 201);
});
```

`src/app/api/rooms/[roomId]/route.ts`
```ts
import { createServerSupabase } from "@/app/api/_server/db/supabase";
import { requireAdmin, requireUser } from "@/app/api/_server/http/auth";
import { noContent, ok, withErrorHandling } from "@/app/api/_server/http/response";
import { parseBody } from "@/app/api/_server/http/validate";
import { deleteRoom, getRoom, updateRoom } from "@/app/api/_server/rooms/rooms.service";
import { updateRoomSchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ roomId: string }> };

export const GET = withErrorHandling<Ctx>(async (_req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireUser(supabase);
  return ok(await getRoom(supabase, roomId));
});

export const PATCH = withErrorHandling<Ctx>(async (req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireAdmin(supabase);
  const input = await parseBody(req, updateRoomSchema);
  return ok(await updateRoom(supabase, roomId, input));
});

export const DELETE = withErrorHandling<Ctx>(async (_req, { params }) => {
  const { roomId } = await params;
  const supabase = await createServerSupabase();
  await requireAdmin(supabase);
  await deleteRoom(supabase, roomId);
  return noContent();
});
```

- [x] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 5: 동작 확인** — 먼저 첫 admin 승격 (D-34). Supabase 대시보드 SQL Editor:
```sql
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'tester1@example.com');
```
그 다음:
```bash
curl -s -c /tmp/df.jar -H 'Content-Type: application/json' \
  -d '{"email":"tester1@example.com","password":"password123"}' http://localhost:3000/api/auth/login >/dev/null
curl -s -b /tmp/df.jar -H 'Content-Type: application/json' \
  -d '{"name":"1층 오피스","width":1200,"height":800}' http://localhost:3000/api/rooms; echo
curl -s -b /tmp/df.jar http://localhost:3000/api/rooms; echo
```
Expected: 생성 응답에 `layoutVersion: 0`, 목록에 1개. 일반 계정으로 POST 하면 `403 forbidden`.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(api): add rooms CRUD endpoints and service"
```

---

### Task 8: Rooms UI — 목록/상세/관리 페이지, 헤더, admin 가드

**Files:**
- Create: `src/entities/room/model/query-keys.ts`, `src/entities/room/api/queries.ts`, `src/entities/room/ui/room-card.tsx`, `src/entities/room/index.ts`
- Create: `src/features/room-manage/api/mutations.ts`, `src/features/room-manage/ui/room-form.tsx`, `src/features/room-manage/ui/delete-room-button.tsx`, `src/features/room-manage/index.ts`
- Create: `src/widgets/app-header/ui/app-header.tsx`, `src/widgets/app-header/index.ts`
- Create: `src/app/(user)/layout.tsx`, `src/app/(user)/rooms/page.tsx`, `src/app/(user)/rooms/[roomId]/page.tsx`
- Create: `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/rooms/page.tsx`, `src/app/(admin)/admin/rooms/new/page.tsx`, `src/app/(admin)/admin/rooms/[roomId]/page.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `getQueryClient`, `serverFetchContext`, `meQuery`, `RoomDto`, `CreateRoomInput`, `UpdateRoomInput`, `createRoomSchema`, `Button/Input/Field`.
- Produces: `roomKeys.all/list()/detail(id)/layout(id)/availability(id,start,end)`, `roomQueries.list(ctx?)`, `roomQueries.detail(id, ctx?)`, `useCreateRoom()`, `useUpdateRoom(id)`, `useDeleteRoom()`, `<RoomForm mode="create"|"edit" />`, `<DeleteRoomButton roomId />`, `<RoomCard room href />`, `<AppHeader me />`.

- [ ] **Step 1: entities/room**

`src/entities/room/model/query-keys.ts`
```ts
export const roomKeys = {
  all: ["rooms"] as const,
  list: () => [...roomKeys.all, "list"] as const,
  detail: (roomId: string) => [...roomKeys.all, "detail", roomId] as const,
  layout: (roomId: string) => [...roomKeys.all, "layout", roomId] as const,
  availability: (roomId: string, startAt: string, endAt: string) =>
    [...roomKeys.all, "availability", roomId, startAt, endAt] as const,
};
```

`src/entities/room/api/queries.ts`
```ts
import { queryOptions } from "@tanstack/react-query";
import { apiFetch, type ServerFetchContext } from "@/shared/api";
import type { RoomDto } from "@/shared/contracts";
import { roomKeys } from "../model/query-keys";

export const roomQueries = {
  list: (ctx?: ServerFetchContext) =>
    queryOptions({
      queryKey: roomKeys.list(),
      queryFn: () => apiFetch<RoomDto[]>("/api/rooms", undefined, ctx),
    }),
  detail: (roomId: string, ctx?: ServerFetchContext) =>
    queryOptions({
      queryKey: roomKeys.detail(roomId),
      queryFn: () => apiFetch<RoomDto>(`/api/rooms/${roomId}`, undefined, ctx),
    }),
};
```

`src/entities/room/ui/room-card.tsx`
```tsx
import Link from "next/link";
import type { RoomDto } from "@/shared/contracts";

export function RoomCard({ room, href }: { room: RoomDto; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400"
    >
      <span className="font-medium">{room.name}</span>
      <span className="text-sm text-zinc-600">{room.description || "설명 없음"}</span>
      <span className="text-xs text-zinc-500">
        {room.width} × {room.height}
      </span>
    </Link>
  );
}
```

`src/entities/room/index.ts`
```ts
export { roomKeys } from "./model/query-keys";
export { roomQueries } from "./api/queries";
export { RoomCard } from "./ui/room-card";
```

- [ ] **Step 2: features/room-manage**

`src/features/room-manage/api/mutations.ts`
```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/shared/api";
import type { CreateRoomInput, RoomDto, UpdateRoomInput } from "@/shared/contracts";
import { roomKeys } from "@/entities/room";

export function useCreateRoom() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: CreateRoomInput) =>
      apiFetch<RoomDto>("/api/rooms", { method: "POST", body: input }),
    onSuccess: async (room) => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.all });
      router.replace(`/admin/rooms/${room.id}`);
    },
  });
}

export function useUpdateRoom(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRoomInput) =>
      apiFetch<RoomDto>(`/api/rooms/${roomId}`, { method: "PATCH", body: input }),
    onSuccess: (room) => {
      queryClient.setQueryData(roomKeys.detail(roomId), room);
      return queryClient.invalidateQueries({ queryKey: roomKeys.list() });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (roomId: string) => apiFetch<void>(`/api/rooms/${roomId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.all });
      router.replace("/admin/rooms");
    },
  });
}
```

`src/features/room-manage/ui/room-form.tsx`
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/shared/api";
import { createRoomSchema, type RoomDto } from "@/shared/contracts";
import { Button, Field, Input } from "@/shared/ui";
import { useCreateRoom, useUpdateRoom } from "../api/mutations";

type Props = { mode: "create" } | { mode: "edit"; room: RoomDto };

export function RoomForm(props: Props) {
  const create = useCreateRoom();
  const update = useUpdateRoom(props.mode === "edit" ? props.room.id : "");
  const mutation = props.mode === "create" ? create : update;
  const [fieldError, setFieldError] = useState<string | null>(null);
  const initial = props.mode === "edit" ? props.room : null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = createRoomSchema.safeParse({
      name: form.get("name"),
      description: form.get("description") ?? "",
      width: Number(form.get("width")),
      height: Number(form.get("height")),
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setFieldError(first ? `${first.path.join(".")}: ${first.message}` : "입력을 확인하세요.");
      return;
    }
    setFieldError(null);
    mutation.mutate(parsed.data);
  }

  const serverError = mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      <Field label="이름" htmlFor="name">
        <Input id="name" name="name" defaultValue={initial?.name} required maxLength={100} />
      </Field>
      <Field label="설명" htmlFor="description">
        <Input id="description" name="description" defaultValue={initial?.description} maxLength={500} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="캔버스 너비 (px)" htmlFor="width">
          <Input id="width" name="width" type="number" min={200} max={10000} defaultValue={initial?.width ?? 1200} required />
        </Field>
        <Field label="캔버스 높이 (px)" htmlFor="height">
          <Input id="height" name="height" type="number" min={200} max={10000} defaultValue={initial?.height ?? 800} required />
        </Field>
      </div>
      {fieldError ? <p className="text-sm text-red-600">{fieldError}</p> : null}
      {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
      {mutation.isSuccess && props.mode === "edit" ? <p className="text-sm text-green-700">저장됨</p> : null}
      <Button type="submit" disabled={mutation.isPending}>
        {props.mode === "create" ? "공간 만들기" : "저장"}
      </Button>
    </form>
  );
}
```

`src/features/room-manage/ui/delete-room-button.tsx`
```tsx
"use client";

import { Button } from "@/shared/ui";
import { useDeleteRoom } from "../api/mutations";

export function DeleteRoomButton({ roomId, roomName }: { roomId: string; roomName: string }) {
  const remove = useDeleteRoom();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={remove.isPending}
      onClick={() => {
        if (window.confirm(`"${roomName}" 공간을 삭제할까요? 배치와 예약이 함께 삭제됩니다.`)) {
          remove.mutate(roomId);
        }
      }}
    >
      삭제
    </Button>
  );
}
```

`src/features/room-manage/index.ts`
```ts
export { RoomForm } from "./ui/room-form";
export { DeleteRoomButton } from "./ui/delete-room-button";
export { useCreateRoom, useUpdateRoom, useDeleteRoom } from "./api/mutations";
```

- [ ] **Step 3: widgets/app-header**

`src/widgets/app-header/ui/app-header.tsx`
```tsx
import Link from "next/link";
import type { MeDto } from "@/shared/contracts";
import { LogoutButton } from "@/features/auth";

export function AppHeader({ me }: { me: MeDto }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/rooms" className="font-semibold">
            DeskFlow
          </Link>
          <Link href="/rooms" className="text-zinc-700 hover:text-zinc-900">
            공간
          </Link>
          <Link href="/reservations" className="text-zinc-700 hover:text-zinc-900">
            내 예약
          </Link>
          {me.role === "admin" ? (
            <Link href="/admin/rooms" className="text-zinc-700 hover:text-zinc-900">
              관리
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600">{me.name}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
```

`src/widgets/app-header/index.ts`
```ts
export { AppHeader } from "./ui/app-header";
```

- [ ] **Step 4: (user) 레이아웃 + 페이지**

`src/app/(user)/layout.tsx`
```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { meQuery } from "@/entities/user";
import { AppHeader } from "@/widgets/app-header";

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
```

`src/app/(user)/rooms/page.tsx`
```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { RoomList } from "./room-list";

export default async function RoomsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(roomQueries.list(await serverFetchContext()));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <h1 className="mb-4 text-xl font-semibold">공간</h1>
      <RoomList />
    </HydrationBoundary>
  );
}
```

`src/app/(user)/rooms/room-list.tsx`
```tsx
"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { RoomCard, roomQueries } from "@/entities/room";

export function RoomList() {
  const { data: rooms } = useSuspenseQuery(roomQueries.list());
  if (rooms.length === 0) return <p className="text-sm text-zinc-600">등록된 공간이 없습니다.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => (
        <li key={room.id}>
          <RoomCard room={room} href={`/rooms/${room.id}`} />
        </li>
      ))}
    </ul>
  );
}
```

`src/app/(user)/rooms/[roomId]/page.tsx`
```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ApiError, getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function RoomDetailPage({ params }: Props) {
  const { roomId } = await params;
  const queryClient = getQueryClient();
  const room = await queryClient
    .fetchQuery(roomQueries.detail(roomId, await serverFetchContext()))
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <h1 className="text-xl font-semibold">{room.name}</h1>
      <p className="mt-1 text-sm text-zinc-600">{room.description || "설명 없음"}</p>
      <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        배치도와 예약은 다음 단계(Plan B, C)에서 구현됩니다. 캔버스 {room.width} × {room.height}
      </div>
    </HydrationBoundary>
  );
}
```

- [ ] **Step 5: (admin) 레이아웃 + 페이지**

`src/app/(admin)/admin/layout.tsx`
```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { meQuery } from "@/entities/user";
import { AppHeader } from "@/widgets/app-header";

/** admin 가드. RLS 가 최종 방어이므로 여기서는 UX 목적의 빠른 차단만. */
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
```

`src/app/(admin)/admin/rooms/page.tsx`
```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import Link from "next/link";
import { getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { AdminRoomList } from "./admin-room-list";

export default async function AdminRoomsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(roomQueries.list(await serverFetchContext()));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">공간 관리</h1>
        <Link href="/admin/rooms/new" className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white">
          새 공간
        </Link>
      </div>
      <AdminRoomList />
    </HydrationBoundary>
  );
}
```

`src/app/(admin)/admin/rooms/admin-room-list.tsx`
```tsx
"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { RoomCard, roomQueries } from "@/entities/room";

export function AdminRoomList() {
  const { data: rooms } = useSuspenseQuery(roomQueries.list());
  if (rooms.length === 0) return <p className="text-sm text-zinc-600">공간을 만들어 시작하세요.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => (
        <li key={room.id}>
          <RoomCard room={room} href={`/admin/rooms/${room.id}`} />
        </li>
      ))}
    </ul>
  );
}
```

`src/app/(admin)/admin/rooms/new/page.tsx`
```tsx
import { RoomForm } from "@/features/room-manage";

export default function NewRoomPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">새 공간</h1>
      <RoomForm mode="create" />
    </>
  );
}
```

`src/app/(admin)/admin/rooms/[roomId]/page.tsx`
```tsx
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, getQueryClient } from "@/shared/api";
import { serverFetchContext } from "@/shared/api/server-fetch-context";
import { roomQueries } from "@/entities/room";
import { DeleteRoomButton, RoomForm } from "@/features/room-manage";

interface Props {
  params: Promise<{ roomId: string }>;
}

export default async function AdminRoomPage({ params }: Props) {
  const { roomId } = await params;
  const queryClient = getQueryClient();
  const room = await queryClient
    .fetchQuery(roomQueries.detail(roomId, await serverFetchContext()))
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{room.name}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/rooms/${room.id}/editor`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            에디터 열기
          </Link>
          <DeleteRoomButton roomId={room.id} roomName={room.name} />
        </div>
      </div>
      <RoomForm mode="edit" room={room} />
    </HydrationBoundary>
  );
}
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm typecheck && pnpm lint && pnpm test`

- [ ] **Step 7: 브라우저 확인**

1. admin 계정으로 `/admin/rooms/new` → 생성 → `/admin/rooms/:id` 로 이동, 이름 수정 → "저장됨".
2. `/rooms` 에 카드 표시. 카드 클릭 → 상세.
3. 일반 계정으로 `/admin/rooms` 접근 → `/rooms` 로 리다이렉트.
4. 새로고침 시 목록이 깜빡임 없이 즉시 표시 (hydration). 브라우저 Network 탭에 `/api/rooms` 요청이 마운트 직후 발생하지 않아야 함(staleTime 60s).

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(rooms): add room list/detail pages, admin CRUD pages, app header and role guard"
```

---

## Self-Review 결과

- 스펙 커버리지(Plan A 범위): 2절 스택 ✓, 3절 아키텍처 ✓(Task 1~4), 4절 폴더 ✓, 6절 API 중 auth 4개 + rooms 5개 ✓ (layout/availability/reservations 는 Plan B/C), 7절 계약 ✓(3a 완료), 8절 Query(B 패턴, staleTime, 무효화 표의 room/auth 행) ✓, 10절 인증 흐름 ✓, 11절 에러 처리 ✓.
- 타입 일관성: `ServerFetchContext { origin, cookie }` Task 1 정의 → Task 6/8 사용 동일. `withErrorHandling<Ctx>` 시그니처 Task 3 → Task 7 `Ctx = { params: Promise<{ roomId }> }` 동일. `roomKeys.detail(roomId)` Task 8 내부 일관.
- 남은 위험: `supabase gen types --linked` 출력의 `Tables<"rooms">` 헬퍼 존재 여부(CLI 2.54 도 포함). `LayoutProps<"/">` 는 스캐폴드가 이미 사용 중이라 유지.
