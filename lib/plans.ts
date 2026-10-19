// Default plan rules. These are the FALLBACK values.
// The admin panel stores overrides in the `app_settings` table, and `lib/settings.ts`
// merges them over these. Server code should read getSettings(), not DEFAULT_RULES.
export type Plan = "free" | "premium";

export type Feature =
  | "chat" | "notes" | "qna" | "upload" | "transcript" | "translate" | "flashcards" | "test" | "visualMap"
  | "presentation" | "studyPlan" | "career" | "grammar" | "paraphrase" | "citations"
  | "humanize";

export type Rule = {
  label: string;
  premiumOnly: boolean;
  freePerDay: number;      // ignored when premiumOnly
  premiumPerDay: number;   // hidden fair-use cap so "unlimited" cannot burn the OpenAI budget
  maxInputChars: number;   // max length of the user's main input
  maxTokens: number;       // max AI output tokens
};

export const DEFAULT_RULES: Record<Feature, Rule> = {
  upload:       { label: "Uploads",      premiumOnly: false, freePerDay: 3,  premiumPerDay: 40,  maxInputChars: 200,  maxTokens: 1500 },
  transcript:   { label: "Transcripts",  premiumOnly: false, freePerDay: 1,  premiumPerDay: 20,  maxInputChars: 200,  maxTokens: 2000 },
  translate:    { label: "Translate",    premiumOnly: false, freePerDay: 3,  premiumPerDay: 80,  maxInputChars: 6000, maxTokens: 3000 },
  chat:         { label: "Chat",         premiumOnly: false, freePerDay: 15, premiumPerDay: 300, maxInputChars: 2000, maxTokens: 1200 },
  notes:        { label: "Notes",        premiumOnly: false, freePerDay: 2, premiumPerDay: 100, maxInputChars: 8000, maxTokens: 900 },
  qna:          { label: "Q&A",          premiumOnly: false, freePerDay: 1, premiumPerDay: 100, maxInputChars: 300,  maxTokens: 1800 },
  studyPlan:    { label: "Study Plan",   premiumOnly: false, freePerDay: 2, premiumPerDay: 40,  maxInputChars: 300,  maxTokens: 2500 },
  // A twelve-month roadmap is the longest structured answer in the app: four
  // phases, a portfolio, resources and pay bands. 1500 tokens truncated it
  // mid-JSON, which the parser then threw away.
  career:       { label: "Career Help",  premiumOnly: false, freePerDay: 3, premiumPerDay: 40,  maxInputChars: 4000, maxTokens: 3500 },
  flashcards:   { label: "Flashcards",   premiumOnly: true,  freePerDay: 0, premiumPerDay: 60,  maxInputChars: 300,  maxTokens: 900 },
  test:         { label: "Tests",        premiumOnly: true,  freePerDay: 0, premiumPerDay: 30,  maxInputChars: 300,  maxTokens: 2400 },
  visualMap:    { label: "Visual Map",   premiumOnly: true,  freePerDay: 0, premiumPerDay: 40,  maxInputChars: 300,  maxTokens: 1500 },
  presentation: { label: "Presentations",premiumOnly: true,  freePerDay: 0, premiumPerDay: 20,  maxInputChars: 300,  maxTokens: 2500 },
  grammar:      { label: "Grammar",      premiumOnly: true,  freePerDay: 0, premiumPerDay: 100, maxInputChars: 6000, maxTokens: 2000 },
  paraphrase:   { label: "Paraphrase",   premiumOnly: true,  freePerDay: 0, premiumPerDay: 100, maxInputChars: 6000, maxTokens: 1500 },
  citations:    { label: "Citations",    premiumOnly: true,  freePerDay: 0, premiumPerDay: 60,  maxInputChars: 300,  maxTokens: 1200 },
  // A rewrite has to come back at roughly the length it went in at, so the output
  // budget is deliberately larger than the input cap rather than smaller.
  humanize:     { label: "Humanize",     premiumOnly: true,  freePerDay: 0, premiumPerDay: 80,  maxInputChars: 6000, maxTokens: 3000 },
};

export const FEATURES = Object.keys(DEFAULT_RULES) as Feature[];

export type UsageSummary = Record<Feature, { used: number; limit: number; locked: boolean }>;

// Pure helper (safe on client and server): turns today's counters into per-feature usage.
export function buildUsageSummary(plan: Plan, counts: Record<string, number>, rules: Record<Feature, Rule> = DEFAULT_RULES): UsageSummary {
  const out = {} as UsageSummary;
  for (const f of FEATURES) {
    const r = rules[f];
    const premium = plan === "premium";
    const locked = !premium && r.premiumOnly;
    out[f] = {
      used: counts[f] ?? 0,
      limit: premium ? r.premiumPerDay : locked ? 0 : r.freePerDay,
      locked,
    };
  }
  return out;
}
