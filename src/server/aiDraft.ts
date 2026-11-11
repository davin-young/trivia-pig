/**
 * AI board drafts: ask Claude for a full set of categories, clues and answers
 * on a topic, then turn it into a normal editable board. Optional; enabled by
 * setting ANTHROPIC_API_KEY. The host always reviews and edits the draft.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { DOUBLE_VALUES, SINGLE_VALUES, makeRound, type BoardContent } from "@/shared/board";
import { env } from "./env";

export const draftRequestSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  audience: z.string().trim().max(200).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  rounds: z.number().int().min(1).max(2).default(2),
  categories: z.number().int().min(3).max(6).default(6),
  cluesPerCategory: z.number().int().min(3).max(5).default(5),
  final: z.boolean().default(true),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

const draftSchema = z.object({
  title: z.string(),
  rounds: z.array(
    z.object({
      categories: z.array(
        z.object({
          name: z.string(),
          clues: z.array(z.object({ clue: z.string(), response: z.string() })),
        }),
      ),
    }),
  ),
  final: z.object({ category: z.string(), clue: z.string(), response: z.string() }).nullable(),
});
export type Draft = z.infer<typeof draftSchema>;

export class AiDraftError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const SYSTEM = `You write quiz boards for a live, friendly game night played in the answer-and-question style: each clue is a statement, and the correct response is phrased as a question ("What is ...?", "Who is ...?").

What makes a board good:
- Every clue is factually accurate and has exactly one clearly correct response. If you are not confident a fact is right, pick a different fact.
- Within a category, clues get harder from the first to the last, because the board assigns higher values to later rows.
- Category names are short (under 30 characters), specific, and a little playful. Categories within a round cover different angles of the topic rather than repeating each other.
- Clues are one or two sentences that can be read aloud in under ten seconds, and never contain their own answer.
- Responses are short: just the question-form answer, with no explanation.
- The Final clue is a single, harder, satisfying question that most of the room has a real chance at.

The host will review and edit everything before playing, so favor interesting, varied clues over safe filler.`;

export function draftPrompt(req: DraftRequest): string {
  const level = {
    easy: "Easy: a casual crowd with mixed knowledge should get most of the first three rows.",
    medium: "Medium: fans of the topic should get most clues; the last row should make them think.",
    hard: "Hard: written for enthusiasts; the last two rows should be genuinely tough.",
  }[req.difficulty];
  return [
    `Topic: ${req.topic}`,
    req.audience ? `Who is playing: ${req.audience}` : null,
    `Difficulty: ${level}`,
    `Write ${req.rounds} round${req.rounds === 1 ? "" : "s"}, each with exactly ${req.categories} categories of exactly ${req.cluesPerCategory} clues.`,
    req.rounds === 2 ? "The second round should be noticeably harder than the first and use different categories." : null,
    req.final ? "Include a Final clue with its own category." : "Do not include a Final clue (set final to null).",
    "Give the board a short, fun title.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Turn the model's draft into board content, tolerating a short or long category/clue count. */
export function draftToBoard(draft: Draft, req: DraftRequest): { title: string; content: BoardContent } {
  const rounds = draft.rounds.slice(0, req.rounds).map((r, ri) => {
    const kind = ri === 0 ? "single" : "double";
    const values = (kind === "single" ? SINGLE_VALUES : DOUBLE_VALUES).slice(0, req.cluesPerCategory);
    const cats = r.categories.slice(0, req.categories);
    const round = makeRound(kind, Math.max(1, cats.length), values);
    cats.forEach((cat, ci) => {
      round.categories[ci].name = cat.name.trim().slice(0, 60);
      cat.clues.slice(0, values.length).forEach((q, qi) => {
        round.categories[ci].clues[qi].text = q.clue.trim().slice(0, 1000);
        round.categories[ci].clues[qi].answer = q.response.trim().slice(0, 300);
      });
    });
    return round;
  });
  if (!rounds.length) throw new AiDraftError("The draft came back empty. Try again or rephrase the topic.");
  const final = req.final && draft.final ? { category: draft.final.category.trim().slice(0, 100), text: draft.final.clue.trim().slice(0, 1000), answer: draft.final.response.trim().slice(0, 300), media: null, answerMedia: null } : null;
  return { title: draft.title.trim().slice(0, 120) || req.topic.slice(0, 120), content: { rounds, final } };
}

export async function generateDraft(req: DraftRequest): Promise<{ title: string; content: BoardContent }> {
  if (!env.aiEnabled) throw new AiDraftError("AI drafts are not set up on this server (ANTHROPIC_API_KEY is missing).", 503);
  const client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: 180_000, maxRetries: 1 });
  let response;
  try {
    response = await client.messages.parse({
      model: env.anthropicModel,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: draftPrompt(req) }],
      output_config: { format: zodOutputFormat(draftSchema) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiDraftError("The server's ANTHROPIC_API_KEY was rejected.", 503);
    if (err instanceof Anthropic.RateLimitError) throw new AiDraftError("The AI service is busy. Try again in a minute.", 429);
    if (err instanceof Anthropic.APIConnectionError) throw new AiDraftError("Couldn't reach the AI service. Check the server's internet connection.");
    if (err instanceof Anthropic.APIError) throw new AiDraftError(`The AI service returned an error (${err.status ?? "unknown"}).`);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new AiDraftError("The AI declined to write a board on that topic. Try a different topic.", 422);
  if (response.stop_reason === "max_tokens") throw new AiDraftError("The draft was too long to finish. Try fewer categories or one round.", 422);
  if (!response.parsed_output) throw new AiDraftError("The draft couldn't be read. Try again.");
  return draftToBoard(response.parsed_output, req);
}
