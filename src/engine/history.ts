import { applyAction, replay, type Cue } from "./reducer";
import type { GameAction, GameState, LogEntry, Setup } from "./types";

/**
 * An event-sourced game: a setup plus an append-only action log.
 * State is always `replay(setup, activeLog)`, so undoing *any* step is just
 * flagging it and replaying. Undo itself is reversible (redo).
 */
export class GameHistory {
  readonly setup: Setup;
  log: LogEntry[];
  state: GameState;

  constructor(setup: Setup, log: LogEntry[] = []) {
    this.setup = setup;
    this.log = log;
    this.state = replay(setup, log);
  }

  get nextSeq(): number {
    return (this.log.at(-1)?.seq ?? 0) + 1;
  }

  /** Apply a resolved action. Rejected actions are not recorded. */
  dispatch(action: GameAction, by: string, at: number = Date.now()): { ok: boolean; entry?: LogEntry; fx: Cue[] } {
    const entry: LogEntry = { seq: this.nextSeq, at, by, action };
    const fx: Cue[] = [];
    const ok = applyAction(this.state, entry, fx);
    if (!ok) return { ok: false, fx: [] };
    this.log.push(entry);
    return { ok: true, entry, fx };
  }

  /** Undo (or redo, with undone=false) a specific step, then rebuild state. */
  setUndone(seq: number, undone: boolean): boolean {
    const entry = this.log.find((e) => e.seq === seq);
    if (!entry || !!entry.undone === undone) return false;
    entry.undone = undone;
    this.rebuild();
    return true;
  }

  /** Undo the most recent non-undone step issued by a host (not players). */
  undoLast(filter: (e: LogEntry) => boolean = (e) => !e.by.startsWith("player:")): LogEntry | null {
    for (let i = this.log.length - 1; i >= 0; i--) {
      const e = this.log[i];
      if (!e.undone && filter(e)) {
        this.setUndone(e.seq, true);
        return e;
      }
    }
    return null;
  }

  rebuild() {
    const version = this.state.version;
    this.state = replay(this.setup, this.log);
    // keep the version monotonic so clients always see a change
    this.state.version = Math.max(this.state.version, version + 1);
  }
}

/** Human-readable label for the host's history list. */
export function describeAction(a: GameAction, state: GameState): string {
  const pname = (id: string) => state.players[id]?.name || "player";
  const cname = (id: string | null | undefined) =>
    !id ? "nobody" : state.teams.find((t) => t.id === id)?.name ?? state.players[id]?.name ?? "contestant";
  switch (a.type) {
    case "player/join":
      return `${a.name || "Player"} joined`;
    case "player/signature":
      return `${pname(a.playerId)} redrew their name`;
    case "player/buzz":
      return `${pname(a.playerId)} buzzed`;
    case "player/finalWager":
      return `${pname(a.playerId)} wagered`;
    case "player/finalAnswer":
      return `${pname(a.playerId)} submitted Final answer`;
    case "settings/update":
      return "Changed settings";
    case "lobby/lock":
      return a.locked ? "Locked lobby" : "Unlocked lobby";
    case "player/rename":
      return `Renamed player to ${a.name}`;
    case "player/resetSignature":
      return `Reset ${pname(a.playerId)}'s drawing`;
    case "player/hideSignature":
      return `${a.hidden ? "Hid" : "Showed"} ${pname(a.playerId)}'s drawing`;
    case "player/kick":
      return `Kicked ${pname(a.playerId)}`;
    case "player/ban":
      return `Banned ${pname(a.playerId)}`;
    case "player/restore":
      return `Restored ${pname(a.playerId)}`;
    case "team/create":
      return `Created team ${a.name}`;
    case "team/rename":
      return `Renamed team to ${a.name}`;
    case "team/delete":
      return `Deleted team`;
    case "team/assign":
      return `Moved ${pname(a.playerId)} to ${cname(a.teamId)}`;
    case "team/autoBalance":
      return "Auto-balanced teams";
    case "game/start":
      return "Started game";
    case "clue/open":
      return "Opened clue";
    case "buzzers/unlock":
      return "Unlocked buzzers";
    case "buzzers/lock":
      return "Locked buzzers";
    case "clue/judge":
      return `Marked ${a.correct ? "correct" : "incorrect"}${a.playerId ? ` (${pname(a.playerId)})` : ""}`;
    case "clue/reveal":
      return "Revealed answer";
    case "clue/nobody":
      return "Nobody got it";
    case "clue/close":
      return "Back to board";
    case "dd/wager":
      return `Daily Double wager ${a.amount}`;
    case "clue/skip":
      return "Skipped clue";
    case "clue/setUsed":
      return a.used ? "Marked clue used" : "Marked clue unused";
    case "clue/edit":
      return "Edited clue";
    case "final/edit":
      return "Edited Final Jeopardy";
    case "control/set":
      return `Gave control to ${cname(a.contestantId)}`;
    case "score/adjust":
      return `${a.delta > 0 ? "+" : ""}${a.delta} to ${cname(a.contestantId)}`;
    case "score/set":
      return `Set ${cname(a.contestantId)} to ${a.score}`;
    case "game/pause":
      return a.paused ? "Paused" : "Resumed";
    case "screen/set":
      return `Display: ${a.screen}`;
    case "announce":
      return a.text ? `Announcement: ${a.text}` : "Cleared announcement";
    case "qr/show":
      return a.show ? "Showed join QR" : "Hid join QR";
    case "timer/start":
      return `Timer ${a.seconds}s`;
    case "timer/stop":
      return "Stopped timer";
    case "round/set":
      return `Round ${a.index + 1}`;
    case "final/start":
      return "Final Jeopardy";
    case "final/showClue":
      return "Showed Final clue";
    case "final/startTimer":
      return "Started Final timer";
    case "final/close":
      return "Closed Final answers";
    case "final/reveal":
      return `Revealed ${cname(a.contestantId)}'s answer`;
    case "final/judge":
      return `${cname(a.contestantId)}: ${a.correct ? "correct" : "incorrect"}`;
    case "final/showWager":
      return `Revealed ${cname(a.contestantId)}'s wager`;
    case "final/hostWager":
      return `Entered wager for ${cname(a.contestantId)}`;
    case "game/end":
      return "Ended game";
    case "board/resetUsed":
      return "Reset used clues";
  }
}
