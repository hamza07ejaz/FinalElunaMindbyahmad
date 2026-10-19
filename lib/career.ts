/**
 * Career guidance: the shapes, the prompts, and the code that makes a model's
 * JSON safe to render.
 *
 * Two decisions shape this file.
 *
 * The first is that the output is structured data, not markdown. The old version
 * asked for prose and then split it on a regex, which meant the page looked
 * different every run and a missing heading became a missing section. A model
 * returning fields the page can lay out is the difference between a tool and a
 * wall of text.
 *
 * The second is that nothing is invented quietly. A model asked for "resources"
 * will produce real-looking course URLs that 404, and salary figures with no
 * region or date attached. So URLs are forbidden outright — a provider name and
 * a search term is honest and still useful — and every money figure has to carry
 * where it applies and the warning that it is an estimate from training data.
 */

export type Mode = "explore" | "roadmap" | "reality" | "income" | "followup";

export const MODES: Mode[] = ["explore", "roadmap", "reality", "income", "followup"];

/* ------------------------------------------------------------------ */
/* What the student is asked                                           */
/* ------------------------------------------------------------------ */

export const EXPLORE_QUESTIONS: { id: string; q: string; options: string[] }[] = [
  { id: "enjoy", q: "Which of these would you happily do for a whole afternoon?", options: ["Work out why something broke", "Make or design something", "Teach or help someone one to one", "Organise people and plans", "Find the story in a pile of data", "Persuade someone to say yes"] },
  { id: "people", q: "How much do you want other people in your working day?", options: ["Almost none — deep focus", "A small steady team", "Lots of different people daily"] },
  { id: "values", q: "What would make you turn down a better-paid job?", options: ["Nothing — pay comes first", "If it were unstable", "If it had no creative freedom", "If the work did no good", "If it had fixed hours and no flexibility"] },
  { id: "study", q: "How much more studying are you willing to do?", options: ["None — I want to start earning", "A short course or certificate", "A full degree", "A degree and then a postgrad"] },
  { id: "stage", q: "Where are you now?", options: ["Still at school", "At college or university", "Graduated, looking", "Already working, thinking of switching"] },
  { id: "risk", q: "Which first job sounds better?", options: ["Big company, clear ladder, safe", "Small company, messy, learn fast", "Work for myself as soon as I can"] },
  { id: "strength", q: "What do people actually come to you for?", options: ["Explaining things clearly", "Fixing what others gave up on", "Ideas and taste", "Keeping everyone on track", "Numbers and detail", "Calm in a crisis"] },
];

export const INCOME_QUESTIONS: { id: string; q: string; options: string[] }[] = [
  { id: "hours", q: "Hours a week you can genuinely give this?", options: ["Under 5", "5 to 10", "10 to 20", "20 or more"] },
  { id: "budget", q: "What can you spend to get started?", options: ["Nothing at all", "Under $50", "Under $200", "More than $200"] },
  { id: "where", q: "Online, or where you live?", options: ["Online only", "Locally, in person", "Either"] },
  { id: "speed", q: "What matters more right now?", options: ["Money this month", "Something that grows over a year"] },
];

/* ------------------------------------------------------------------ */
/* The prompts                                                         */
/* ------------------------------------------------------------------ */

const HONESTY = `Rules you must follow:
- Return ONLY valid JSON matching the shape given. No markdown fence, no commentary before or after.
- NEVER output a URL or a link. For anything a student should look up, give the provider's name and the exact phrase to search for. A made-up link that 404s destroys their trust in everything else you said.
- Every pay figure must name the region it applies to and go in the field provided for it. Give ranges, never a single number.
- Do not invent statistics, rankings, percentages or study findings. If you do not know a figure, describe the direction instead ("demand has been growing", not "demand grew 34%").
- Where something is genuinely uncertain or depends on the country, say so in plain words inside the relevant field.
- Write for an 18-year-old who is smart but has no industry contacts. No corporate filler. Short sentences.
- Be honest about downsides. A guide that only sells the job is useless to someone deciding their life around it.`;

const SALARY_NOTE = "Say which country or region the figures are for, and add that they are rough bands from training data that the student should check against a current local source before relying on them.";

