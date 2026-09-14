import { redirect } from "next/navigation";

/** 루트는 공간 목록으로. 미로그인이면 proxy 가 /login 으로 다시 보낸다. */
export default function Home() {
  redirect("/rooms");
}
