import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnv } from "./env";

// 테스트마다 env 원복. 다른 테스트가 stub 된 값을 물려받지 않게 한다.
afterEach(() => vi.unstubAllEnvs());

describe("getSupabaseEnv", () => {
  it("publishable 키와 anon 키가 둘 다 있으면 publishable 키를 우선한다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(getSupabaseEnv()).toEqual({ url: "https://x.supabase.co", key: "sb_publishable_1" });
  });

  it("publishable 키가 없으면 anon 키로 폴백한다 (구 프로젝트 호환)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(getSupabaseEnv().key).toBe("anon");
  });

  it("필수 값이 없으면 어떤 키를 설정해야 하는지 메시지에 담아 던진다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => getSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});
