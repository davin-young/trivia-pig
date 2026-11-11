import { newId, type BoardContent, type Round } from "./board";

type Row = [number, string, string];

function round(kind: "single" | "double", name: string, category: string, rows: Row[]): Round {
  return {
    id: newId("r"),
    kind,
    name,
    values: rows.map((r) => r[0]),
    categories: [
      {
        id: newId("k"),
        name: category,
        clues: rows.map(([, text, answer]) => ({ id: newId("q"), text, answer, media: null, answerMedia: null, dailyDouble: false })),
      },
    ],
  };
}

export const DEMO_TITLE = "Kava & Kratom";

export function demoBoard(): BoardContent {
  return {
    rounds: [
      round("single", "Jeopardy!", "Kava & Kratom", [
        [100, "Kratom's plant family, shared with coffee", "What is the coffee family?"],
        [200, 'Kava\'s plant family; its name means "intoxicating pepper"', "What is the pepper family?"],
        [300, "Region where kava comes from", "What is the South Pacific?"],
        [400, "Region where kratom comes from", "What is Southeast Asia?"],
        [500, "The three kratom vein colors", "What are red, white, and green?"],
      ]),
      round("double", "Double Jeopardy!", "Kava & Kratom", [
        [200, "Eye side effect of heavy kava use", "What is light sensitivity?"],
        [400, "Kratom's effect at high amounts", "What is sedating?"],
        [600, "When kava feels stronger with repeated use", "What is reverse tolerance?"],
        [800, "Kava's six main active compounds", "What are kavalactones?"],
        [1000, "How kratom acts on opioid receptors", "What is a partial opioid agonist?"],
      ]),
    ],
    final: {
      category: "Kava & Kratom",
      text: "The calming brain system that kava affects",
      answer: "What is GABA?",
      media: null,
      answerMedia: null,
    },
  };
}
