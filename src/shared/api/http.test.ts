import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./http";

/**
 * 전역 fetch 를 가짜로 바꾼다.
 * body 가 undefined 면 본문 없는 응답(204 등)을 흉내 낸다.
 * 반환된 mock 으로 호출 인자(URL, init)를 검사할 수 있다.
 */
function mockFetch(status: number, body: unknown, contentType = "application/json") {
  const fn = vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": contentType },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

// 테스트마다 전역 fetch 원복. 안 하면 다음 테스트가 이전 mock 을 물려받는다.
afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("성공 응답이면 JSON 본문을 그대로 반환한다", async () => {
    mockFetch(200, { id: "1" });
    await expect(apiFetch<{ id: string }>("/api/x")).resolves.toEqual({ id: "1" });
  });

  it("204 응답이면 본문을 읽지 않고 undefined 를 반환한다", async () => {
    mockFetch(204, undefined);
    await expect(apiFetch<void>("/api/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("실패 응답 본문이 ApiErrorBody 형식이면 그 code 와 message 로 ApiError 를 던진다", async () => {
    mockFetch(409, { error: { code: "version_conflict", message: "stale" } });
    const err = await apiFetch("/api/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe("version_conflict");
    expect((err as ApiError).message).toBe("stale");
  });

  it("실패 응답 본문이 JSON 이 아니면(프록시 HTML 등) internal 코드로 감싼다", async () => {
    mockFetch(502, "<html>bad gateway</html>", "text/html");
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("internal");
    expect(err.status).toBe(502);
  });

  it("body 객체는 JSON 문자열로 직렬화하고 Content-Type 헤더를 붙인다", async () => {
    const fn = mockFetch(201, { ok: true });
    await apiFetch("/api/x", { method: "POST", body: { a: 1 } });
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("서버 컨텍스트(ctx)가 있으면 절대 URL 로 호출하고 cookie 헤더를 전달한다", async () => {
    const fn = mockFetch(200, {});
    await apiFetch("/api/x", undefined, { origin: "http://localhost:3000", cookie: "sb=1" });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/x");
    expect(new Headers(init.headers).get("cookie")).toBe("sb=1");
  });
});
