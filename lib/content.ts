/**
 * Everything written on the public site.
 *
 * Code holds the defaults; the admin panel stores overrides in `app_settings`
 * under the `site` key, exactly like limits and branding. Nothing on the
 * landing page is hard-coded into a component, so the whole page can be
 * reworded without a deploy.
 */

export type HeroContent = {
  eyebrow: string;
  headline: string;
  /** The word or phrase in the headline that carries the spectrum. Must appear in `headline`. */
  accent: string;
  subline: string;
  primaryCta: string;
  secondaryCta: string;
  /** Under the buttons. Short — it is a reassurance, not a sentence of marketing. */
  reassurance: string;
  /** Optional. An mp4/webm URL. Empty means the built-in animated hero is used. */
  videoUrl: string;
  /** Shown while the video loads, and to anyone who has asked for reduced motion. */
  videoPoster: string;
  /** The left (raw) and right (understood) sides of the seam. */
  beforeLabel: string;
  afterLabel: string;
};

export type FeatureItem = { title: string; body: string; icon: string };
export type StepItem = { title: string; body: string };
export type FaqItem = { q: string; a: string };
export type SectionIntro = { kicker: string; title: string; sub: string };

export type SiteContent = {
  hero: HeroContent;
  marquee: string[];
  features: SectionIntro & { items: FeatureItem[] };
  how: SectionIntro & { items: StepItem[] };
  proof: { label: string; items: string[] };
  pricing: SectionIntro;
  faq: SectionIntro & { items: FaqItem[] };
  cta: { title: string; sub: string; button: string };
  footerNote: string;
  /** Turn whole sections off without deleting what is written in them. */
  show: {
    marquee: boolean;
    proof: boolean;
    features: boolean;
    how: boolean;
    pricing: boolean;
    faq: boolean;
    bot: boolean;
  };
  bot: {
    name: string;
    greeting: string;
    /** Shown when neither the written answers nor the AI can help. */
    fallback: string;
    /** false = the bot only ever uses the written answers. */
    aiEnabled: boolean;
  };
};

export const DEFAULT_SITE: SiteContent = {
  hero: {
    eyebrow: "Reads your actual course material",
    headline: "Turn what you were given into something you understand",
    accent: "understand",
    subline:
      "Upload the chapter, the slide deck or the lecture recording. Eluna reads it and explains it back step by step, then turns it into notes, a mind map or a practice test you can sit.",
    primaryCta: "Start free",
    secondaryCta: "See how it works",
    reassurance: "No card. Free every day, not just for a week.",
    videoUrl: "",
    videoPoster: "",
    beforeLabel: "What you were given",
    afterLabel: "What you walk away with",
  },

  marquee: [
    "Lecture recordings", "Scanned handouts", "Slide decks", "Photos of notes",
    "Textbook chapters", "Past papers", "Seminar audio", "Lab sheets",
  ],

  proof: {
    label: "Give it any of these and it works from that, not from a guess",
    items: ["PDF", "Word", "PowerPoint", "Photos", "MP3 and M4A", "Plain text"],
  },

  features: {
    kicker: "What it does with it",
    title: "One upload, eight ways to work with it",
    sub: "Every tool reads the same file, so you are never re-explaining your own course to a chat box.",
    items: [
      { title: "Explains it step by step", body: "Ask about any line in the file and get the reasoning, not just the answer. Formulas are typeset properly.", icon: "chat" },
      { title: "Writes the notes you would have", body: "Structured headings, the key terms in bold, and three questions to check yourself at the end.", icon: "notes" },
      { title: "Maps how it connects", body: "A mind map built from the material, so you can see which ideas hang off which.", icon: "map" },
      { title: "Sets you a real test", body: "Multiple choice, short answer and long answer, marked, with the reasoning shown afterwards.", icon: "test" },
      { title: "Transcribes the lecture", body: "A recording becomes a clean transcript plus revision notes, in one go.", icon: "mic" },
      { title: "Builds the deck", body: "A full slide deck from the material, editable, and it downloads as PowerPoint.", icon: "slides" },
      { title: "Moves it between languages", body: "Twenty-one languages, keeping the formulas, code and structure intact.", icon: "translate" },
      { title: "Plans the week before the exam", body: "A day-by-day plan built around your exam date and the hours you actually have.", icon: "plan" },
    ],
  },

  how: {
    kicker: "Three steps",
    title: "From a file on your phone to something you can revise from",
    sub: "",
    items: [
      { title: "Bring the material", body: "Drag in the PDF, photograph the page, or drop the recording. Nothing to install." },
      { title: "Ask it anything about that file", body: "It answers from your material. When something is not in there, it says so instead of inventing it." },
      { title: "Keep what you made", body: "Notes, maps, decks and transcripts stay in your account, and export as Word, PDF or PowerPoint." },
    ],
  },

  pricing: {
    kicker: "Plans",
    title: "Free is a real plan, not a demo",
    sub: "The free tier refills every day. Premium is for exam weeks, when the daily limits stop being enough.",
  },

  faq: {
    kicker: "Before you sign up",
    title: "The things people actually ask",
    sub: "",
    items: [
      { q: "Is the free plan actually usable?",
        a: "Yes, and it refills every day rather than running out after a week. You get the tutor, notes, practice questions, the planner and the career guide without a card. Every tool shows what you have left before you use it." },
      { q: "What can it read?",
        a: "PDFs, Word files, PowerPoint, plain text, photos of handwritten pages, and audio recordings up to about fifteen minutes. A scanned PDF has no text in it, so upload those pages as images instead and it reads them with vision." },
      { q: "Will this get me in trouble with my university?",
        a: "Used to understand, revise and check your own work, it is no different from a tutor. Submitting its writing as your own breaks almost every academic integrity policy, and we do not help anyone hide that AI was used." },
      { q: "Does it make things up?",
        a: "Sometimes, like every AI. It is built to work from your file rather than from memory, and to say when something is not in there — but check anything that matters, especially numbers, dates and citations." },
      { q: "What happens to my files?",
        a: "They are stored privately against your account and read only to answer your questions. Delete a file and both the file and the text taken from it go. Nothing is shared with other users." },
      { q: "How do I cancel?",
        a: "One click from your account page, which opens the billing page where you cancel yourself. You keep Premium until the end of the period you already paid for, and nothing is charged after that." },
    ],
  },

  cta: {
    title: "Open the file you have been avoiding",
    sub: "It takes a minute to find out whether this helps. No card, and the free plan does not expire.",
    button: "Start free",
  },

  footerNote: "Eluna explains and revises. It does not sit your exams, and it will not pretend its work is yours.",

  show: { marquee: true, proof: true, features: true, how: true, pricing: true, faq: true, bot: true },

  bot: {
    name: "Eluna",
    greeting: "Ask me anything about how this works — I am the same tutor, just out here on the front page.",
    fallback:
      "I do not have a good answer to that one out here. Create a free account and ask me properly inside, where I can read your files.",
    aiEnabled: true,
  },
};

