import Link from "next/link";

export default function PairExpired() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card max-w-sm text-center">
        <div className="text-5xl">⌛</div>
        <h1 className="my-2 text-xl font-bold">That pairing code has expired</h1>
        <p className="mb-4 text-white/70">Pairing codes work once and last 5 minutes. On the host screen, open Devices → Hand off to make a fresh one.</p>
        <Link href="/" className="btn-ghost">Home</Link>
      </div>
    </main>
  );
}
