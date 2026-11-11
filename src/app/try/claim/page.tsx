import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { ClaimDraft } from "./ClaimDraft";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saving your board", robots: { index: false } };

/** After sign-in: move the board built on /try from this browser into the account. */
export default async function ClaimPage() {
  await requireUser("/try/claim");
  return <ClaimDraft />;
}