export function promptFor(mode: Mode, input: { role?: string; answers?: Record<string, string>; skills?: string; region?: string }): string {
  const region = input.region?.trim() || "the United States and the United Kingdom";
  const answers = JSON.stringify(input.answers ?? {}, null, 1);

  if (mode === "explore") {
    return `A student answered these questions about themselves:
${answers}

Suggest exactly three careers that genuinely fit those answers — not the three most popular careers. At least one should be something they are unlikely to have considered. Pay attention to what they said about studying, people and risk: do not suggest a path that needs a postgrad degree to someone who said they want to start earning now.

Region for pay figures: ${region}.
${SALARY_NOTE}

JSON shape:
{
  "summary": "two or three sentences on what their answers suggest about how they like to work — concrete, not flattery",
  "matches": [
    {
      "title": "job title",
      "fit": 0-100,
      "why": "why THEIR answers point here, quoting the answers back",
      "dayToDay": "what the work actually is, hour to hour",
      "skills": ["the 4-6 skills that matter most"],
      "entryRoutes": ["each realistic way in, including the ones that skip a degree"],
      "firstStep": "one specific thing to do in the next 30 days to find out if they like it",
      "pay": { "entry": "range", "experienced": "range", "region": "where these apply", "note": "${"the estimate caveat"}" },
      "outlook": "how demand is moving and why",
      "watchOut": "the honest downside — what makes people leave this job"
    }
  ],
  "questionsToAskYourself": ["3-4 questions that would settle which of the three is right"]
}

${HONESTY}`;
  }

  if (mode === "roadmap") {
    return `Build a twelve-month plan for someone who wants to become a ${input.role}, starting from no experience.

It must be specific enough to follow on a Monday morning. Name real platforms and real course titles to search for, never URLs. Each phase needs a milestone that proves the phase is done — something they can show someone, not "understand the basics".

Region for pay figures: ${region}.
${SALARY_NOTE}

JSON shape:
{
  "role": "${input.role}",
  "summary": "two sentences on what this plan gets them to in a year — be realistic, a year does not make a senior",
  "prerequisites": ["what they need before month one, or an empty list"],
  "phases": [
    {
      "window": "Months 1-3",
      "goal": "the one thing this phase is for",
      "learn": ["specific topics, in order"],
      "build": "the thing they make in this phase",
      "milestone": "the provable outcome",
      "hoursPerWeek": "realistic hours"
    }
  ],
  "portfolio": [{ "project": "what to build", "proves": "what a hiring manager learns from it" }],
  "resources": [{ "provider": "platform or publisher name", "what": "course, book or channel name", "cost": "free or paid", "searchFor": "exact search phrase" }],
  "firstJobs": [{ "title": "entry title", "whatTheyWant": "what the posting will ask for" }],
  "pay": { "entry": "range", "experienced": "range", "region": "where these apply", "note": "the estimate caveat" },
  "mistakes": ["the 4-5 mistakes that waste the most time on this path"],
  "signsOfProgress": ["how to tell at month 3, 6 and 12 that it is working"]
}

Use four phases covering months 1-3, 4-6, 7-9 and 10-12.

${HONESTY}`;
  }

  if (mode === "reality") {
    return `Give an honest, unglamorous picture of working as a ${input.role}. The student is deciding whether to spend years on this. Tell them what a friend already in the job would tell them over coffee, including the parts a careers website leaves out.

Region for pay figures: ${region}.
${SALARY_NOTE}

JSON shape:
{
  "role": "${input.role}",
  "honestSummary": "three or four sentences. Lead with the thing people get wrong about this job.",
  "typicalDay": [{ "when": "e.g. 9am", "what": "what they are actually doing" }],
  "thrivesHere": "the kind of person who loves this work",
  "strugglesHere": "the kind of person who burns out in it",
  "pay": { "entry": "range", "experienced": "range", "senior": "range", "region": "where these apply", "note": "the estimate caveat" },
  "demand": "how easy it is to get hired now, and what is changing",
  "hoursAndStress": "real hours, busy periods, how the pressure shows up",
  "downsides": ["4-5 honest negatives, specific to this job"],
  "exitPaths": ["where people go when they leave, which is worth knowing before starting"],
  "testItCheaply": ["3-4 ways to sample this job in a week or two before committing years"]
}

Use six to eight entries for the typical day.

${HONESTY}`;
  }

  // income
  return `A student wants to earn alongside studying. Their answers:
${answers}
Skills they already have: ${input.skills || "not stated"}

Suggest three ways to earn that fit those constraints honestly. No dropshipping-get-rich framing, no crypto, no "passive income" that is not passive. If their budget is nothing, every idea must be startable with nothing. Earnings must be what a beginner actually makes, not a best case.

Region for pay figures: ${region}.
${SALARY_NOTE}

JSON shape:
{
  "summary": "two sentences on what their constraints realistically allow",
  "ideas": [
    {
      "name": "what it is",
      "fitsBecause": "which of their answers this matches",
      "firstClient": "exactly how to get the first paying customer — the first message to send, the first place to post",
      "weeklyHours": "realistic",
      "startupCost": "what it costs to begin, in their stated budget",
      "earnings": { "firstMonths": "range in the first three months", "later": "range after a year of consistency", "region": "where these apply", "note": "the estimate caveat" },
      "skillsNeeded": ["what they must be able to do"],
      "risks": ["what goes wrong, including the time cost of learning it"],
      "growth": "how this becomes bigger than pocket money, or say plainly that it does not"
    }
  ],
  "beforeYouStart": ["3-4 things to sort out first — tax, time, agreeing hours with family, saying no to bad clients"]
}

${HONESTY}`;
}

