import Link from "next/link";

/** 존재하지 않는 경로, notFound() 호출(없는 room id 등) 공통 화면 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-5xl font-semibold text-zinc-300">404</p>
      <h1 className="text-lg font-medium">페이지를 찾을 수 없습니다</h1>
      <p className="text-sm text-zinc-600">주소가 잘못되었거나 삭제된 공간일 수 있습니다.</p>
      <Link href="/rooms" className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
        공간 목록으로
      </Link>
    </main>
  );
}
