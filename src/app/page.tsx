import type { Metadata } from "next";
import Link from "next/link";
import { CodeEntry } from "@/components/CodeEntry";
import { APP_NAME } from "@/shared/app";
import { GITHUB_URL, GitHubLink } from "@/components/site/GitHubLink";
import { ScreensMock } from "@/components/site/ScreensMock";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

function siteUrl(): URL {
  try {
    return new URL(process.env.APP_URL || "https://triviapig.lol");
  } catch {
    return new URL("https://triviapig.lol");
  }
}

const TAGLINE = "Quiz-show night on your TV, with every phone as a buzzer";
const DESCRIPTION =
  "An open-source, self-hosted quiz-show game for game nights. The board goes on the TV, the host runs it from any laptop, tablet or phone, and players buzz in from their own phones.";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { absolute: `${APP_NAME}: ${TAGLINE.toLowerCase()}` },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: APP_NAME,
    title: `${APP_NAME}: ${TAGLINE.toLowerCase()}`,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary", title: APP_NAME, description: DESCRIPTION },
};

const STEPS = [
  {
    title: "Put the board on the TV",
    body: "Open the display on any big screen: cast it, AirPlay it, or plug in a cable. It needs no sign-in and shows a room code and a QR code for the room.",
  },
  {
    title: "Phones join and sign in by hand",
    body: "Players enter the code or scan the QR. No app to install. Everyone draws their own name card with a finger, and it shows up on the TV.",
  },
  {
    title: "The host runs the show",
    body: "Open clues, judge answers and fix scores from a laptop, tablet or phone. Play two rounds, then a final round where everyone wagers.",
  },
];

interface Feature {
  title: string;
  body: string;
}

const FEATURE_GROUPS: { id: string; heading: string; intro: string; features: Feature[] }[] = [
  {
    id: "players",
    heading: "For the players",
    intro: "Nothing to install. A phone and the room code are enough.",
    features: [
      {
        title: "Fair buzzers",
        body: "The server measures each phone's network delay and orders buzzes by when the button was pressed, so the best Wi-Fi doesn't win. An optional lockout penalizes buzzing too early.",
      },
      {
        title: "Hand-drawn name cards",
        body: "Draw your name in ten bright colors or a custom one, with three brush sizes, an eraser, and rainbow and neon-glow brushes. Drawings are stored as vectors, so they stay crisp on a 4K TV.",
      },
      {
        title: "All-play clues",
        body: "The host can open any clue to the whole room. Everyone types an answer at once, right answers score, and wrong ones cost nothing.",
      },
      {
        title: "A final round with wagers",
        body: "Players wager on their phones and handwrite their final answer, then the host walks through the reveal on the big screen.",
      },
      {
        title: "Reactions and awards",
        body: "Send emoji reactions to the TV during the game. The winner screen hands out awards such as fastest buzzer, longest streak and biggest comeback.",
      },
      {
        title: "Solo or in teams",
        body: "The host can drag players onto teams or balance them automatically. If a phone drops off, the player gets their seat and score back when it reconnects.",
      },
    ],
  },
  {
    id: "host",
    heading: "For the host",
    intro: "Real controls for a live room, so mistakes take seconds to fix.",
    features: [
      {
        title: "Undo any step",
        body: "Judged an answer wrong, or opened the wrong clue? Undo any step of the game, not just the last one, and redo it if you change your mind.",
      },
      {
        title: "Host from any device",
        body: "The controls fit a laptop (with keyboard shortcuts), a tablet or a phone. Scan a QR code to hand them to another device as host, co-host or scorekeeper.",
      },
      {
        title: "Live controls",
        body: "Edit scores, fix a typo mid-game, skip or re-open a clue, pause, blank the screen, show the scoreboard, or put an announcement on the TV.",
      },
      {
        title: "Buzzers that open on time",
        body: "Optionally the buzzers open by themselves after a reading time based on the clue's length, with countdown light bars on the display so nobody has to guess.",
      },
      {
        title: "Recovers from crashes",
        body: "Every action is saved as it happens. After a refresh, a dropped connection or a server restart, devices reconnect by themselves and the game continues where it was.",
      },
      {
        title: "Original sound and practice bots",
        body: "All audio is original and synthesized in the browser, with a soundboard for the host. Add bot players to rehearse a board on your own.",
      },
    ],
  },
  {
    id: "boards",
    heading: "Boards and seasons",
    intro: "Write your own questions, borrow someone else's, and keep score across game nights.",
    features: [
      {
        title: "Board builder",
        body: "Edit the grid inline with keyboard navigation and autosave. Add images, video, audio or YouTube links, import from CSV or JSON, start from a template, and roll back with version history.",
      },
      {
        title: "Public gallery",
        body: "Hosts can list a board in the gallery, where anyone can search, preview and copy it to make it their own.",
      },
      {
        title: "Season leaderboard",
        body: "Wins, podiums, totals and averages across finished games, by player or team name, for the last 30, 90 or 365 days or all time.",
      },
      {
        title: "Dashboard",
        body: "Organize boards with search, tags and folders. Resume active games, look back at game history, export results as CSV, and start a rematch.",
      },
    ],
  },
];

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold tracking-widest text-gold uppercase">{eyebrow}</p>
      <h2 id={id} className="cat-text mt-2 text-3xl sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-white/75">{children}</p>}
    </div>
  );
}

