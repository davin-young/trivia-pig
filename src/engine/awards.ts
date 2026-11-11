import type { GameState, ScoreEvent } from "./types";

export interface Award {
  id: "fastest" | "streak" | "sharpshooter" | "highRoller" | "comeback" | "triggerHappy" | "brave";
  emoji: string;
  title: string;
  /** Display name of the winner (a player, or a team in team mode). */
  name: string;
  /** Player or contestant id, so clients can show the handwritten signature. */
  winnerId: string;
  detail: string;
}

function nameOf(s: GameState, id: string): string {
  return s.players[id]?.name ?? s.teams.find((t) => t.id === id)?.name ?? "Someone";
}

const isAnswer = (e: ScoreEvent) => e.kind !== "adjust";
const isRight = (e: ScoreEvent) => e.kind === "correct" || e.kind === "dd-correct" || e.kind === "final-correct";

/**
 * Fun end-of-game superlatives, computed from what the engine already records
 * (score events and buzz reaction times). Pure, so it is the same on every device.
 * Each award goes to at most one winner; ties go to whoever got there first.
 */
export function computeAwards(s: GameState): Award[] {
  const awards: Award[] = [];
  const live = (id: string) => (s.players[id] ? !s.players[id].removed : s.teams.some((t) => t.id === id));

  // Fastest finger: best average reaction time over at least 2 winning buzzes.
  let fastest: { id: string; avg: number; best: number } | null = null;
  let trigger: { id: string; wins: number } | null = null;
  for (const [id, st] of Object.entries(s.buzzStats ?? {})) {
    if (!live(id)) continue;
    const avg = st.totalMs / st.wins;
    if (st.wins >= 2 && (!fastest || avg < fastest.avg)) fastest = { id, avg, best: st.fastestMs };
    if (!trigger || st.wins > trigger.wins) trigger = { id, wins: st.wins };
  }
  if (fastest) {
    awards.push({
      id: "fastest",
      emoji: "⚡",
      title: "Fastest Finger",
      name: nameOf(s, fastest.id),
      winnerId: fastest.id,
      detail: `${(fastest.avg / 1000).toFixed(2)}s average buzz, best ${(fastest.best / 1000).toFixed(2)}s`,
    });
  }

  const byContestant = new Map<string, ScoreEvent[]>();
  for (const e of s.scoreEvents) {
    if (!live(e.contestantId)) continue;
    const list = byContestant.get(e.contestantId) ?? [];
    list.push(e);
    byContestant.set(e.contestantId, list);
  }

  let streak: { id: string; n: number } | null = null;
  let sharp: { id: string; pct: number; right: number; total: number } | null = null;
  let roller: { id: string; amount: number } | null = null;
  let comeback: { id: string; low: number; end: number } | null = null;
  let brave: { id: string; wrong: number } | null = null;

  for (const [id, events] of byContestant) {
    const answers = events.filter(isAnswer);
    let run = 0;
    let bestRun = 0;
    for (const e of answers) {
      run = isRight(e) ? run + 1 : 0;
      bestRun = Math.max(bestRun, run);
    }
    if (bestRun >= 3 && (!streak || bestRun > streak.n)) streak = { id, n: bestRun };

    const right = answers.filter(isRight).length;
    const wrong = answers.length - right;
    if (answers.length >= 4) {
      const pct = right / answers.length;
      if (pct >= 0.6 && (!sharp || pct > sharp.pct || (pct === sharp.pct && right > sharp.right))) sharp = { id, pct, right, total: answers.length };
    }
    if (wrong >= 3 && (!brave || wrong > brave.wrong)) brave = { id, wrong };

    for (const e of events) {
      if ((e.kind === "dd-correct" || e.kind === "final-correct") && e.delta > 0 && (!roller || e.delta > roller.amount)) roller = { id, amount: e.delta };
    }

    let score = 0;
    let low = 0;
    for (const e of events) {
      score += e.delta;
      low = Math.min(low, score);
    }
    const end = s.scores[id] ?? score;
    if (low < 0 && end - low >= 400 && end > 0 && (!comeback || end - low > comeback.end - comeback.low)) comeback = { id, low, end };
  }

  if (streak) awards.push({ id: "streak", emoji: "🔥", title: "Hot Streak", name: nameOf(s, streak.id), winnerId: streak.id, detail: `${streak.n} right answers in a row` });
  if (sharp)
    awards.push({
      id: "sharpshooter",
      emoji: "🎯",
      title: "Sharpshooter",
      name: nameOf(s, sharp.id),
      winnerId: sharp.id,
      detail: `${Math.round(sharp.pct * 100)}% correct (${sharp.right} of ${sharp.total})`,
    });
  if (roller) awards.push({ id: "highRoller", emoji: "🎲", title: "High Roller", name: nameOf(s, roller.id), winnerId: roller.id, detail: `Won a ${roller.amount.toLocaleString("en-US")} point wager` });
  if (comeback)
    awards.push({
      id: "comeback",
      emoji: "🚀",
      title: "Comeback Kid",
      name: nameOf(s, comeback.id),
      winnerId: comeback.id,
      detail: `From ${comeback.low.toLocaleString("en-US")} up to ${comeback.end.toLocaleString("en-US")}`,
    });
  if (trigger && trigger.wins >= 3 && trigger.id !== fastest?.id)
    awards.push({ id: "triggerHappy", emoji: "🔔", title: "Trigger Happy", name: nameOf(s, trigger.id), winnerId: trigger.id, detail: `First to buzz ${trigger.wins} times` });
  if (brave && brave.id !== sharp?.id) awards.push({ id: "brave", emoji: "🦁", title: "Fearless", name: nameOf(s, brave.id), winnerId: brave.id, detail: `Went for it and missed ${brave.wrong} times` });

  return awards;
}
