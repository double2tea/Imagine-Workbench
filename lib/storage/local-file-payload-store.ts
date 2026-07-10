import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceAssetPayloadRef } from "@/lib/storage/schema";

export interface LocalFilePayloadWriteInput {
  blob: Blob;
  contentHash?: string;
  mimeType: string;
}

export interface LocalFilePayloadStoreOptions {
  maxPayloadBytes?: number;
}

export class LocalFilePayloadStore {
  private readonly maxPayloadBytes: number | undefined;
  private readonly mediaDir: string;

  constructor(mediaDir: string, options: LocalFilePayloadStoreOptions = {}) {
    this.maxPayloadBytes = options.maxPayloadBytes;
    this.mediaDir = path.resolve(mediaDir);
  }

  async delete(ref: WorkspaceAssetPayloadRef): Promise<void> {
    assertLocalFileRef(ref);
    await rm(this.resolveStorageKey(ref.uri), { force: true });
  }

  async read(ref: WorkspaceAssetPayloadRef): Promise<Blob> {
    assertLocalFileRef(ref);
    const data = await readFile(this.resolveStorageKey(ref.uri));
    return new Blob([data], { type: ref.mimeType });
  }

  async write(input: LocalFilePayloadWriteInput): Promise<WorkspaceAssetPayloadRef> {
    return (await this.writeWithStatus(input)).ref;
  }

  async writeWithStatus(input: LocalFilePayloadWriteInput): Promise<{ created: boolean; ref: WorkspaceAssetPayloadRef }> {
    const data = Buffer.from(await input.blob.arrayBuffer());
    validatePayloadData(data, input.blob, input.mimeType, this.maxPayloadBytes);
    const contentHash = `sha256:${createHash("sha256").update(data).digest("hex")}`;
    if (input.contentHash !== undefined && input.contentHash !== contentHash) {
      throw new Error("Payload content hash does not match bytes");
    }
    const storageKey = storageKeyForHash(contentHash, input.mimeType);
    const finalPath = this.resolveStorageKey(storageKey);
    const tmpPath = this.resolveStorageKey(path.posix.join("tmp", `${randomUUID()}.part`));

    await mkdir(path.dirname(finalPath), { recursive: true });
    await mkdir(path.dirname(tmpPath), { recursive: true });
    await writeFile(tmpPath, data);
    let created = false;
    try {
      await copyFile(tmpPath, finalPath, constants.COPYFILE_EXCL);
      created = true;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    } finally {
      await rm(tmpPath, { force: true });
    }

    return {
      created,
      ref: {
        contentHash,
        kind: "local-file",
        mimeType: input.mimeType,
        sizeBytes: data.byteLength,
        uri: storageKey,
      },
    };
  }

  private resolveStorageKey(storageKey: string): string {
    if (path.isAbsolute(storageKey)) throw new Error("Invalid relative storage key");
    const parts = storageKey.split(/[\\/]+/);
    if (parts.includes("..") || parts.includes("")) throw new Error("Invalid relative storage key");
    const resolved = path.resolve(this.mediaDir, ...parts);
    if (resolved !== this.mediaDir && !resolved.startsWith(`${this.mediaDir}${path.sep}`)) {
      throw new Error("Invalid relative storage key");
    }
    return resolved;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function assertLocalFileRef(ref: WorkspaceAssetPayloadRef): void {
  if (ref.kind !== "local-file") throw new Error(`Unsupported payload location: ${ref.kind}`);
}

function validatePayloadData(data: Buffer, blob: Blob, mimeType: string, maxPayloadBytes: number | undefined): void {
  if (data.byteLength <= 0) throw new Error("Payload is empty");
  if (blob.size !== data.byteLength) throw new Error("Payload size does not match bytes");
  if (maxPayloadBytes !== undefined && data.byteLength > maxPayloadBytes) {
    throw new Error(`Payload exceeds configured max size of ${maxPayloadBytes} bytes`);
  }
  if (blob.type && blob.type !== mimeType) throw new Error("Payload MIME type does not match blob type");
  mimeExtensionFor(mimeType);
}

function storageKeyForHash(contentHash: string, mimeType: string): string {
  const hash = contentHash.replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid sha256 content hash");
  const category = payloadCategoryForMime(mimeType);
  const extension = mimeExtensionFor(mimeType);
  return path.posix.join("originals", category, hash.slice(0, 2), hash.slice(2, 4), `${hash}.${extension}`);
}

function payloadCategoryForMime(mimeType: string): string {
  if (mimeType === "application/zip") return "backup";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "text/plain") return "transcript";
  throw new Error(`Unsupported payload MIME type: ${mimeType}`);
}

function mimeExtensionFor(mimeType: string): string {
  if (mimeType === "application/zip") return "zip";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "text/plain") return "txt";
  throw new Error(`Unsupported payload MIME type: ${mimeType}`);
}
