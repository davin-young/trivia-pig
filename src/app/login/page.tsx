import { redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { env } from "@/server/env";
import { prisma } from "@/server/db";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (await currentUser()) redirect(safeNext);
  const firstRun = (await prisma.user.count()) === 0;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <LoginForm next={safeNext} allowSignup={env.allowSignup || firstRun} firstRun={firstRun} linkError={error === "link"} />
    </main>
  );
}