/* ------------------------------------------------------------------ */
/* Making the model's JSON safe to render                              */
/* ------------------------------------------------------------------ */

const str = (v: unknown, max = 1200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max = 12, each = 400): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, each)).filter(Boolean).slice(0, max) : [];
const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

export type Pay = { entry: string; experienced: string; senior: string; region: string; note: string };

const CAVEAT = "Rough bands only — check a current local source such as a national statistics office or a live job board before relying on these.";

function pay(v: unknown): Pay {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    entry: str(o.entry, 120),
    experienced: str(o.experienced ?? o.mid, 120),
    senior: str(o.senior, 120),
    region: str(o.region, 160),
    // The caveat is ours, not the model's: it must be there whether or not the
    // model remembered to write one.
    note: str(o.note, 400) || CAVEAT,
  };
}

/** True when a pay block has anything worth showing. */
export const hasPay = (p: Pay) => !!(p.entry || p.experienced || p.senior);

export type ExplorePlan = {
  kind: "explore";
  summary: string;
  matches: {
    title: string; fit: number; why: string; dayToDay: string; skills: string[];
    entryRoutes: string[]; firstStep: string; pay: Pay; outlook: string; watchOut: string;
  }[];
  questionsToAskYourself: string[];
};

export type RoadmapPlan = {
  kind: "roadmap";
  role: string; summary: string; prerequisites: string[];
  phases: { window: string; goal: string; learn: string[]; build: string; milestone: string; hoursPerWeek: string }[];
  portfolio: { project: string; proves: string }[];
  resources: { provider: string; what: string; cost: string; searchFor: string }[];
  firstJobs: { title: string; whatTheyWant: string }[];
  pay: Pay; mistakes: string[]; signsOfProgress: string[];
};

export type RealityPlan = {
  kind: "reality";
  role: string; honestSummary: string;
  typicalDay: { when: string; what: string }[];
  thrivesHere: string; strugglesHere: string; pay: Pay;
  demand: string; hoursAndStress: string;
  downsides: string[]; exitPaths: string[]; testItCheaply: string[];
};

export type IncomePlan = {
  kind: "income";
  summary: string;
  ideas: {
    name: string; fitsBecause: string; firstClient: string; weeklyHours: string; startupCost: string;
    earnings: { firstMonths: string; later: string; region: string; note: string };
    skillsNeeded: string[]; risks: string[]; growth: string;
  }[];
  beforeYouStart: string[];
};

export type Plan = ExplorePlan | RoadmapPlan | RealityPlan | IncomePlan;

/** Thrown when the model returned something with no usable content in it. */
export class UnusablePlanError extends Error {
  constructor(mode: Mode) {
    super(`The ${mode} answer came back empty or malformed.`);
  }
}

/**
 * Coerce whatever came back into the shape the page renders.
 *
 * Every field is defaulted, so a model that drops one produces a page with a
 * gap rather than a crash. The one thing that is not tolerated is an answer
 * with no substance at all — that is worth a retry, not a blank page.
 */
