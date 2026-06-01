import type { StorageItem } from "@/lib/db";

export function formatDisplayedAspectRatio(item: Pick<StorageItem, "type" | "aspectRatio">): string {
  if (item.type !== "video") return item.aspectRatio;
  const match = item.aspectRatio.match(/^(\d+)x(\d+)$/);
  if (!match) return item.aspectRatio;

  const width = Number(match[1]);
  const height = Number(match[2]);
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = a;
  let right = b;
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}
