export type StoryBeat = "noticed" | "later";

export function parseBeat(value: string | undefined): StoryBeat {
  return value === "later" ? "later" : "noticed";
}

export type PatternSuggestion = {
  id: string;
  action: string;
  pattern: string;
  match: string;
  status: "suggest" | "hold" | "skip";
};

export const milaSuggestions: PatternSuggestion[] = [
  {
    id: "car",
    action: "Set up car insurance",
    pattern: "8 in 10 people who own a car arrange this with their bank",
    match: "Owns a car",
    status: "suggest",
  },
  {
    id: "home",
    action: "Open a home deposit",
    pattern: "7 in 10 people her age who save a lot open one before a mortgage",
    match: "28 · lives alone · saves more than most",
    status: "hold",
  },
  {
    id: "family",
    action: "Family insurance",
    pattern: "Usually arranged when people plan a child",
    match: "No match in her profile",
    status: "skip",
  },
];

export const laterQuote = "I've been looking at apartments.";

export const illustrativeNote = "Illustrative patterns, not a live model.";
