import Link from "next/link";
import type { MeDto } from "@/shared/contracts";
import { LogoutButton } from "@/features/auth";

/** 서버 컴포넌트. me 는 레이아웃이 prefetch 한 값을 props 로 받는다. */
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
