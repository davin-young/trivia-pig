import Link from "next/link";
import { APP_NAME } from "./game";

/** Top navigation for signed-in host pages (dashboard, builder, results, admin). Server component. */
export function AppNav({ user, active }: { user: { name: string; email: string; isAdmin: boolean }; active?: "boards" | "games" | "team" | "admin" }) {
  const link = (href: string, label: string, key: typeof active) => (
    <Link href={href} className={`rounded-lg px-3 py-1.5 text-sm ${active === key ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`}>
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
        <Link href="/dashboard" className="mr-2 flex items-center gap-2 font-bold">
          <span className="text-2xl">🐷</span>
          <span className="cat-text text-lg">{APP_NAME}</span>
        </Link>
        <nav className="flex flex-wrap gap-1">
          {link("/dashboard", "Boards", "boards")}
          {link("/dashboard/games", "Games", "games")}
          {link("/dashboard/team", "Co-hosts", "team")}
          {user.isAdmin && link("/admin", "Admin", "admin")}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-white/50 sm:inline">{user.name || user.email}</span>
          <form action="/api/auth/logout" method="post">
            <button className="text-white/60 hover:text-white">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
