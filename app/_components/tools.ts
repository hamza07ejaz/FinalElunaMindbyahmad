import type { Feature } from "../../lib/plans";
import type { IconName } from "./Icon";

export type Tool = {
  key: Feature;
  slug: string;
  title: string;
  short: string;
  desc: string;
  icon: IconName;
  premium: boolean;
  grad: [string, string];
};

export const TOOLS: Tool[] = [
  { key: "chat", slug: "chat", title: "AI Tutor Chat", short: "Chat", desc: "Ask anything — or attach a PDF, slide deck or photo of your notes — and get it explained step by step.", icon: "chat", premium: false, grad: ["#8b5cf6", "#22d3ee"] },
  { key: "notes", slug: "notes", title: "Smart Notes", short: "Notes", desc: "Turn any text into clean, structured study notes and keep them in your history.", icon: "notes", premium: false, grad: ["#6366f1", "#8b5cf6"] },
  { key: "transcript", slug: "transcript", title: "Lecture Transcripts", short: "Transcript", desc: "Turn a lecture recording or voice note into a clean transcript plus revision notes.", icon: "mic", premium: false, grad: ["#06b6d4", "#6366f1"] },
  { key: "translate", slug: "translate", title: "Translate", short: "Translate", desc: "Move notes, passages or whole handouts into another language without losing the meaning.", icon: "translate", premium: false, grad: ["#14b8a6", "#8b5cf6"] },
  { key: "qna", slug: "qna", title: "Q&A Practice", short: "Q&A", desc: "Get 10 practice questions with answers on any topic, from basics to critical thinking.", icon: "qna", premium: false, grad: ["#0ea5e9", "#6366f1"] },
  { key: "studyPlan", slug: "study-plan", title: "Study Planner", short: "Planner", desc: "A day-by-day plan built around your exam date and the hours you really have.", icon: "plan", premium: false, grad: ["#10b981", "#22d3ee"] },
  { key: "career", slug: "career", title: "Career Guide", short: "Career", desc: "Roadmaps, career-path matching and realistic side-income ideas.", icon: "career", premium: false, grad: ["#f59e0b", "#f472b6"] },
  { key: "flashcards", slug: "flashcards", title: "Flashcards", short: "Flashcards", desc: "Flip-style flashcards generated instantly for quick revision.", icon: "cards", premium: true, grad: ["#ec4899", "#8b5cf6"] },
  { key: "test", slug: "test", title: "Mock Tests", short: "Tests", desc: "MCQs, true/false, short and long questions with automatic scoring.", icon: "test", premium: true, grad: ["#14b8a6", "#3b82f6"] },
  { key: "visualMap", slug: "visual-map", title: "Mind Maps", short: "Mind map", desc: "See how concepts connect with an interactive visual knowledge map.", icon: "map", premium: true, grad: ["#a855f7", "#22d3ee"] },
  { key: "presentation", slug: "presentation", title: "Slide Builder", short: "Slides", desc: "Generate a full slide deck, edit it, and download it as PowerPoint.", icon: "slides", premium: true, grad: ["#f97316", "#ec4899"] },
  { key: "grammar", slug: "grammar", title: "Grammar Fixer", short: "Grammar", desc: "Fix grammar and tone, and see exactly what changed and why.", icon: "grammar", premium: true, grad: ["#22c55e", "#06b6d4"] },
  { key: "paraphrase", slug: "paraphrase", title: "Paraphraser", short: "Paraphrase", desc: "Rewrite text in clear, natural English while keeping the meaning.", icon: "paraphrase", premium: true, grad: ["#3b82f6", "#a855f7"] },
  { key: "citations", slug: "citations", title: "Citation Maker", short: "Citations", desc: "APA, MLA and Chicago citations for your topic in seconds.", icon: "cite", premium: true, grad: ["#eab308", "#f97316"] },
  { key: "humanize", slug: "humanize", title: "Make It Sound Human", short: "Humanize", desc: "Rewrite a draft in your own voice, with the reading level and the stock phrases measured before and after.", icon: "wand", premium: true, grad: ["#8b5cf6", "#f472b6"] },
];

export const TOOL_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t])) as Record<Feature, Tool>;