export default async function Home() {
  const user = await currentUser();
  const hostHref = user ? "/dashboard" : "/login";
  const joinHost = siteUrl().host;

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a href="#main" className="btn-primary sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">
        Skip to content
      </a>

      <div className="bg-gradient-to-b from-[var(--board-deep)] via-[var(--board-edge)] to-[var(--ui-bg)]">
        <header className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3">
          <Link href="/" className="mr-auto flex items-center gap-2 font-bold">
            <span className="text-3xl" aria-hidden="true">🐷</span>
            <span className="cat-text text-xl">{APP_NAME}</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold sm:gap-2">
            <a href="#how-it-works" className="hidden rounded-lg px-3 py-2 text-white/80 hover:text-white md:inline-block">How it works</a>
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-white/80 hover:text-white md:inline-block">Features</a>
            <Link href="/gallery" className="hidden rounded-lg px-3 py-2 text-white/80 hover:text-white sm:inline-block">Gallery</Link>
            <GitHubLink className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-white/80 hover:text-white" />
            <Link href={hostHref} className="btn-ghost !px-3 !py-2">{user ? "Dashboard" : "Sign in"}</Link>
          </nav>
        </header>

        <main id="main">
          {/* Hero. On phones the join card comes right after the pitch so it stays above the fold. */}
          <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pt-4 pb-12 sm:pt-10 lg:grid-cols-[1fr_24rem] lg:gap-x-12 lg:pb-16">
            <div className="lg:pt-4">
              <h1 className="cat-text text-5xl sm:text-7xl">{APP_NAME}</h1>
              <p className="mt-3 max-w-xl text-lg text-white/85 sm:text-xl">
                {TAGLINE}. A big-screen board, host controls on any device, and hand-drawn name cards.
              </p>
            </div>

            <div className="card self-start !p-5 shadow-xl shadow-black/40 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <h2 className="text-lg font-bold">Join a game</h2>
              <p className="mt-0.5 mb-3 text-sm text-white/70">Enter the code shown on the big screen.</p>
              <CodeEntry target="/play" cta="Join" />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:col-start-1 lg:row-start-2 lg:self-start">
              <Link href={hostHref} className="btn-primary px-6 py-3 text-lg">Host a game</Link>
              {!user && <Link href="/try" className="btn-ghost px-5 py-3">Try the board builder</Link>}
              <Link href="/gallery" className="btn-ghost px-5 py-3">Browse boards</Link>
            </div>
          </section>

          <section aria-label="The three screens" className="mx-auto w-full max-w-6xl px-4 pb-14 sm:pb-20">
            <ScreensMock joinHost={joinHost} />
          </section>
        </main>
      </div>

      <div className="flex flex-col gap-16 py-4 sm:gap-24 sm:py-8">
        <section id="how-it-works" aria-labelledby="how-heading" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4">
          <SectionHeading id="how-heading" eyebrow="How it works" title="Three screens, one live game">
            Everything stays in sync: the TV, the host&apos;s controller, and every phone in the room.
          </SectionHeading>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card flex gap-4 !p-5 md:flex-col md:gap-3">
                <span className="money flex h-11 w-11 flex-none items-center justify-center rounded-full border border-gold/50 bg-board-deep text-2xl" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-bold">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/75">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/display" className="btn-ghost text-sm">Open a display</Link>
            <Link href="/join" className="btn-ghost text-sm">Join with a code</Link>
          </div>
        </section>

        <section id="features" aria-labelledby="features-heading" className="mx-auto flex w-full max-w-6xl scroll-mt-6 flex-col gap-10 px-4">
          <SectionHeading id="features-heading" eyebrow="Features" title="Built for a loud living room">
            Quick to join, fair to play, and forgiving when the host taps the wrong thing.
          </SectionHeading>
          {FEATURE_GROUPS.map((g) => (
            <div key={g.id}>
              <h3 className="text-xl font-bold">{g.heading}</h3>
              <p className="mt-1 text-sm text-white/70">{g.intro}</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.features.map((f) => (
                  <li key={f.title} className="card !p-5">
                    <h4 className="font-bold text-gold">{f.title}</h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/75">{f.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!user && (
            <div className="card flex flex-col gap-3 !p-5 sm:flex-row sm:items-center">
              <div className="sm:mr-auto">
                <h3 className="text-lg font-bold">Try the builder without an account</h3>
                <p className="mt-1 text-sm text-white/75">Your draft is kept in this browser and moves into your account when you sign in.</p>
              </div>
              <Link href="/try" className="btn-primary flex-none">Try the board builder</Link>
            </div>
          )}
        </section>

        <section id="open-source" aria-labelledby="oss-heading" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4">
          <div className="grid gap-6 rounded-2xl border border-line bg-gradient-to-br from-[var(--ui-panel-2)] to-[var(--ui-panel)] p-5 sm:p-8 lg:grid-cols-2 lg:gap-10">
            <div>
              <SectionHeading id="oss-heading" eyebrow="Open source" title="Yours to run and change">
                {APP_NAME} is open source and self-hostable. The whole thing is one Node app and a Postgres database, so you can run it on a home server or a small cloud machine and keep your boards and games on hardware you control.
              </SectionHeading>
              <div className="mt-5 flex flex-wrap gap-3">
                <GitHubLink className="btn-primary px-5 py-3">View the source on GitHub</GitHubLink>
              </div>
              <p className="mt-3 text-sm break-words text-white/70">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
                  github.com/davin-young/trivia-pig
                </a>
              </p>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold">Run your own copy</h3>
              <p className="mt-1 text-sm text-white/75">With Docker installed, from a copy of the repository:</p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-[#0e1330] p-3 text-sm text-white/90">
                <code>docker compose up --build</code>
              </pre>
              <p className="mt-3 text-sm text-white/75">
                That starts the app with its database and media storage on port 3000. The README covers configuration, sign-in options and deploying behind your own domain.
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer className="mt-12 border-t border-line bg-[var(--board-edge)] sm:mt-20">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/" className="mr-auto flex items-center gap-2 font-bold">
              <span className="text-2xl" aria-hidden="true">🐷</span>
              <span className="cat-text text-lg">{APP_NAME}</span>
            </Link>
            <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-white/80">
              <Link href="/join" className="py-1 hover:text-white">Join</Link>
              <Link href="/gallery" className="py-1 hover:text-white">Gallery</Link>
              <Link href="/try" className="py-1 hover:text-white">Try</Link>
              <Link href={hostHref} className="py-1 hover:text-white">{user ? "Dashboard" : "Sign in"}</Link>
              <GitHubLink className="inline-flex items-center gap-1.5 py-1 hover:text-white" />
            </nav>
          </div>
          <p className="max-w-3xl text-xs leading-relaxed text-white/60">
            {APP_NAME} is an independent, open-source hobby project for private game nights. It is not affiliated with, sponsored by, or endorsed by any television show or its producers.
          </p>
        </div>
      </footer>
    </div>
  );
}
