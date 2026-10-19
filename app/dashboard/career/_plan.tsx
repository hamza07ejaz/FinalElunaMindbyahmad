"use client";
import { Icon } from "../../_components/Icon";
import { Panel } from "../../_components/ToolUI";
import { hasPay, type ExplorePlan, type IncomePlan, type Pay, type Plan, type RealityPlan, type RoadmapPlan } from "../../../lib/career";

/* The rendering of a plan, kept out of the page so the page stays about the form. */

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mt-3">
      <p className="mb-0.5 text-xs uppercase tracking-wide text-mute">{label}</p>
      <p className="text-sm text-paper/85">{children}</p>
    </div>
  );
}

function Bullets({ label, items, icon }: { label: string; items: string[]; icon?: "check" | "x" | "spark" }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs uppercase tracking-wide text-mute">{label}</p>
      <ul className="space-y-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-paper/85">
            {icon
              ? <span className={`mt-0.5 shrink-0 ${icon === "x" ? "text-amber-300" : "text-lamp"}`}><Icon name={icon} size={13} /></span>
              : <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-lamp/70" />}
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Pay, with the caveat attached to it rather than printed once at the bottom.
 *
 * A salary range is the figure a student will repeat to their parents, so the
 * "this is an estimate, check it locally" line has to travel with it.
 */
function PayBlock({ pay }: { pay: Pay }) {
  if (!hasPay(pay)) return null;
  const rows = [
    ["Starting", pay.entry],
    ["Experienced", pay.experienced],
    ["Senior", pay.senior],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="mb-2 text-xs uppercase tracking-wide text-mute">
        Pay{pay.region ? ` · ${pay.region}` : ""}
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {rows.map(([k, v]) => (
          <span key={k} className="text-sm"><span className="text-mute">{k} </span><strong className="font-semibold text-paper">{v}</strong></span>
        ))}
      </div>
      <p className="mt-2 flex gap-1.5 text-xs text-mute"><span className="mt-px shrink-0"><Icon name="info" size={12} /></span>{pay.note}</p>
    </div>
  );
}

/** A fit score, shown as a bar so three options can be compared at a glance. */
function Fit({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: "linear-gradient(90deg,#8b5cf6,#f472b6)" }} />
      </div>
      <span className="text-xs text-paper/70">{value}% fit</span>
    </div>
  );
}

function Explore({ plan }: { plan: ExplorePlan }) {
  return (
    <>
      {plan.summary && <Panel className="pop-in"><p className="text-sm text-paper/85">{plan.summary}</p></Panel>}
      {plan.matches.map((m, i) => (
        <Panel key={i} className="pop-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg text-paper">{m.title}</h3>
            <Fit value={m.fit} />
          </div>
          <Line label="Why this fits you">{m.why}</Line>
          <Line label="Day to day">{m.dayToDay}</Line>
          <Bullets label="Skills that matter" items={m.skills} />
          <Bullets label="Ways in" items={m.entryRoutes} icon="check" />
          <Line label="Your first step">{m.firstStep}</Line>
          <PayBlock pay={m.pay} />
          <Line label="Outlook">{m.outlook}</Line>
          {m.watchOut && (
            <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3">
              <p className="mb-0.5 text-xs uppercase tracking-wide text-amber-200/80">Watch out for</p>
              <p className="text-sm text-paper/85">{m.watchOut}</p>
            </div>
          )}
        </Panel>
      ))}
      {plan.questionsToAskYourself.length > 0 && (
        <Panel className="pop-in">
          <h3 className="font-display text-base text-lamp">Questions that would settle it</h3>
          <Bullets label="" items={plan.questionsToAskYourself} />
        </Panel>
      )}
    </>
  );
}

