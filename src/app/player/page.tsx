import { currentProfile, profileView } from "@/server/playerProfile";
import { currentUser } from "@/server/session";
import { APP_NAME } from "@/shared/app";
import { PlayerCard } from "./PlayerCard";

export const metadata = { title: "My player card", description: `Your name, signature and results in ${APP_NAME}.` };
export const dynamic = "force-dynamic";

export default async function PlayerPage() {
  const [user, profile] = await Promise.all([currentUser(), currentProfile()]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 p-4 pb-10">
      <PlayerCard initial={profile ? await profileView(profile) : null} signedIn={!!user} />
    </main>
  );
}
