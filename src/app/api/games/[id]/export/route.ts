import { apiUser, err } from "@/server/session";
import { gameForUser, gameLog, gameSetup } from "@/server/gameAccess";
import { getManager } from "@/server/live";
import { buildResults, resultsCsv } from "@/server/results";

/** CSV export: one row per score change plus final standings. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const found = await gameForUser((await ctx.params).id, user);
  if (!found) return err("Game not found", 404);
  const { game } = found;
  const live = getManager().cached(game.id);
  const res = buildResults(live?.history.setup ?? gameSetup(game), live?.history.log ?? gameLog(game));
  const csv = resultsCsv(res, game.boardTitle);
  const date = (game.finishedAt ?? game.createdAt).toISOString().slice(0, 10);
  const safe = game.boardTitle.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "game";
  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safe}-${date}-${game.code}.csv"`,
    },
  });
}
