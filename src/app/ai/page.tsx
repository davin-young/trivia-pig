import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/server/session";
import { AppNav } from "@/components/AppNav";
import { CopyBlock, PasteBoard, TokenManager } from "@/components/ai/AiConnect";
import { APP_NAME } from "@/shared/app";
import { siteUrl } from "@/shared/site";
import { aiPrompt } from "@/shared/simpleBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Make a trivia board with AI",
  description: "Have ChatGPT, Claude or any AI assistant write a trivia board for you: copy one prompt and paste the reply, or connect your assistant with a token or MCP.",
  alternates: { canonical: "/ai" },
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold text-sm font-bold text-black">{n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{title}</h3>
        <div className="mt-1.5 flex flex-col gap-2 text-sm text-white/75">{children}</div>
      </div>
    </li>
  );
}

/** Three ways to let an AI make boards, easiest first. Public; signed-in hosts get the working parts. */
export default async function AiPage() {
  const user = await currentUser();
  const origin = siteUrl().origin;
  const signIn = (
    <Link href="/login?next=/ai" className="btn-primary self-start">Sign in to continue</Link>
  );
  return (
    <div className="min-h-dvh">
      {user ? (
        <AppNav user={user} active="ai" />
      ) : (
        <header className="border-b border-line bg-panel/95">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
            <Link href="/" className="mr-auto flex items-center gap-2 font-bold">
              <span className="text-2xl" aria-hidden="true">🐷</span>
              <span className="cat-text text-lg">{APP_NAME}</span>
            </Link>
            <Link href="/login?next=/ai" className="btn-ghost !py-1.5 text-sm">Sign in</Link>
          </div>
        </header>
      )}
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="cat-text text-3xl">Make a board with your AI</h1>
          <p className="mt-2 text-white/70">Any assistant can write a board. You stay the editor: read every clue before game night.</p>
        </div>

        <section className="card flex flex-col gap-4">
          <h2 className="text-xl font-bold">1. Copy, paste, play <span className="ml-1 rounded-full bg-gold/20 px-2 py-0.5 align-middle text-xs font-semibold text-gold">easiest</span></h2>
          <ol className="flex flex-col gap-4">
            <Step n={1} title="Copy this prompt into ChatGPT, Claude, Gemini or any assistant">
              <p>Replace <b>[YOUR TOPIC]</b> with anything: 90s movies, your family, the office.</p>
              <CopyBlock label="Prompt" text={aiPrompt()} tall />
            </Step>
            <Step n={2} title="Paste the reply here">
              {user ? <PasteBoard /> : <>{signIn}<p>No account? Save the reply as a <code>.json</code> file and use New board, Import after you sign up.</p></>}
            </Step>
            <Step n={3} title="Check the clues and start a game">
              <p>The board opens in the editor, where you can fix wording and add pictures or sound.</p>
            </Step>
          </ol>
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="text-xl font-bold">2. Connect your assistant</h2>
          <p className="text-sm text-white/75">
            For Claude Code, Cursor and other apps that support MCP: the assistant saves boards straight to your account and can edit them later.
            A token reaches <b>only your own boards</b>, never a game in progress, and you can revoke it at any time.
          </p>
          <CopyBlock label="MCP server address" text={`${origin}/mcp`} />
          {user ? <TokenManager origin={origin} /> : signIn}
          <p className="text-xs text-white/50">Apps that only accept sign-in by browser (no token header) are not supported yet.</p>
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="text-xl font-bold">3. Use the API</h2>
          <p className="text-sm text-white/75">The same token works over plain HTTP. Send it as <code>Authorization: Bearer tp_…</code></p>
          <ul className="flex flex-col gap-1 text-sm">
            {[
              ["GET", "/api/v1/boards", "list your boards"],
              ["POST", "/api/v1/boards", "create a board"],
              ["GET", "/api/v1/boards/:id", "read a board"],
              ["PUT", "/api/v1/boards/:id", "replace a board's text (the old version is kept)"],
              ["POST", "/api/v1/boards/check", "check a board without saving"],
            ].map(([m, p, d]) => (
              <li key={m + p} className="flex flex-wrap items-baseline gap-x-2">
                <code className="w-10 text-xs font-bold text-gold">{m}</code>
                <code className="text-xs">{p}</code>
                <span className="text-white/60">{d}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-white/75">
            Boards use the format from the prompt above. Its JSON Schema is at{" "}
            <a href="/api/schema/board.json" className="underline underline-offset-2 hover:text-white">/api/schema/board.json</a>.
          </p>
        </section>
      </main>
    </div>
  );
}
