/**
 * Single long-lived process: Next.js (pages + API routes) and Socket.IO on one port.
 * Run with `npm run dev` (tsx watch) or `npm start` after `npm run build`.
 *
 * Built to be supervised (Docker `restart: unless-stopped`): every game action is
 * written through to Postgres, so whenever this process dies and comes back,
 * clients reconnect on their own and the game resumes from the saved log.
 */
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { attachSocketServer } from "@/server/socket";
import { getManager } from "@/server/live";
import { env } from "@/server/env";
import { bodyLimitFor, capRequestBody } from "@/server/bodyLimit";
import { CLIENT_IP_HEADER, resolveClientIp } from "@/server/rateLimit";
import { prisma } from "@/server/db";
import { checkDbEncoding, dbReady, startJanitor, startWatchdog, waitForDb, withTimeout } from "@/server/ops";

const dev = process.env.NODE_ENV !== "production";
const port = env.port;
const hostname = process.env.HOST ?? "0.0.0.0";
const version = process.env.APP_VERSION || "dev";
const startedAt = Date.now();
let shuttingDown = false;

async function main() {
  // Validate secrets early so a misconfigured prod container fails fast.
  void env.secret;

  if (!(await waitForDb(dev ? 3 : 30))) {
    throw new Error("Database is not reachable (check DATABASE_URL and that Postgres is up)");
  }
  void checkDbEncoding();

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    const path = req.url?.split("?")[0];
    // Liveness: the process is up and serving. Used by the Docker HEALTHCHECK.
    if (path === "/healthz") {
      res.writeHead(shuttingDown ? 503 : 200, { "content-type": "text/plain", "cache-control": "no-store" });
      res.end(shuttingDown ? "shutting down" : "ok");
      return;
    }
    // Readiness + status: also checks the database. For uptime monitors.
    if (path === "/readyz") {
      void dbReady().then((db) => {
        const ok = db && !shuttingDown;
        res.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ ok, db, version, uptimeSec: Math.round((Date.now() - startedAt) / 1000), ...getManager().stats() }));
      });
      return;
    }
    // Route handlers key their rate limits on this header; the client's own copy never survives.
    req.headers[CLIENT_IP_HEADER] = resolveClientIp(req.headers, req.socket.remoteAddress, env.trustProxy);
    if (!capRequestBody(req, res, bodyLimitFor(path, env.maxUploadBytes))) return;
    handle(req, res).catch((err) => {
      // The method and URL come from the client: strip line breaks so a request cannot forge log lines.
      const clean = (v: string | undefined) => String(v).replace(/[\r\n]/g, "");
      console.error("[http] %s %s", clean(req.method), clean(req.url), err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  // Cloudflare / reverse proxies reuse idle connections; outlive their keep-alive.
  httpServer.keepAliveTimeout = 75_000;
  httpServer.headersTimeout = 80_000;

  const io = new Server(httpServer, {
    path: "/socket.io",
    maxHttpBufferSize: 256 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Clients reconnecting within 2 minutes recover missed packets transparently.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: false },
    cors: dev ? { origin: true, credentials: true } : undefined,
  });
  attachSocketServer(io);

  httpServer.on("error", (err) => {
    console.error("[http] server error", err);
    process.exit(1);
  });
  httpServer.listen(port, hostname, () => {
    console.log(`> Jeppidy ${version} ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port} (${dev ? "dev" : "production"})`);
  });

  startJanitor();
  const stopWatchdog = dev ? () => {} : startWatchdog();

  const shutdown = async (reason: string, code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${reason}: saving games and shutting down...`);
    // Never hang forever: Docker sends SIGKILL after its grace period anyway.
    const force = setTimeout(() => {
      console.error("Shutdown timed out; exiting.");
      process.exit(code || 1);
    }, 12_000);
    force.unref();
    stopWatchdog();
    // Disconnects every client (they auto-reconnect to the next process) and stops new connections.
    io.close();
    const saved = await withTimeout(
      getManager()
        .flushAll()
        .then(() => true),
      8000,
      false,
    );
    if (!saved) console.error("Some games could not be saved before exit (they keep their last saved step).");
    await withTimeout(prisma.$disconnect(), 2000, undefined);
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown("SIGINT received", 0));
  process.on("SIGTERM", () => void shutdown("SIGTERM received", 0));
  // A bug in one request must not take down game night: log and carry on.
  process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));
  // The process is in an unknown state: save what we have and let the supervisor restart us.
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
    void shutdown("Uncaught exception", 1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
