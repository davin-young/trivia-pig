/**
 * Where to send someone after sign-in. Only a path on this site is allowed: one leading "/",
 * not followed by "/" or "\" (browsers read both as another host), and no control characters
 * (browsers drop tabs and newlines, which would turn "/<tab>/evil.example" into "//evil.example").
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !/^\/(?![/\\])[^\u0000-\u001f\u007f]*$/.test(next)) return fallback;
  return next;
}
