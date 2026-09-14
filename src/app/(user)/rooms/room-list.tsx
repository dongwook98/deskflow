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
