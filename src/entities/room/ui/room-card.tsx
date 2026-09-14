import Link from "next/link";
import type { RoomDto } from "@/shared/contracts";

/** 목록 카드. 사용자/관리자 목록이 href 만 다르게 재사용한다. */
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
