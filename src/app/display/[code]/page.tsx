import type { Metadata } from "next";
import DisplayClient from "./DisplayClient";

export const metadata: Metadata = { title: "Display" };

export default async function DisplayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DisplayClient code={code.toUpperCase()} />;
}
