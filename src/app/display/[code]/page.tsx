import type { Metadata } from "next";
import DisplayClient from "./DisplayClient";

export const metadata: Metadata = { title: "Display" };

/** ?obs=1 is for a browser source in streaming software; add &mute=1 to keep it silent. */
export default async function DisplayPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ obs?: string; mute?: string }> }) {
  const { code } = await params;
  const q = await searchParams;
  return <DisplayClient code={code.toUpperCase()} obs={q.obs === "1"} mute={q.mute === "1"} />;
}
