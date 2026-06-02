import { redirect } from "next/navigation";

export const runtime = "edge";

interface BoardRoutePageProps {
  params: Promise<{
    boardId: string;
  }>;
}

export default async function BoardRoutePage({ params }: BoardRoutePageProps) {
  const { boardId } = await params;
  redirect(`/board?boardId=${encodeURIComponent(boardId)}`);
}
