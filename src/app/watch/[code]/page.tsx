import type { Metadata } from "next";
import DisplayClient from "../../display/[code]/DisplayClient";

export const metadata: Metadata = { title: "Watch" };

/** Follow a game on your own screen: the big screen, without counting as the room's display. */
export default async function WatchPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DisplayClient code={code.toUpperCase()} mode="watch" />;
}
