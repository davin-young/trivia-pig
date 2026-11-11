import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

/**
 * Media storage: local disk (dev) or any S3-compatible bucket (AWS S3, R2, MinIO).
 * Objects are always served back through /media/<key>, so buckets can stay private.
 */
export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  mime: string;
  size: number;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
};
export function mimeForKey(key: string): string {
  return MIME_BY_EXT[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Keys look like `<userId>/<id>.<ext>`; reject anything that could escape the upload dir. */
export function isSafeKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.[a-z0-9]{2,5}$/.test(key);
}

let s3client: S3Client | null = null;
function s3(): S3Client {
  if (!s3client) {
    const c = env.s3;
    s3client = new S3Client({
      endpoint: c.endpoint,
      region: c.region,
      forcePathStyle: c.forcePathStyle,
      credentials: c.accessKeyId ? { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } : undefined,
    });
  }
  return s3client;
}

function localPath(key: string): string {
  if (!isSafeKey(key)) throw new Error("Bad key");
  return path.join(path.resolve(env.uploadDir), ...key.split("/"));
}

export async function putObject(key: string, buf: Buffer, mime: string): Promise<void> {
  if (!isSafeKey(key)) throw new Error("Bad key");
  if (env.storageDriver === "s3") {
    await s3().send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: buf, ContentType: mime }));
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, buf);
}

export async function getObject(key: string, range?: { start: number; end?: number }): Promise<(StoredObject & { total: number }) | null> {
  if (!isSafeKey(key)) return null;
  if (env.storageDriver === "s3") {
    try {
      const res = await s3().send(
        new GetObjectCommand({
          Bucket: env.s3.bucket,
          Key: key,
          Range: range ? `bytes=${range.start}-${range.end ?? ""}` : undefined,
        }),
      );
      if (!res.Body) return null;
      const size = res.ContentLength ?? 0;
      const total = res.ContentRange ? Number(res.ContentRange.split("/")[1]) : size;
      return {
        body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        mime: res.ContentType ?? mimeForKey(key),
        size,
        total,
      };
    } catch {
      return null;
    }
  }
  try {
    const p = localPath(key);
    const st = await stat(p);
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? st.size - 1, st.size - 1);
    if (start > end && st.size > 0) return null;
    const stream = createReadStream(p, { start, end });
    return {
      body: Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>,
      mime: mimeForKey(key),
      size: end - start + 1,
      total: st.size,
    };
  } catch {
    return null;
  }
}

/** Whole object as a buffer (small files only, e.g. tests). */
export async function readObject(key: string): Promise<Buffer | null> {
  if (env.storageDriver === "s3") {
    const o = await getObject(key);
    if (!o) return null;
    return Buffer.from(await new Response(o.body).arrayBuffer());
  }
  try {
    return await readFile(localPath(key));
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!isSafeKey(key)) return;
  if (env.storageDriver === "s3") {
    await s3().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return;
  }
  await unlink(localPath(key)).catch(() => {});
}

/**
 * Identify a file by its magic bytes. Returns the extension + mime we will
 * store and serve it as, or null if it isn't an allowed type. SVG is
 * deliberately not allowed (it can carry scripts).
 */
export function sniffMedia(buf: Buffer): { ext: string; mime: string; kind: "image" | "audio" | "video" } | null {
  const b = buf;
  const at = (i: number, bytes: number[]) => bytes.every((x, j) => b[i + j] === x);
  const ascii = (i: number, s: string) => b.length >= i + s.length && b.toString("latin1", i, i + s.length) === s;
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png", kind: "image" };
  if (at(0, [0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg", kind: "image" };
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return { ext: "gif", mime: "image/gif", kind: "image" };
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { ext: "webp", mime: "image/webp", kind: "image" };
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return { ext: "wav", mime: "audio/wav", kind: "audio" };
  if (ascii(0, "OggS")) return { ext: "ogg", mime: "audio/ogg", kind: "audio" };
  if (ascii(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg", kind: "audio" };
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3])) return { ext: "webm", mime: "video/webm", kind: "video" };
  if (ascii(4, "ftyp")) return { ext: "mp4", mime: "video/mp4", kind: "video" };
  return null;
}
