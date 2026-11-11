import { nanoid } from "nanoid";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { apiUser, err, json } from "@/server/session";
import { hit } from "@/server/rateLimit";
import { putObject, sniffMedia } from "@/server/storage";

/** Upload an image / audio / video file. Type is decided by magic bytes, never by the client. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  if (!hit(`upload:${user.id}`, 60, 10 * 60_000)) return err("Too many uploads, slow down", 429);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > env.maxUploadBytes + 64 * 1024) return err(`File too large (max ${Math.round(env.maxUploadBytes / 1048576)} MB)`, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("Expected a multipart upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return err("No file");
  if (file.size > env.maxUploadBytes) return err(`File too large (max ${Math.round(env.maxUploadBytes / 1048576)} MB)`, 413);
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffMedia(buf);
  if (!kind) return err("Unsupported file type. Use PNG, JPEG, GIF, WebP, MP3, OGG, WAV, MP4 or WebM.");

  const key = `${user.id}/${nanoid(16)}.${kind.ext}`;
  await putObject(key, buf, kind.mime);
  await prisma.media.create({
    data: { ownerId: user.id, key, mime: kind.mime, size: buf.length, filename: (file.name || "").slice(0, 200) },
  });
  return json({ url: `/media/${key}`, type: kind.kind, mime: kind.mime, size: buf.length });
}

export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const media = await prisma.media.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  return json({
    media: media.map((m) => ({ id: m.id, url: `/media/${m.key}`, mime: m.mime, size: m.size, filename: m.filename, createdAt: m.createdAt })),
  });
}
