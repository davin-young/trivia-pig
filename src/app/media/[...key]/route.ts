import { getObject, isSafeKey } from "@/server/storage";

/**
 * Public media, addressed by unguessable keys (the display needs it without a login).
 * Supports single Range requests so audio/video can seek.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const key = (await ctx.params).key.join("/");
  if (!isSafeKey(key)) return new Response("Not found", { status: 404 });

  let range: { start: number; end?: number } | undefined;
  const m = req.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
  if (m) range = { start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined };

  const obj = await getObject(key, range);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "content-type": obj.mime,
    "content-length": String(obj.size),
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    "content-security-policy": "default-src 'none'; sandbox",
  });
  if (range) {
    const end = range.start + obj.size - 1;
    headers.set("content-range", `bytes ${range.start}-${end}/${obj.total}`);
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { status: 200, headers });
}
