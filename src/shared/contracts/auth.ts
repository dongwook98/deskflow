import { z } from "zod";

export type UserRole = "user" | "admin";

/** GET /api/auth/me, 로그인/가입 응답 */
export interface MeDto {
  id: string;
  name: string;
  role: UserRole;
}

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
});

export const signupSchema = loginSchema.extend({
  name: z.string().trim().min(1).max(30),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