export function normalise(mode: Mode, raw: unknown): Plan {
  const o = (raw ?? {}) as Record<string, any>;

  if (mode === "explore") {
    const matches = (Array.isArray(o.matches) ? o.matches : []).slice(0, 4).map((m: any) => ({
      title: str(m?.title, 120),
      fit: num(m?.fit ?? m?.fitScore, 0, 100, 70),
      why: str(m?.why),
      dayToDay: str(m?.dayToDay ?? m?.day_to_day),
      skills: list(m?.skills, 8, 120),
      entryRoutes: list(m?.entryRoutes ?? m?.entry_routes, 6, 240),
      firstStep: str(m?.firstStep ?? m?.first_step),
      pay: pay(m?.pay ?? m?.salaryBand ?? m?.salary),
      outlook: str(m?.outlook),
      watchOut: str(m?.watchOut ?? m?.watch_out),
    })).filter((m: { title: string }) => m.title);

    if (!matches.length) throw new UnusablePlanError(mode);
    return {
      kind: "explore",
      summary: str(o.summary),
      matches,
      questionsToAskYourself: list(o.questionsToAskYourself ?? o.questions, 6, 300),
    };
  }

  if (mode === "roadmap") {
    const phases = (Array.isArray(o.phases) ? o.phases : []).slice(0, 6).map((p: any) => ({
      window: str(p?.window ?? p?.months, 60),
      goal: str(p?.goal, 400),
      learn: list(p?.learn, 10, 200),
      build: str(p?.build, 500),
      milestone: str(p?.milestone, 400),
      hoursPerWeek: str(p?.hoursPerWeek ?? p?.hours, 60),
    })).filter((p: { window: string; goal: string }) => p.window || p.goal);

    if (!phases.length) throw new UnusablePlanError(mode);
    return {
      kind: "roadmap",
      role: str(o.role, 120),
      summary: str(o.summary),
      prerequisites: list(o.prerequisites, 8, 240),
      phases,
      portfolio: (Array.isArray(o.portfolio) ? o.portfolio : []).slice(0, 8)
        .map((p: any) => ({ project: str(p?.project, 200), proves: str(p?.proves ?? p?.whatItProves, 300) }))
        .filter((p: { project: string }) => p.project),
      resources: (Array.isArray(o.resources) ? o.resources : []).slice(0, 12)
        .map((r: any) => ({
          provider: str(r?.provider, 80), what: str(r?.what, 200),
          cost: /paid|\$|fee/i.test(str(r?.cost, 40)) ? "paid" : "free",
          // A model told not to give links sometimes gives one anyway.
          searchFor: str(r?.searchFor ?? r?.search, 200).replace(/https?:\/\/\S+/g, "").trim(),
        }))
        .filter((r: { provider: string; what: string }) => r.provider || r.what),
      firstJobs: (Array.isArray(o.firstJobs) ? o.firstJobs : []).slice(0, 8)
        .map((j: any) => ({ title: str(j?.title, 120), whatTheyWant: str(j?.whatTheyWant ?? j?.wants, 400) }))
        .filter((j: { title: string }) => j.title),
      pay: pay(o.pay ?? o.salaryBand),
      mistakes: list(o.mistakes, 8, 300),
      signsOfProgress: list(o.signsOfProgress ?? o.progress, 8, 300),
    };
  }

  if (mode === "reality") {
    const summary = str(o.honestSummary ?? o.summary);
    const day = (Array.isArray(o.typicalDay) ? o.typicalDay : []).slice(0, 12)
      .map((d: any) => ({ when: str(d?.when ?? d?.time, 40), what: str(d?.what ?? d?.activity, 400) }))
      .filter((d: { what: string }) => d.what);

    if (!summary && !day.length) throw new UnusablePlanError(mode);
    return {
      kind: "reality",
      role: str(o.role, 120),
      honestSummary: summary,
      typicalDay: day,
      thrivesHere: str(o.thrivesHere ?? o.lovedBy),
      strugglesHere: str(o.strugglesHere ?? o.hatedBy),
      pay: pay(o.pay ?? o.salaryBand),
      demand: str(o.demand),
      hoursAndStress: str(o.hoursAndStress ?? o.hours),
      downsides: list(o.downsides, 8, 300),
      exitPaths: list(o.exitPaths, 8, 240),
      testItCheaply: list(o.testItCheaply ?? o.howToTestItCheaply, 6, 300),
    };
  }

  const ideas = (Array.isArray(o.ideas) ? o.ideas : []).slice(0, 4).map((i: any) => ({
    name: str(i?.name, 120),
    fitsBecause: str(i?.fitsBecause ?? i?.why),
    firstClient: str(i?.firstClient, 600),
    weeklyHours: str(i?.weeklyHours ?? i?.hours, 60),
    startupCost: str(i?.startupCost ?? i?.cost, 120),
    earnings: {
      firstMonths: str(i?.earnings?.firstMonths, 120),
      later: str(i?.earnings?.later, 120),
      region: str(i?.earnings?.region, 160),
      note: str(i?.earnings?.note, 400) || CAVEAT,
    },
    skillsNeeded: list(i?.skillsNeeded ?? i?.skills, 8, 120),
    risks: list(i?.risks, 6, 300),
    growth: str(i?.growth),
  })).filter((i: { name: string }) => i.name);

  if (!ideas.length) throw new UnusablePlanError("income");
  return {
    kind: "income",
    summary: str(o.summary),
    ideas,
    beforeYouStart: list(o.beforeYouStart, 6, 300),
  };
}

