/** 서버 컴포넌트가 데이터를 prefetch 하는 동안(공간 목록·레이아웃 등) 보이는 공통 스켈레톤 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6" aria-busy="true" aria-label="불러오는 중">
      <div className="mb-4 h-7 w-40 animate-pulse rounded bg-zinc-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-zinc-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
