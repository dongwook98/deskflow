import type { z, ZodType } from "zod";
import { ApiHttpError } from "./errors";

/** zod 이슈를 "필드: 메시지; 필드: 메시지" 한 줄로. 클라이언트 폼이 그대로 보여줄 수 있는 형태. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

/** 요청 JSON 본문을 스키마로 검증. JSON 파싱 실패와 스키마 위반 모두 400 invalid_input. */
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

/**
 * 쿼리스트링을 스키마로 검증. 값이 전부 문자열이므로 숫자·날짜 변환은 스키마 쪽(z.coerce 등)이 맡는다.
 * 같은 키가 여러 번 오면 마지막 값만 쓴다 (Object.fromEntries 동작).
 */
export function parseQuery<S extends ZodType>(url: URL, schema: S): z.output<S> {
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) throw new ApiHttpError(400, "invalid_input", formatIssues(result.error));
  return result.data;
}
