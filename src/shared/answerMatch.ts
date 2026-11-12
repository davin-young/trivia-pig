/**
 * Lenient answer checking for solo practice: "what is the Nile?" matches "The Nile River"
 * closely enough. It is a helper for one person checking themselves (they can always overrule
 * it), never a judge in a real game.
 */

const LEAD = /^(what|who|where|when)\s+(is|are|was|were)\s+/;
const ARTICLE = /^(the|a|an)\s+/;

export function normalizeAnswer(s: string): string {
  let out = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  out = out.replace(LEAD, "");
  out = out.replace(ARTICLE, "");
  return out.trim();
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Ways the written answer may be given: "Paris (or Lutetia)", "Paris / Lutetia", "Paris or Lutetia". */
function accepted(answer: string): string[] {
  const parts = answer
    .replace(/\(([^)]*)\)/g, " / $1 ")
    .split(/\s*(?:\/|;|\bor\b)\s*/i)
    .map(normalizeAnswer)
    .filter(Boolean);
  const whole = normalizeAnswer(answer.replace(/\([^)]*\)/g, " "));
  return [...new Set([whole, ...parts].filter(Boolean))];
}

export function answersMatch(guess: string, answer: string): boolean {
  const g = normalizeAnswer(guess);
  if (!g) return false;
  for (const a of accepted(answer)) {
    if (g === a) return true;
    // Numbers must be exact: 1914 is not 1941.
    if (/\d/.test(a) || /\d/.test(g)) continue;
    const slack = Math.floor(Math.max(a.length, g.length) / 6);
    if (distance(g, a) <= slack) return true;
    // A surname for a full name, or the key words of a longer answer.
    if (g.length >= 4 && a.split(" ").includes(g)) return true;
    if (a.length >= 4 && g.split(" ").includes(a)) return true;
  }
  return false;
}
