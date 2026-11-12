import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkAuthorize, redirectLabel } from "@/server/oauth";
import { currentUser } from "@/server/session";
import { APP_NAME } from "@/shared/app";
import { ConsentButtons } from "./ConsentButtons";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false } };
export const dynamic = "force-dynamic";

const FIELDS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "resource", "scope"] as const;

/** Consent screen: an AI app is asking to make and edit this person's boards. */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q: Record<string, string | undefined> = {};
  for (const k of FIELDS) {
    const v = raw[k];
    if (typeof v === "string") q[k] = v;
  }
  const check = await checkAuthorize(q);
  if (!check.ok && "redirect" in check) redirect(check.redirect);

  const user = check.ok ? await currentUser() : null;
  if (check.ok && !user) {
    const back = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${back.toString()}`)}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-8">
      <header className="text-center">
        <div className="text-5xl">🐷</div>
        <div className="cat-text mt-1 text-2xl">{APP_NAME}</div>
      </header>
      {!check.ok ? (
        <section className="card flex flex-col gap-3">
          <h1 className="text-xl font-bold">This app can&apos;t be connected</h1>
          <p className="text-white/70">{"show" in check ? check.show : ""}</p>
          <Link href="/dashboard" className="btn-ghost self-start">Back to your boards</Link>
        </section>
      ) : (
        <section className="card flex flex-col gap-4">
          <h1 className="text-xl font-bold">
            Let <span className="text-gold">{check.clientName}</span> work with your boards?
          </h1>
          <p className="text-sm text-white/70">
            You are signed in as <b>{user!.email}</b>. After you answer you will be sent back to <b>{redirectLabel(check.request.redirectUri)}</b>.
          </p>
          <div className="rounded-xl bg-white/5 p-3 text-sm">
            <div className="mb-1 font-semibold">It will be able to</div>
            <ul className="list-inside list-disc text-white/80">
              <li>see your boards, with their clues and answers</li>
              <li>make new boards and change your existing ones</li>
              <li>share a board by link or list it in the public gallery, and stop sharing it</li>
            </ul>
            <div className="mb-1 mt-3 font-semibold">It will not be able to</div>
            <ul className="list-inside list-disc text-white/80">
              <li>run, join or see games</li>
              <li>see other hosts&apos; boards, or your account and sign-in</li>
            </ul>
          </div>
          <p className="text-xs text-white/50">Only allow this if you started connecting an app just now. You can disconnect it any time under AI, Connected apps.</p>
          <ConsentButtons fields={Object.fromEntries(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === "string"))} />
        </section>
      )}
    </main>
  );
}
