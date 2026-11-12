/**
 * Operational plumbing for the long-lived server process: readiness checks,
 * a housekeeping job, and an event-loop watchdog. Kept out of server.ts so it
 * can be unit tested.
 */
import { Worker } from "node:worker_threads";
import { prisma } from "./db";

/** Resolve to `fallback` if `p` takes longer than `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** True when Postgres answers a trivial query within `ms`. */
export function dbReady(ms = 2000): Promise<boolean> {
  return withTimeout(
    prisma.$queryRaw`SELECT 1`.then(() => true),
    ms,
    false,
  );
}

/** Emoji in names and awards need a UTF-8 database; anything else makes saves fail. */
export async function checkDbEncoding(): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<{ server_encoding: string }[]>`SHOW server_encoding`;
    const enc = rows[0]?.server_encoding;
    if (enc && enc.toUpperCase() !== "UTF8") {
      console.error(`[startup] WARNING: the database encoding is ${enc}, not UTF8. Games containing emoji or non-Latin names will fail to save. Recreate the database with ENCODING 'UTF8'.`);
    }
  } catch {}
}

/** Block startup until the database answers (the entrypoint already migrated it). */
export async function waitForDb(attempts = 30, delayMs = 2000): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    if (await dbReady()) return true;
    console.warn(`[startup] database not reachable yet (attempt ${i}/${attempts})`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** Delete expired sessions, links, and pairing records. Safe to run any time. */
export async function sweepExpired(now = new Date()): Promise<number> {
  const where = { expiresAt: { lt: now } };
  const results = await Promise.all([
    prisma.session.deleteMany({ where }),
    prisma.magicLink.deleteMany({ where }),
    prisma.pairingToken.deleteMany({ where }),
    prisma.hostGrant.deleteMany({ where }),
    prisma.invite.deleteMany({ where }),
  ]);
  return results.reduce((n, r) => n + r.count, 0);
}

export function startJanitor(intervalMs = 60 * 60_000): NodeJS.Timeout {
  const run = () =>
    sweepExpired()
      .then((n) => n > 0 && console.log(`[janitor] removed ${n} expired record(s)`))
      .catch((err) => console.error("[janitor]", err instanceof Error ? err.message : err));
  const first = setTimeout(run, 30_000);
  first.unref();
  const t = setInterval(run, intervalMs);
  t.unref();
  return t;
}

/**
 * If the event loop is blocked for `stallMs` (a hung process that still holds
 * its port), kill the process so Docker's restart policy brings it back.
 * Games are persisted on every action, so a restart resumes them.
 */
export function startWatchdog(stallMs = 45_000): () => void {
  const worker = new Worker(
    `const { parentPort, workerData } = require("node:worker_threads");
     // performance.now() is steady; Date.now() can jump when the system clock is stepped.
     let last = performance.now();
     parentPort.on("message", () => { last = performance.now(); });
     setInterval(() => {
       if (performance.now() - last > workerData.stallMs) {
         console.error("[watchdog] event loop stalled for " + (performance.now() - last) + " ms; exiting so the supervisor restarts the app");
         process.kill(process.pid, "SIGKILL");
       }
     }, 5000);`,
    { eval: true, workerData: { stallMs } },
  );
  worker.unref();
  worker.on("error", (err) => console.error("[watchdog] worker error", err));
  const beat = setInterval(() => worker.postMessage(1), 2000);
  beat.unref();
  return () => {
    clearInterval(beat);
    void worker.terminate();
  };
}
