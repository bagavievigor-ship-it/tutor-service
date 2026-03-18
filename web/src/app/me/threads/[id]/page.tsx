import ThreadClient from "./ThreadClient";

function parseThreadId(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const id = Number(v);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export default async function Page({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const p: any = await Promise.resolve(params as any);
  const threadId = parseThreadId(p?.id);
  return <ThreadClient threadId={threadId} />;
}
