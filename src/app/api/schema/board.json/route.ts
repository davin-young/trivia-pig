import { boardJsonSchema } from "@/shared/simpleBoard";

/** The published board format as JSON Schema. Public: it describes a file format, nothing else. */
export function GET() {
  return Response.json(boardJsonSchema(), { headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
}
