/**
 * Single long-lived process: Next.js (pages + API routes) and Socket.IO on one port.
 * Run with `npm run dev` (tsx watch) or `npm start` after `npm run build`.
 */
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { attachSocketServer } from "@/server/socket";
import { getManager } from "@/server/live";
import { env } from "@/server/env";
import { prisma } from "@/server/db";

const dev = process.env.NODE_ENV !== "production";
const port = env.port;
const hostname = process.env.HOST ?? "0.0.0.0";

async function main() {
  // Validate secrets early so a misconfigured prod container fails fast.
  void env.secret;

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    void handle(req, res);
  });

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

  httpServer.listen(port, hostname, () => {
    console.log(`> Jeppidy ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port} (${dev ? "dev" : "production"})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, saving games...`);
    io.close();
    await getManager().flushAll().catch(console.error);
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
