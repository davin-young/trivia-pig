import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bodyLimitFor, capRequestBody } from "./bodyLimit";

describe("bodyLimitFor", () => {
  it("gives uploads the upload limit and everything else a small one", () => {
    expect(bodyLimitFor("/api/media", 10 * 1024 * 1024)).toBe(11 * 1024 * 1024);
    expect(bodyLimitFor("/api/boards/import", 10 * 1024 * 1024)).toBe(4 * 1024 * 1024);
    expect(bodyLimitFor(undefined, 10 * 1024 * 1024)).toBe(4 * 1024 * 1024);
  });
});

describe("capRequestBody", () => {
  // A server that reads the whole body, like formData() / json() would.
  const server = createServer((req, res) => {
    if (!capRequestBody(req, res, 1000)) return;
    let size = 0;
    req.on("data", (c: Buffer) => (size += c.length));
    req.on("end", () => res.end(String(size)));
    req.on("error", () => {});
  });
  let port = 0;
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.close();
  });

  const send = (bytes: number, chunked: boolean) =>
    new Promise<number>((resolve) => {
      const body = Buffer.alloc(bytes, "a");
      const req = request(
        { host: "127.0.0.1", port, method: "POST", headers: chunked ? { "transfer-encoding": "chunked" } : { "content-length": bytes } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", () => resolve(0));
      req.end(body);
    });

  it("lets a small body through", async () => {
    expect(await send(500, false)).toBe(200);
    expect(await send(500, true)).toBe(200);
  });

  it("refuses a large body by its Content-Length", async () => {
    expect(await send(5000, false)).toBe(413);
  });

  it("refuses a large chunked body, which has no Content-Length", async () => {
    expect([413, 0]).toContain(await send(50_000, true));
  });
});
