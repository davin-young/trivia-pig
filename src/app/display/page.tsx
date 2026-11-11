import { CodeEntry } from "@/components/CodeEntry";

export const metadata = { title: "Open display" };

export default function DisplayEntry() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold">Open the big screen</h1>
        <p className="mb-4 text-sm text-white/60">Enter the game code. No login needed — cast or HDMI this tab to your TV.</p>
        <CodeEntry target="/display" cta="Open display" />
      </div>
    </main>
  );
}
