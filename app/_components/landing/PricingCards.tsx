import Link from "next/link";
import { Icon } from "../Icon";
import { UpgradeButton } from "../Upgrade";
import { getSettings } from "../../../lib/settings";

const PREMIUM_TOOL_NAMES = ["Flashcards", "Mock tests with scoring", "Interactive mind maps", "Slide builder with PowerPoint export", "Grammar fixer", "Paraphraser", "Citation maker"];

function Row({ children, lit = false }: { children: React.ReactNode; lit?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-relaxed text-paper/80">
      <Icon name="check" size={15} className={`mt-1 shrink-0 ${lit ? "text-lamp" : "text-mint"}`} />
      <span>{children}</span>
    </li>
  );
}

export async function PricingCards() {
  const { rules: r, pricing } = await getSettings();
  const freeRows = (["chat", "notes", "qna", "studyPlan", "career"] as const)
    .filter((k) => !r[k].premiumOnly && r[k].freePerDay > 0)
    .map((k) => `${r[k].label}, ${r[k].freePerDay} a day`);

  return (
    <div className="mx-auto grid max-w-4xl items-start gap-5 md:grid-cols-2">
      <div className="glass rounded-2xl p-7">
        <h2 className="font-display text-xl text-paper">{pricing.freeName}</h2>
        <p className="mt-1 text-sm text-muted">Enough to study with every day.</p>
        <p className="mt-6 font-display text-4xl text-paper">$0</p>
        <p className="text-sm text-muted">forever</p>
        <ul className="mt-7 space-y-3">
          {freeRows.map((t) => <Row key={t}>{t}</Row>)}
        </ul>
        <Link href="/login?mode=signup&next=/dashboard" className="btn btn-ghost mt-8 w-full">Create free account</Link>
      </div>

      <div className="glass-strong relative rounded-2xl p-7" style={{ borderColor: "rgba(139,108,255,.35)" }}>
        <div className="lamp-glow -right-10 -top-10 h-40 w-40 bg-violet-500/20" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-paper">{pricing.premiumName}</h2>
            <span className="chip chip-brand">Everything unlocked</span>
          </div>
          <p className="mt-1 text-sm text-muted">{pricing.premiumBlurb}</p>
          <p className="mt-6 font-display text-4xl text-lamp">{pricing.premiumPrice}</p>
          <p className="text-sm text-muted">{pricing.premiumPeriod}</p>
          <ul className="mt-7 space-y-3">
            <Row lit>Up to {r.chat.premiumPerDay} chat messages and {r.notes.premiumPerDay} notes a day</Row>
            {PREMIUM_TOOL_NAMES.map((t) => <Row key={t} lit>{t}</Row>)}
            {pricing.premiumFeatures.filter(Boolean).map((t) => <Row key={t} lit>{t}</Row>)}
          </ul>
          <div className="mt-8"><UpgradeButton label={`Get ${pricing.premiumName}`} className="btn btn-primary w-full" /></div>
        </div>
      </div>
    </div>
  );
}