/** Merge a stored object over its defaults, one level deep, keeping only known keys. */
function mergeShallow<T extends object>(base: T, stored: unknown): T {
  if (!stored || typeof stored !== "object") return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    if (!(k in out) || v === null || v === undefined) continue;
    const current = out[k];
    // Arrays replace wholesale: a shorter list must be able to shorten the page.
    if (Array.isArray(current)) { if (Array.isArray(v)) out[k] = v; continue; }
    if (current && typeof current === "object" && typeof v === "object" && !Array.isArray(v)) {
      out[k] = mergeShallow(current as object, v);
      continue;
    }
    if (typeof current === typeof v) out[k] = v;
  }
  return out as T;
}

const str = (v: unknown, max: number, fallback: string) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;

/**
 * Validate what came out of the database. An admin can empty a field by
 * accident, and a landing page with a blank headline is worse than one with
 * the default, so anything empty falls back rather than rendering nothing.
 */
export function normaliseSite(stored: unknown): SiteContent {
  const s = mergeShallow(DEFAULT_SITE, stored);
  const d = DEFAULT_SITE;

  return {
    ...s,
    hero: {
      ...s.hero,
      eyebrow: str(s.hero.eyebrow, 90, d.hero.eyebrow),
      headline: str(s.hero.headline, 140, d.hero.headline),
      // An accent that is not in the headline would silently highlight nothing.
      accent: s.hero.headline?.includes(s.hero.accent) && s.hero.accent.trim() ? s.hero.accent : "",
      subline: str(s.hero.subline, 400, d.hero.subline),
      primaryCta: str(s.hero.primaryCta, 40, d.hero.primaryCta),
      secondaryCta: str(s.hero.secondaryCta, 40, d.hero.secondaryCta),
      reassurance: str(s.hero.reassurance, 140, d.hero.reassurance),
      videoUrl: typeof s.hero.videoUrl === "string" ? s.hero.videoUrl.trim().slice(0, 500) : "",
      videoPoster: typeof s.hero.videoPoster === "string" ? s.hero.videoPoster.trim().slice(0, 500) : "",
      beforeLabel: str(s.hero.beforeLabel, 60, d.hero.beforeLabel),
      afterLabel: str(s.hero.afterLabel, 60, d.hero.afterLabel),
    },
    marquee: (Array.isArray(s.marquee) ? s.marquee : d.marquee)
      .filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 24),
    features: {
      ...s.features,
      title: str(s.features.title, 120, d.features.title),
      items: (Array.isArray(s.features.items) ? s.features.items : d.features.items)
        .filter((i) => i && typeof i.title === "string" && i.title.trim()).slice(0, 12),
    },
    how: {
      ...s.how,
      title: str(s.how.title, 120, d.how.title),
      items: (Array.isArray(s.how.items) ? s.how.items : d.how.items)
        .filter((i) => i && typeof i.title === "string" && i.title.trim()).slice(0, 6),
    },
    faq: {
      ...s.faq,
      title: str(s.faq.title, 120, d.faq.title),
      items: (Array.isArray(s.faq.items) ? s.faq.items : d.faq.items)
        .filter((i) => i && typeof i.q === "string" && i.q.trim() && typeof i.a === "string" && i.a.trim())
        .slice(0, 14),
    },
    cta: {
      title: str(s.cta.title, 120, d.cta.title),
      sub: str(s.cta.sub, 260, d.cta.sub),
      button: str(s.cta.button, 40, d.cta.button),
    },
    bot: {
      ...s.bot,
      name: str(s.bot.name, 30, d.bot.name),
      greeting: str(s.bot.greeting, 300, d.bot.greeting),
      fallback: str(s.bot.fallback, 300, d.bot.fallback),
      aiEnabled: typeof s.bot.aiEnabled === "boolean" ? s.bot.aiEnabled : d.bot.aiEnabled,
    },
  };
}
