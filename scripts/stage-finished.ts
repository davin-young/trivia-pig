/**
 * Local testing helper: writes a finished game with a believable scoring history, so the
 * results and recap pages have something to show.
 *   npx tsx scripts/stage-finished.ts   -> prints the recap URL path
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { makeRound, type BoardContent } from "../src/shared/board";
import { replay } from "../src/engine/reducer";
import { DEFAULT_SETTINGS, type GameAction, type LogEntry, type Setup } from "../src/engine/types";
import { summarize } from "../src/server/live";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!owner) throw new Error("No user yet: sign up locally first.");

  const names = ["Science", "History", "Movies", "Food"];
  const rounds = [makeRound("single", 4, [100, 200, 300, 400], "Round 1"), makeRound("double", 4, [200, 400, 600, 800], "Round 2")];
  rounds.forEach((r) =>
    r.categories.forEach((c, ci) => {
      c.name = names[ci];
      c.clues.forEach((q, qi) => {
        q.text = `Test clue ${ci}-${qi}`;
        q.answer = `Test answer ${ci}-${qi}`;
      });
    }),
  );
  const board: BoardContent = { rounds, final: { category: "Geography", text: "Test final clue", answer: "Test final answer" } };
  const setup: Setup = { board, settings: DEFAULT_SETTINGS };

  const players = [["p1", "Vera"], ["p2", "Bram"], ["p3", "Odile"], ["p4", "Kit"]] as const;
  const actions: GameAction[] = players.map(([playerId, name]) => ({ type: "player/join", playerId, name, signature: null }));
  actions.push({ type: "game/start", dailyDoubles: {} });

  // A fixed, repeatable pattern of who buzzes and whether they are right.
  let n = 0;
  rounds.forEach((r, ri) => {
    if (ri > 0) actions.push({ type: "round/set", index: ri });
    for (let row = 0; row < r.values.length; row++) {
      for (const cat of r.categories) {
        n++;
        const who = players[(n * 7 + row) % players.length][0];
        const correct = n % 5 !== 0 && !(who === "p4" && n % 2 === 0);
        actions.push({ type: "clue/open", clueId: cat.clues[row].id }, { type: "buzzers/unlock" }, { type: "player/buzz", playerId: who }, { type: "clue/judge", correct });
        if (!correct) actions.push({ type: "clue/nobody" });
        actions.push({ type: "clue/close" });
      }
    }
  });
  actions.push({ type: "game/end" });

  const start = Date.now() - 40 * 60_000;
  const log: LogEntry[] = actions.map((action, i) => ({ seq: i + 1, at: start + i * 9_000, by: action.type.startsWith("player/") ? "player:x" : "host:u", action }));
  const state = replay(setup, log);
  if (state.phase !== "finished") throw new Error(`Game did not finish (phase ${state.phase})`);

  const game = await prisma.game.create({
    data: {
      code: "T" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      ownerId: owner.id,
      boardId: null,
      boardTitle: "Staged test game",
      status: "FINISHED",
      finishedAt: new Date(),
      setup: setup as unknown as Prisma.InputJsonValue,
      actions: log as unknown as Prisma.InputJsonValue,
      state: summarize(state) as unknown as Prisma.InputJsonValue,
    },
  });
  console.log(`/r/${game.id}`, JSON.stringify(state.scores));
}

main().finally(() => prisma.$disconnect());
