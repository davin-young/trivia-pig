import type { Metadata } from "next";
import Link from "next/link";
import { CodeEntry } from "@/components/CodeEntry";
import { APP_NAME } from "@/shared/app";
import { DESCRIPTION, SITE_TITLE, siteUrl } from "@/shared/site";
import { GITHUB_URL, GitHubLink } from "@/components/site/GitHubLink";
import { ScreensMock } from "@/components/site/ScreensMock";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: APP_NAME, title: SITE_TITLE, description: DESCRIPTION, locale: "en_US" },
};

const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: "⚡", title: "Fair buzzers", body: "Buzzes are ordered by when the button was pressed, not by who has the best Wi-Fi." },
  { icon: "✍️", title: "Hand-drawn name cards", body: "Everyone signs in with a finger, and the drawings show up on the TV." },
  { icon: "↩️", title: "Undo anything", body: "Judged it wrong or opened the wrong clue? Undo any step, at any time." },
  { icon: "🎛️", title: "Host from any device", body: "Run the game from a laptop, tablet or phone, and hand off with a QR code." },
  { icon: "🧩", title: "Board builder", body: "Write clues with images, video and audio, or import from a spreadsheet." },
  { icon: "🖼️", title: "Ready-made boards", body: "Copy a board from the public gallery and play it tonight." },
  { icon: "🎯", title: "Final round with wagers", body: "Players bet on their phones and handwrite a final answer." },
  { icon: "👥", title: "Solo or teams", body: "Play individually or in teams, with emoji reactions and end-of-game awards." },
  { icon: "🛟", title: "Picks up where it left off", body: "Every action is saved. A refresh or a dropped phone never loses the game." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Is it free?", a: `Yes. ${APP_NAME} is free and open source under the MIT license, with no ads and nothing to buy.` },
  { q: "Do players need an app or an account?", a: "No. Players open the site on their phone, type the room code or scan the QR code on the TV, and draw their name." },
  { q: "What do I need to host?", a: "A screen everyone can see (a TV, projector or shared screen on a video call) and one device to run the game from. The host signs in; nobody else does." },
  { q: "Can I write my own questions?", a: "Yes. The board builder handles categories, values, pictures, video and audio. You can also import a CSV or copy a board from the gallery." },
  { q: "How many people can play?", a: "There is no fixed limit. For a big room, switch to teams or let extra people join as the audience." },
  { q: "Can I run it on my own server?", a: "Yes. It is one Node app and a Postgres database, with a Docker Compose file in the repository." },
];

