import type { BoardNodeKind, BoardReferenceRole } from "@/lib/board/types";
import type { MediaReferenceType } from "@/lib/media-references";

type StackPrimitive = string | number | boolean | null;
export type BoardResultStackValue = StackPrimitive | BoardResultStackValue[] | { readonly [key: string]: BoardResultStackValue | undefined };

export interface BoardResultStackReference {
  id: string;
  role?: BoardReferenceRole | string;
  type?: MediaReferenceType | string;
  url?: string;
}

export interface BoardResultStackIdentityInput {
  kind: Extract<BoardNodeKind, "image-generate" | "video-generate" | "audio-operation" | "runninghub-app">;
  model: string;
  params: BoardResultStackValue;
  prompt: string;
  references: readonly BoardResultStackReference[];
}

function stableStringify(value: BoardResultStackValue): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value)
    .filter((entry): entry is [string, BoardResultStackValue] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function digestString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildBoardResultStackKey(input: BoardResultStackIdentityInput): string {
  const identity: BoardResultStackValue = {
    kind: input.kind,
    model: input.model,
    params: input.params,
    prompt: input.prompt,
    references: input.references.map(reference => ({
      id: reference.id,
      role: reference.role ?? "",
      type: reference.type ?? "",
      url: reference.url ?? "",
    })),
  };
  return `v2:${digestString(stableStringify(identity))}`;
}
