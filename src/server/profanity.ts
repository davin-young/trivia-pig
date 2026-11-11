/**
 * Small, deliberately conservative profanity filter for typed names.
 * Matches whole words after normalising common leetspeak substitutions.
 * Extend with PROFANITY_EXTRA="word1,word2" if you need more.
 */
const BASE = [
  "fuck", "fucker", "fucking", "shit", "bitch", "cunt", "dick", "cock", "pussy", "asshole", "bastard",
  "slut", "whore", "fag", "faggot", "nigger", "nigga", "retard", "twat", "wanker", "rape", "nazi",
  "penis", "vagina", "porn", "cum", "tits", "boobs", "dildo",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

function words(): string[] {
  const extra = (process.env.PROFANITY_EXTRA ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  return [...BASE, ...extra];
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, "$1$1");
}

export function containsProfanity(text: string): boolean {
  const n = normalise(text);
  const squashed = n.replace(/[^a-z]/g, "");
  const tokens = n.split(/[^a-z]+/).filter(Boolean);
  return words().some((w) => tokens.includes(w) || (w.length >= 5 && squashed.includes(w)));
}

export function cleanName(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
}
