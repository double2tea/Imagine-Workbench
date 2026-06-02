import BoardPageClient from "@/components/board/BoardPageClient";

interface BoardRoutePageProps {
  params: Promise<{
    boardId: string;
  }>;
}

export default async function BoardRoutePage({ params }: BoardRoutePageProps) {
  const { boardId } = await params;
  return <BoardPageClient boardId={decodeURIComponent(boardId)} />;
}
