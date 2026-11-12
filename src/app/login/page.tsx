import { redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { env } from "@/server/env";
import { prisma } from "@/server/db";
import { oidcEnabled } from "@/server/oidc";
import { safeNext } from "@/shared/safeNext";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const dest = safeNext(next);
  if (await currentUser()) redirect(dest);
  const firstRun = (await prisma.user.count()) === 0;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <LoginForm
        next={dest}
        allowSignup={env.allowSignup || firstRun}
        firstRun={firstRun && env.localAuth}
        error={error ?? null}
        sso={oidcEnabled() ? { label: env.oidcLabel } : null}
        localAuth={env.localAuth || !oidcEnabled()}
      />
    </main>
  );
}
