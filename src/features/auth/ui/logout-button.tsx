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
