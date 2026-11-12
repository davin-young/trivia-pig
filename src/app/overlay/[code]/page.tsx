import type { Metadata } from "next";
import OverlayClient from "./OverlayClient";

export const metadata: Metadata = { title: "Score overlay" };

/**
 * A see-through score strip for streaming software (add it as a browser source over a camera).
 * ?pos=top moves it to the top edge; ?reactions=0 turns the floating emoji off.
 */
export default async function OverlayPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ pos?: string; reactions?: string }> }) {
  const { code } = await params;
  const q = await searchParams;
  return <OverlayClient code={code.toUpperCase()} top={q.pos === "top"} reactions={q.reactions !== "0"} />;
}