function jsonLd(base: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${base}/#website`, url: `${base}/`, name: APP_NAME, description: DESCRIPTION, inLanguage: "en" },
      {
        "@type": "SoftwareApplication",
        "@id": `${base}/#app`,
        name: APP_NAME,
        url: `${base}/`,
        description: DESCRIPTION,
        applicationCategory: "GameApplication",
        operatingSystem: "Any (web browser)",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        license: "https://opensource.org/licenses/MIT",
        codeRepository: GITHUB_URL,
      },
      {
        "@type": "FAQPage",
        "@id": `${base}/#faq`,
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

export default async function Home() {
  const user = await currentUser();
  const hostHref = user ? "/dashboard" : "/login";
  const base = siteUrl();

  const steps = [
    { title: "Start a game", body: "Pick a board (a demo is waiting in your account) and press Start.", href: hostHref, cta: user ? "Go to your boards" : "Sign in to host" },
    { title: "Put it on the TV", body: "Open the display on a big screen. It shows a room code and a QR code.", href: "/display", cta: "Open a display" },
    { title: "Everyone joins by phone", body: "Players scan the QR or type the code, draw their name, and buzz in.", href: "/join", cta: "Join with a code" },
  ];

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      {/* Structured data for search engines: the site, the app and the questions answered below. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(base.origin)).replace(/</g, "\\u003c") }} />
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
            <Link href="/gallery" className="hidden rounded-lg px-3 py-2 text-white/80 hover:text-white sm:inline-block">Boards</Link>
            <GitHubLink className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-white/80 hover:text-white sm:inline-flex" />
            <Link href={hostHref} className="btn-ghost !px-3 !py-2">{user ? "Dashboard" : "Sign in"}</Link>
          </nav>
        </header>

        <main id="main">
          {/* Two doors, side by side: host a game, or join one. On phones the join card comes second. */}
          <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pt-6 pb-12 sm:pt-12 lg:grid-cols-[1fr_22rem] lg:gap-x-12 lg:pb-16">
            <div>
              <h1 className="cat-text text-4xl leading-tight sm:text-6xl">
                Trivia night on your TV. <span className="text-gold">Every phone is a buzzer.</span>
              </h1>
              <p className="mt-4 max-w-xl text-lg text-white/85">
                A free quiz-show game for game nights and classrooms. Put the board on a big screen, run it from any device, and let everyone buzz in from their own phone. No app to install.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link href={hostHref} className="btn-primary px-6 py-3 text-center text-lg">{user ? "Host a game" : "Host a game, free"}</Link>
                {!user && <Link href="/try" className="btn-ghost px-5 py-3 text-center">Build a board first, no account</Link>}
                {user && <Link href="/gallery" className="btn-ghost px-5 py-3 text-center">Browse boards</Link>}
              </div>
              <p className="mt-3 text-sm text-white/60">Only the host signs in. Players just need the room code.</p>
            </div>

            <div className="card self-start !p-5 shadow-xl shadow-black/40">
              <h2 className="text-lg font-bold">Got a code? Join the game</h2>
              <p className="mt-0.5 mb-3 text-sm text-white/70">Type the code shown on the big screen.</p>
              <CodeEntry target="/play" cta="Join" focus={false} />
            </div>
          </section>

          <section aria-label="The three screens" className="mx-auto w-full max-w-6xl px-4 pb-14 sm:pb-20">
            <ScreensMock joinHost={base.host} />
          </section>
        </main>
      </div>

      <div className="flex flex-col gap-16 py-4 sm:gap-20 sm:py-8">
        <section id="how-it-works" aria-labelledby="how-heading" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4">
          <h2 id="how-heading" className="cat-text text-3xl sm:text-4xl">Playing in three steps</h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="card flex gap-4 !p-5 md:flex-col md:gap-3">
                <span className="money flex h-11 w-11 flex-none items-center justify-center rounded-full border border-gold/50 bg-board-deep text-2xl" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="flex flex-1 flex-col">
                  <h3 className="text-lg font-bold">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/75">{s.body}</p>
                  <Link href={s.href} className="mt-3 text-sm font-semibold text-gold underline-offset-2 hover:underline">{s.cta} →</Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" aria-labelledby="features-heading" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4">
          <h2 id="features-heading" className="cat-text text-3xl sm:text-4xl">Built for a loud living room</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="text-2xl leading-none" aria-hidden="true">{f.icon}</span>
                <div>
                  <h3 className="font-bold">{f.title}</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/70">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" aria-labelledby="faq-heading" className="mx-auto w-full max-w-3xl scroll-mt-6 px-4">
          <h2 id="faq-heading" className="cat-text text-3xl sm:text-4xl">Questions</h2>
          <div className="mt-5 divide-y divide-line rounded-2xl border border-line bg-panel">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-gold transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-white/75">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="start-heading" className="mx-auto w-full max-w-6xl px-4">
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-gradient-to-br from-[var(--ui-panel-2)] to-[var(--ui-panel)] p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="sm:mr-auto">
              <h2 id="start-heading" className="cat-text text-2xl sm:text-3xl">Ready for game night?</h2>
              <p className="mt-1 text-sm text-white/75">
                A demo board is waiting in every new account. Or run your own copy:{" "}
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">open source on GitHub</a>.
              </p>
            </div>
            <Link href={hostHref} className="btn-primary flex-none px-6 py-3 text-lg">Host a game</Link>
            <Link href="/gallery" className="btn-ghost flex-none px-5 py-3">Browse boards</Link>
          </div>
        </section>
      </div>

      <footer className="mt-12 border-t border-line bg-[var(--board-edge)] sm:mt-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/" className="mr-auto flex items-center gap-2 font-bold">
              <span className="text-2xl" aria-hidden="true">🐷</span>
              <span className="cat-text text-lg">{APP_NAME}</span>
            </Link>
            <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-white/80">
              <Link href="/join" className="py-1 hover:text-white">Join a game</Link>
              <Link href="/display" className="py-1 hover:text-white">Open a display</Link>
              <Link href="/gallery" className="py-1 hover:text-white">Boards</Link>
              <Link href="/try" className="py-1 hover:text-white">Board builder</Link>
              <Link href="/ai" className="py-1 hover:text-white">Make boards with AI</Link>
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