function Roadmap({ plan }: { plan: RoadmapPlan }) {
  return (
    <>
      <Panel className="pop-in">
        <h3 className="font-display text-lg text-paper">{plan.role}</h3>
        {plan.summary && <p className="mt-1 text-sm text-paper/85">{plan.summary}</p>}
        <Bullets label="Before you start" items={plan.prerequisites} icon="check" />
        <PayBlock pay={plan.pay} />
      </Panel>

      {/* The twelve months as a spine, so progress has a shape. */}
      <div className="relative space-y-3 pl-6">
        <span className="absolute bottom-4 left-[0.4rem] top-4 w-px bg-gradient-to-b from-violet-400/60 via-white/15 to-transparent" />
        {plan.phases.map((p, i) => (
          <Panel key={i} className="pop-in relative">
            <span className="absolute -left-[1.42rem] top-6 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-[#0a0a14]" style={{ background: "var(--lamp)" }} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-display text-base text-lamp">{p.window}</h4>
              {p.hoursPerWeek && <span className="chip">{p.hoursPerWeek}</span>}
            </div>
            {p.goal && <p className="mt-1 text-sm text-paper/85">{p.goal}</p>}
            <Bullets label="Learn" items={p.learn} />
            <Line label="Build">{p.build}</Line>
            {p.milestone && (
              <div className="mt-3 flex gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.07] p-3">
                <span className="mt-0.5 shrink-0 text-emerald-300"><Icon name="check" size={14} /></span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-200/80">Done when</p>
                  <p className="text-sm text-paper/85">{p.milestone}</p>
                </div>
              </div>
            )}
          </Panel>
        ))}
      </div>

      {plan.portfolio.length > 0 && (
        <Panel className="pop-in">
          <h3 className="mb-2 font-display text-base text-lamp">What to have built by the end</h3>
          <div className="space-y-2">
            {plan.portfolio.map((p, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-sm font-medium text-paper">{p.project}</p>
                <p className="mt-0.5 text-sm text-muted">{p.proves}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {plan.resources.length > 0 && (
        <Panel className="pop-in">
          <h3 className="font-display text-base text-lamp">Where to learn it</h3>
          <p className="mb-2 text-xs text-mute">Search these rather than following a link — course URLs change, and a dead link is worse than none.</p>
          <div className="space-y-1.5">
            {plan.resources.map((r, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={`chip ${r.cost === "free" ? "chip-ok" : ""}`}>{r.cost}</span>
                <span className="text-paper">{r.provider}</span>
                <span className="text-paper/80">{r.what}</span>
                {r.searchFor && <span className="text-mute">— search &ldquo;{r.searchFor}&rdquo;</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {plan.firstJobs.length > 0 && (
        <Panel className="pop-in">
          <h3 className="mb-2 font-display text-base text-lamp">Jobs to aim at first</h3>
          <div className="space-y-2">
            {plan.firstJobs.map((j, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-paper">{j.title}</p>
                <p className="text-sm text-muted">{j.whatTheyWant}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="pop-in">
        <Bullets label="Mistakes that waste the most time" items={plan.mistakes} icon="x" />
        <Bullets label="Signs it is working" items={plan.signsOfProgress} icon="check" />
      </Panel>
    </>
  );
}

function Reality({ plan }: { plan: RealityPlan }) {
  return (
    <>
      <Panel className="pop-in">
        <h3 className="font-display text-lg text-paper">{plan.role}</h3>
        <p className="mt-1 text-sm text-paper/85">{plan.honestSummary}</p>
        <PayBlock pay={plan.pay} />
      </Panel>

      {plan.typicalDay.length > 0 && (
        <Panel className="pop-in">
          <h3 className="mb-3 font-display text-base text-lamp">A typical day</h3>
          <div className="space-y-2.5">
            {plan.typicalDay.map((d, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-16 shrink-0 text-right text-xs text-lamp/90">{d.when}</span>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lamp/60" />
                <span className="text-sm text-paper/85">{d.what}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {plan.thrivesHere && (
          <Panel className="pop-in">
            <p className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-emerald-200/80"><Icon name="check" size={12} /> Thrives here</p>
            <p className="text-sm text-paper/85">{plan.thrivesHere}</p>
          </Panel>
        )}
        {plan.strugglesHere && (
          <Panel className="pop-in">
            <p className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-amber-200/80"><Icon name="x" size={12} /> Struggles here</p>
            <p className="text-sm text-paper/85">{plan.strugglesHere}</p>
          </Panel>
        )}
      </div>

      <Panel className="pop-in">
        <Line label="Demand">{plan.demand}</Line>
        <Line label="Hours and stress">{plan.hoursAndStress}</Line>
        <Bullets label="The downsides" items={plan.downsides} icon="x" />
        <Bullets label="Where people go when they leave" items={plan.exitPaths} />
      </Panel>

      {plan.testItCheaply.length > 0 && (
        <Panel className="pop-in">
          <h3 className="font-display text-base text-lamp">Try it before you commit years</h3>
          <Bullets label="" items={plan.testItCheaply} icon="spark" />
        </Panel>
      )}
    </>
  );
}

function Income({ plan }: { plan: IncomePlan }) {
  return (
    <>
      {plan.summary && <Panel className="pop-in"><p className="text-sm text-paper/85">{plan.summary}</p></Panel>}
      {plan.ideas.map((idea, i) => (
        <Panel key={i} className="pop-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg text-paper">{idea.name}</h3>
            <div className="flex gap-1.5">
              {idea.weeklyHours && <span className="chip">{idea.weeklyHours}</span>}
              {idea.startupCost && <span className="chip">{idea.startupCost}</span>}
            </div>
          </div>
          <Line label="Why it fits you">{idea.fitsBecause}</Line>
          {idea.firstClient && (
            <div className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.07] p-3">
              <p className="mb-0.5 text-xs uppercase tracking-wide text-lamp">Getting the first customer</p>
              <p className="text-sm text-paper/85">{idea.firstClient}</p>
            </div>
          )}
          {(idea.earnings.firstMonths || idea.earnings.later) && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-mute">
                Realistic earnings{idea.earnings.region ? ` · ${idea.earnings.region}` : ""}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {idea.earnings.firstMonths && <span className="text-sm"><span className="text-mute">First months </span><strong className="font-semibold text-paper">{idea.earnings.firstMonths}</strong></span>}
                {idea.earnings.later && <span className="text-sm"><span className="text-mute">After a year </span><strong className="font-semibold text-paper">{idea.earnings.later}</strong></span>}
              </div>
              <p className="mt-2 flex gap-1.5 text-xs text-mute"><span className="mt-px shrink-0"><Icon name="info" size={12} /></span>{idea.earnings.note}</p>
            </div>
          )}
          <Bullets label="Skills needed" items={idea.skillsNeeded} />
          <Bullets label="What goes wrong" items={idea.risks} icon="x" />
          <Line label="Growing it">{idea.growth}</Line>
        </Panel>
      ))}
      {plan.beforeYouStart.length > 0 && (
        <Panel className="pop-in">
          <h3 className="font-display text-base text-lamp">Sort these out first</h3>
          <Bullets label="" items={plan.beforeYouStart} icon="check" />
        </Panel>
      )}
    </>
  );
}

export function PlanView({ plan }: { plan: Plan }) {
  if (plan.kind === "explore") return <Explore plan={plan} />;
  if (plan.kind === "roadmap") return <Roadmap plan={plan} />;
  if (plan.kind === "reality") return <Reality plan={plan} />;
  return <Income plan={plan} />;
}