/** A short title for the saved-plans list. */
export function planTitle(mode: Mode, plan: Plan, role: string): string {
  if (plan.kind === "explore") return `Paths that fit me — ${plan.matches.map((m) => m.title).slice(0, 2).join(", ")}`;
  if (plan.kind === "roadmap") return `12-month plan — ${plan.role || role}`;
  if (plan.kind === "reality") return `The truth about — ${plan.role || role}`;
  return `Side income — ${plan.ideas.map((i) => i.name).slice(0, 2).join(", ")}`;
}

/** Flatten a plan into text, for copying, exporting and feeding a follow-up question. */
export function planToText(plan: Plan): string {
  const L: string[] = [];
  const section = (h: string, body?: string) => { if (body) L.push(`## ${h}\n${body}`); };
  const bullets = (h: string, items: string[]) => { if (items.length) L.push(`## ${h}\n${items.map((i) => `- ${i}`).join("\n")}`); };
  const money = (p: Pay) => [p.entry && `Entry: ${p.entry}`, p.experienced && `Experienced: ${p.experienced}`, p.senior && `Senior: ${p.senior}`, p.region && `(${p.region})`].filter(Boolean).join(" · ");

  if (plan.kind === "explore") {
    section("What your answers suggest", plan.summary);
    for (const m of plan.matches) {
      L.push(`## ${m.title} — ${m.fit}% fit`);
      section("Why this fits you", m.why);
      section("Day to day", m.dayToDay);
      bullets("Skills that matter", m.skills);
      bullets("Ways in", m.entryRoutes);
      section("First step", m.firstStep);
      if (hasPay(m.pay)) section("Pay", `${money(m.pay)}\n\n_${m.pay.note}_`);
      section("Outlook", m.outlook);
      section("Watch out for", m.watchOut);
    }
    bullets("Questions to ask yourself", plan.questionsToAskYourself);
  } else if (plan.kind === "roadmap") {
    L.push(`# 12-month plan — ${plan.role}`);
    section("What this gets you to", plan.summary);
    bullets("Before you start", plan.prerequisites);
    for (const p of plan.phases) {
      L.push(`## ${p.window}${p.hoursPerWeek ? ` — ${p.hoursPerWeek}` : ""}`);
      section("Goal", p.goal);
      bullets("Learn", p.learn);
      section("Build", p.build);
      section("Milestone", p.milestone);
    }
    bullets("Portfolio", plan.portfolio.map((p) => `${p.project} — ${p.proves}`));
    bullets("Where to learn it", plan.resources.map((r) => `${r.provider}: ${r.what} (${r.cost}) — search "${r.searchFor}"`));
    bullets("First jobs to aim at", plan.firstJobs.map((j) => `${j.title} — ${j.whatTheyWant}`));
    if (hasPay(plan.pay)) section("Pay", `${money(plan.pay)}\n\n_${plan.pay.note}_`);
    bullets("Mistakes to avoid", plan.mistakes);
    bullets("Signs it is working", plan.signsOfProgress);
  } else if (plan.kind === "reality") {
    L.push(`# The truth about being a ${plan.role}`);
    section("Honestly", plan.honestSummary);
    bullets("A typical day", plan.typicalDay.map((d) => `${d.when} — ${d.what}`));
    section("Who thrives here", plan.thrivesHere);
    section("Who struggles here", plan.strugglesHere);
    if (hasPay(plan.pay)) section("Pay", `${money(plan.pay)}\n\n_${plan.pay.note}_`);
    section("Demand", plan.demand);
    section("Hours and stress", plan.hoursAndStress);
    bullets("Downsides", plan.downsides);
    bullets("Where people go next", plan.exitPaths);
    bullets("How to test it cheaply", plan.testItCheaply);
  } else {
    section("What your situation allows", plan.summary);
    for (const i of plan.ideas) {
      L.push(`## ${i.name}`);
      section("Why it fits you", i.fitsBecause);
      section("Getting the first customer", i.firstClient);
      section("Time and cost", [i.weeklyHours, i.startupCost].filter(Boolean).join(" · "));
      if (i.earnings.firstMonths || i.earnings.later)
        section("Realistic earnings", `First months: ${i.earnings.firstMonths}\nAfter a year: ${i.earnings.later}\n\n_${i.earnings.note}_`);
      bullets("Skills needed", i.skillsNeeded);
      bullets("Risks", i.risks);
      section("Growing it", i.growth);
    }
    bullets("Before you start", plan.beforeYouStart);
  }

  return L.join("\n\n");
}
