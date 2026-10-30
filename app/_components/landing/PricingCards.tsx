import Link from "next/link";
import { Icon } from "../Icon";
import { UpgradeButton } from "../Upgrade";
import { getSettings } from "../../../lib/settings";
import { loadPlans, visiblePlans, type PlanRow } from "../../../lib/tiers";

/**
 * The pricing cards.
 *
 * These used to be two cards written out by hand, with the free plan's tools
 * read from the limits and the paid plan's listed as a fixed array of names.
 * Both are generated from the plans now, so a plan an owner adds in the admin
 * panel appears here with the right tools and the right price, and no card
 * claims a tool its plan does not actually include.
 */

function Row({ children, lit = false }: { children: React.ReactNode; lit?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-relaxed text-paper/80">
      <Icon name="check" size={15} className={`mt-1 shrink-0 ${lit ? "text-lamp" : "text-mint"}`} />
      <span>{children}</span>
    </li>
  );
}

/**
 * What a plan gives you, in words.
 *
 * The tools with the highest daily allowance first, because "300 chat messages
 * a day" sells a plan and "2 citations a day" does not. Capped at six lines so
 * a plan with every tool switched on does not produce a card a screen tall.
 */
function highlights(plan: PlanRow, labels: Record<string, { label: string }>): string[] {
  return Object.entries(plan.limits)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, n]) => `${labels[key]?.label ?? key}, ${n} a day`);
}

export async function PricingCards() {
  const { rules, branding } = await getSettings();
  const plans = visiblePlans(await loadPlans());

  if (!plans.length) {
    return (
      <p className="mx-auto max-w-md text-center text-sm text-muted">
        Plans are being set up. Please check back shortly.
      </p>
    );
  }

  /*
   * The columns follow the number of plans.
   *
   * Four plans in a three-column grid leaves one card stranded on its own
   * row, which reads as a mistake; four across is tight but even. Five or
   * more go back to three columns, because five narrow columns is worse than
   * a second row.
   */
  const n = plans.length;
  const cols =
    n === 1 ? "max-w-md mx-auto"
    : n === 2 ? "sm:grid-cols-2"
    : n === 3 ? "sm:grid-cols-2 lg:grid-cols-3"
    : n === 4 ? "sm:grid-cols-2 xl:grid-cols-4"
    : "sm:grid-cols-2 lg:grid-cols-3";
  const width = n <= 2 ? "max-w-4xl" : n === 3 ? "max-w-6xl" : "max-w-7xl";

  /*
   * One plan is highlighted, and it is the cheapest paid one rather than the
   * most expensive: the card people are meant to land on is the entry paid
   * tier, and highlighting the top one reads as a sales push.
   */
  const featured = plans.find((p) => !p.isDefault && !!p.stripePriceId)?.slug ?? "";

  return (
    // Stretched rather than top-aligned, so cards in a row end level with one
    // another whatever each plan lists.
    <div className={`mx-auto grid ${width} items-stretch gap-5 ${cols}`}>
      {plans.map((p) => {
        const lit = p.slug === featured;
        const rows = highlights(p, rules as unknown as Record<string, { label: string }>);
        const extras = p.features.filter(Boolean);

        return (
          <div
            key={p.slug}
            className={`relative flex flex-col rounded-2xl p-7 ${lit ? "glass-strong" : "glass"}`}
            style={lit ? { borderColor: "rgba(139,108,255,.35)" } : undefined}
          >
            {lit && <div className="lamp-glow -right-10 -top-10 h-40 w-40 bg-violet-500/20" />}
            <div className="relative flex flex-1 flex-col">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl text-paper">{p.name}</h2>
                {lit && <span className="chip chip-brand">Most popular</span>}
              </div>

              {p.blurb && <p className="mt-1 text-sm text-muted">{p.blurb}</p>}

              <p className={`mt-6 font-display text-4xl ${lit ? "text-lamp" : "text-paper"}`}>
                {p.priceLabel || (p.isDefault ? "Free" : "")}
              </p>
              {p.periodLabel && <p className="text-sm text-muted">{p.periodLabel}</p>}

              <ul className="mt-7 flex-1 space-y-3">
                {rows.map((t) => <Row key={t} lit={lit}>{t}</Row>)}
                {extras.map((t) => <Row key={t} lit={lit}>{t}</Row>)}
              </ul>

              <div className="mt-8 pt-1">
                {p.isDefault ? (
                  <Link href="/login?mode=signup&next=/dashboard" className="btn btn-ghost w-full">
                    Create free account
                  </Link>
                ) : p.stripePriceId ? (
                  // The slug, not a price: the server looks the price up, so a
                  // tampered request cannot buy the wrong tier.
                  <UpgradeButton plan={p.slug} label={`Get ${p.name}`} className={`btn w-full ${lit ? "btn-primary" : "btn-ghost"}`} />
                ) : (
                  // A plan with no Stripe price cannot be bought, so the card
                  // asks people to get in touch rather than showing a button
                  // that would fail at checkout.
                  <a href={`mailto:${branding.supportEmail}?subject=${encodeURIComponent(`About the ${p.name} plan`)}`} className="btn btn-ghost w-full">
                    Talk to us
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
