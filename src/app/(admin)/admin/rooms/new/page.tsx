import { RoomForm } from "@/features/room-manage";

export default function NewRoomPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">새 공간</h1>
      <RoomForm mode="create" />
    </>
  );
}
