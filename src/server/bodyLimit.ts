import type { IncomingMessage, ServerResponse } from "node:http";

const MB = 1024 * 1024;

/** Largest request body accepted for a path. Uploads get the upload limit; everything else is small. */
export function bodyLimitFor(path: string | undefined, maxUploadBytes: number): number {
  if (path === "/api/media") return maxUploadBytes + MB; // the file plus multipart framing
  return 4 * MB; // JSON bodies: the largest are a board save and a 2 MB import
}

/**
 * Stop reading a request once its body passes `limit` bytes, however it is sent. Route handlers
 * check Content-Length themselves, but a chunked request has none, and `formData()` / `json()`
 * would otherwise buffer whatever arrives. Returns false when the request was already refused.
 */
export function capRequestBody(req: IncomingMessage, res: ServerResponse, limit: number): boolean {
  const refuse = () => {
    if (!res.headersSent) res.writeHead(413, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify({ error: "Request body too large" }));
    req.destroy();
  };
  if (Number(req.headers["content-length"] ?? 0) > limit) {
    refuse();
    return false;
  }
  let seen = 0;
  const push = req.push.bind(req);
  req.push = (chunk: unknown, encoding?: BufferEncoding) => {
    if (chunk && typeof (chunk as { length?: number }).length === "number") {
      seen += (chunk as { length: number }).length;
      if (seen > limit) {
        refuse();
        return false;
      }
    }
    return push(chunk, encoding);
  };
  return true;
}
