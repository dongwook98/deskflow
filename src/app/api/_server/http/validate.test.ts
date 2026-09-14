import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiHttpError } from "./errors";
import { parseBody, parseQuery } from "./validate";

// coerce: 쿼리스트링은 항상 문자열이므로 숫자 변환을 스키마가 담당한다.
const schema = z.object({ n: z.coerce.number().int().min(1) });

describe("parseBody", () => {
  it("유효한 JSON 본문이면 파싱 결과를 반환한다", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ n: 3 }) });
    await expect(parseBody(req, schema)).resolves.toEqual({ n: 3 });
  });

  it("본문이 JSON 이 아니면 400 invalid_input 을 던진다", async () => {
    const req = new Request("http://x", { method: "POST", body: "{nope" });
    const e = (await parseBody(req, schema).catch((x: unknown) => x)) as ApiHttpError;
    expect(e).toBeInstanceOf(ApiHttpError);
    expect(e.status).toBe(400);
    expect(e.code).toBe("invalid_input");
  });

  it("스키마 위반이면 400 을 던지고 메시지에 필드 경로를 포함한다", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ n: 0 }) });
    const e = (await parseBody(req, schema).catch((x: unknown) => x)) as ApiHttpError;
    expect(e.status).toBe(400);
    expect(e.message).toContain("n");
  });
});

describe("parseQuery", () => {
  it("URL 쿼리스트링을 스키마로 파싱한다", () => {
    expect(parseQuery(new URL("http://x/?n=5"), schema)).toEqual({ n: 5 });
  });

  it("위반 시 ApiHttpError(400) 를 던진다", () => {
    expect(() => parseQuery(new URL("http://x/?n=abc"), schema)).toThrow(ApiHttpError);
  });
});
