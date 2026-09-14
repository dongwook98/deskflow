"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { RoomCard, roomQueries } from "@/entities/room";

export function AdminRoomList() {
  const { data: rooms } = useSuspenseQuery(roomQueries.list());
  if (rooms.length === 0) {
    return <p className="text-sm text-zinc-600">공간을 만들어 시작하세요.</p>;
  }
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
