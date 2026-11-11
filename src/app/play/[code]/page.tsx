import type { Metadata } from "next";
import PlayerClient from "./PlayerClient";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlayerClient code={code.toUpperCase()} />;
}
