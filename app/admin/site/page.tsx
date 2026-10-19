"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Field, Loading, Page, useToast } from "../ui";
import type { SiteContent } from "../../../lib/content";

/**
 * The landing page, in a form.
 *
 * Everything written on the public site is here, in the order a visitor meets
 * it, so an admin edits the page top to bottom rather than hunting for fields.
 */

type Tab = "hero" | "sections" | "copy" | "bot";

const TABS: { v: Tab; l: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { v: "hero", l: "Hero", icon: "spark" },
  { v: "sections", l: "Sections", icon: "home" },
  { v: "copy", l: "Lists", icon: "notes" },
  { v: "bot", l: "Chat bubble", icon: "chat" },
];

function Toggle({ on, onChange, label, hint }:
  { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-paper">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-lamp" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

/** A plain list of strings, edited one line at a time. */
function LineList({ value, onChange, placeholder, max = 24 }:
  { value: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number }) {
  return (
    <div className="space-y-2">
      {value.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className="input !py-2 !text-sm" value={line}
            onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))} />
          <button type="button" aria-label="Remove line" onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-red-500/20 hover:text-red-300">
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...value, ""])}>
          <Icon name="plus" size={14} /> {placeholder}
        </button>
      )}
    </div>
  );
}

export default function SiteContentPage() {
  const { toast, toastNode } = useToast();
  const [s, setS] = useState<SiteContent | null>(null);
  const [defaults, setDefaults] = useState<SiteContent | null>(null);
  const [tab, setTab] = useState<Tab>("hero");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.settings) { setS(j.settings.site); setDefaults(j.defaults.site); } })
      .catch(() => { /* the empty state covers it */ });
    return () => { alive = false; };
  }, []);

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "site", value: s }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "That did not save.", true); return; }
      // The server re-validates and may have filled an emptied field back in,
      // so the form shows what was actually stored, not what was typed.
      if (j.settings?.site) setS(j.settings.site);
      toast("The site is updated. Reload the home page to see it.");
    } catch { toast("Network problem. Nothing was saved.", true); }
    finally { setSaving(false); }
  }

  if (!s || !defaults) return <Page title="Website"><Loading rows={5} /></Page>;

  const set = <K extends keyof SiteContent>(k: K, v: SiteContent[K]) => setS({ ...s, [k]: v });

  return (
    <Page
      title="Website"
      sub="Every word on the public site. Changes go live as soon as you save."
      actions={
        <div className="flex gap-2">
          <a href="/" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            <Icon name="eye" size={14} /> View site
          </a>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
            {saving ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save</>}
          </button>
        </div>
      }
    >
      {toastNode}

      <div className="mb-5 inline-flex flex-wrap rounded-xl bg-white/[0.06] p-1">
        {TABS.map((t) => (
          <button key={t.v} type="button" onClick={() => setTab(t.v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
              tab === t.v ? "bg-white/10 text-paper" : "text-muted hover:text-paper"}`}>
            <Icon name={t.icon} size={14} /> {t.l}
          </button>
        ))}
      </div>

      {/* ---------------- hero ---------------- */}
      {tab === "hero" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 font-display text-base text-paper">The first screen</h2>
            <div className="space-y-4">
              <Field label="Small line above the headline" hint={`${s.hero.eyebrow.length}/90`}>
                <input className="input" maxLength={90} value={s.hero.eyebrow}
                  onChange={(e) => set("hero", { ...s.hero, eyebrow: e.target.value })} />
              </Field>
              <Field label="Headline" hint={`${s.hero.headline.length}/140`}>
                <textarea className="input !min-h-20" maxLength={140} value={s.hero.headline}
                  onChange={(e) => set("hero", { ...s.hero, headline: e.target.value })} />
              </Field>
              <Field label="Which words glow" hint="Must appear in the headline exactly">
                <input className="input" maxLength={60} value={s.hero.accent}
                  onChange={(e) => set("hero", { ...s.hero, accent: e.target.value })} />
                {s.hero.accent && !s.hero.headline.includes(s.hero.accent) && (
                  <p className="mt-1.5 text-xs text-red-300">
                    Those words are not in the headline, so nothing will glow.
                  </p>
                )}
              </Field>
              <Field label="Paragraph under the headline" hint={`${s.hero.subline.length}/400`}>
                <textarea className="input !min-h-28" maxLength={400} value={s.hero.subline}
                  onChange={(e) => set("hero", { ...s.hero, subline: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Main button"><input className="input" maxLength={40} value={s.hero.primaryCta}
                  onChange={(e) => set("hero", { ...s.hero, primaryCta: e.target.value })} /></Field>
                <Field label="Second button"><input className="input" maxLength={40} value={s.hero.secondaryCta}
                  onChange={(e) => set("hero", { ...s.hero, secondaryCta: e.target.value })} /></Field>
              </div>
              <Field label="Reassurance under the buttons">
                <input className="input" maxLength={140} value={s.hero.reassurance}
                  onChange={(e) => set("hero", { ...s.hero, reassurance: e.target.value })} />
              </Field>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <h2 className="mb-2 font-display text-base text-paper">Hero video</h2>
              <p className="mb-4 text-xs text-muted">
                Leave this empty and the hero shows the built-in animation — a page of raw material on the left
                turning into notes, a mind map and a test on the right. Paste a video URL and it replaces that.
              </p>
              <div className="space-y-4">
                <Field label="Video URL" hint="mp4 or webm, hosted anywhere">
                  <input className="input" type="url" placeholder="https://…/hero.mp4" value={s.hero.videoUrl}
                    onChange={(e) => set("hero", { ...s.hero, videoUrl: e.target.value })} />
                </Field>
                <Field label="Poster image URL" hint="shown while it loads">
                  <input className="input" type="url" placeholder="https://…/hero.jpg" value={s.hero.videoPoster}
                    onChange={(e) => set("hero", { ...s.hero, videoPoster: e.target.value })} />
                </Field>
                {s.hero.videoUrl && (
                  <p className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-3 text-xs text-lampsoft">
                    Keep it under about 4 MB and silent. It is the first thing that loads, so a heavy file makes the
                    page feel slow on a phone.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-base text-paper">Labels on the animation</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Left side"><input className="input" maxLength={60} value={s.hero.beforeLabel}
                  onChange={(e) => set("hero", { ...s.hero, beforeLabel: e.target.value })} /></Field>
                <Field label="Right side"><input className="input" maxLength={60} value={s.hero.afterLabel}
                  onChange={(e) => set("hero", { ...s.hero, afterLabel: e.target.value })} /></Field>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------- sections ---------------- */}
      {tab === "sections" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="mb-1 font-display text-base text-paper">What appears</h2>
            <p className="mb-3 text-xs text-muted">Hiding a section keeps everything written in it.</p>
            <Toggle on={s.show.marquee} onChange={(v) => set("show", { ...s.show, marquee: v })}
              label="Scrolling strip" hint="The moving list under the hero" />
            <Toggle on={s.show.proof} onChange={(v) => set("show", { ...s.show, proof: v })}
              label="What it reads" hint="The file types it accepts" />
            <Toggle on={s.show.features} onChange={(v) => set("show", { ...s.show, features: v })} label="Features" />
            <Toggle on={s.show.how} onChange={(v) => set("show", { ...s.show, how: v })} label="How it works" />
            <Toggle on={s.show.pricing} onChange={(v) => set("show", { ...s.show, pricing: v })} label="Pricing" />
            <Toggle on={s.show.faq} onChange={(v) => set("show", { ...s.show, faq: v })} label="FAQ" />
            <Toggle on={s.show.bot} onChange={(v) => set("show", { ...s.show, bot: v })}
              label="Chat bubble" hint="The assistant in the bottom corner" />
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base text-paper">Section headings</h2>
            <div className="space-y-5">
              {(["features", "how", "pricing", "faq"] as const).map((k) => (
                <div key={k} className="space-y-2.5 border-b border-white/5 pb-4 last:border-0 last:pb-0">
                  <p className="text-xs uppercase tracking-wide text-mute/70">{k}</p>
                  <input className="input !py-2 !text-sm" placeholder="Small line above" value={s[k].kicker}
                    onChange={(e) => set(k, { ...s[k], kicker: e.target.value })} />
                  <input className="input !py-2 !text-sm" placeholder="Heading" value={s[k].title}
                    onChange={(e) => set(k, { ...s[k], title: e.target.value })} />
                  <textarea className="input !min-h-16 !py-2 !text-sm" placeholder="Sentence underneath (optional)"
                    value={s[k].sub} onChange={(e) => set(k, { ...s[k], sub: e.target.value })} />
                </div>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h2 className="mb-4 font-display text-base text-paper">Closing section</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Heading"><input className="input" maxLength={120} value={s.cta.title}
                onChange={(e) => set("cta", { ...s.cta, title: e.target.value })} /></Field>
              <Field label="Sentence underneath"><input className="input" maxLength={260} value={s.cta.sub}
                onChange={(e) => set("cta", { ...s.cta, sub: e.target.value })} /></Field>
              <Field label="Button"><input className="input" maxLength={40} value={s.cta.button}
                onChange={(e) => set("cta", { ...s.cta, button: e.target.value })} /></Field>
            </div>
            <Field label="Line in the footer">
              <div className="mt-4">
                <textarea className="input !min-h-16" maxLength={300} value={s.footerNote}
                  onChange={(e) => set("footerNote", e.target.value)} />
              </div>
            </Field>
          </Card>
        </div>
      )}

      {/* ---------------- lists ---------------- */}
      {tab === "copy" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="mb-1 font-display text-base text-paper">Scrolling strip</h2>
            <p className="mb-4 text-xs text-muted">Short phrases. They loop, so six to ten reads best.</p>
            <LineList value={s.marquee} onChange={(v) => set("marquee", v)} placeholder="Add a phrase" />
          </Card>

          <Card>
            <h2 className="mb-1 font-display text-base text-paper">What it reads</h2>
            <Field label="Sentence beside the list">
              <input className="input mb-4" value={s.proof.label}
                onChange={(e) => set("proof", { ...s.proof, label: e.target.value })} />
            </Field>
            <LineList value={s.proof.items} onChange={(v) => set("proof", { ...s.proof, items: v })}
              placeholder="Add a file type" max={12} />
          </Card>

          <Card className="lg:col-span-2">
            <h2 className="mb-1 font-display text-base text-paper">Features</h2>
            <p className="mb-4 text-xs text-muted">
              Icon names come from the app&apos;s set: chat, notes, map, test, mic, slides, translate, plan, cards, cite, grammar, zap.
            </p>
            <div className="space-y-3">
              {s.features.items.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-white/[0.07] p-3 sm:grid-cols-[7rem_1fr_auto]">
                  <input className="input !py-2 !text-sm" placeholder="icon" value={f.icon}
                    onChange={(e) => set("features", { ...s.features, items: s.features.items.map((x, j) => j === i ? { ...x, icon: e.target.value } : x) })} />
                  <div className="space-y-2">
                    <input className="input !py-2 !text-sm" placeholder="Title" value={f.title}
                      onChange={(e) => set("features", { ...s.features, items: s.features.items.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                    <textarea className="input !min-h-16 !py-2 !text-sm" placeholder="One or two sentences" value={f.body}
                      onChange={(e) => set("features", { ...s.features, items: s.features.items.map((x, j) => j === i ? { ...x, body: e.target.value } : x) })} />
                  </div>
                  <button type="button" aria-label="Remove feature"
                    onClick={() => set("features", { ...s.features, items: s.features.items.filter((_, j) => j !== i) })}
                    className="self-start rounded-lg p-2 text-muted transition hover:bg-red-500/20 hover:text-red-300">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
              {s.features.items.length < 12 && (
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => set("features", { ...s.features, items: [...s.features.items, { title: "", body: "", icon: "spark" }] })}>
                  <Icon name="plus" size={14} /> Add a feature
                </button>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h2 className="mb-1 font-display text-base text-paper">Questions &amp; answers</h2>
            <p className="mb-4 text-xs text-muted">The accordion near the bottom of the page. The first one opens by default.</p>
            <div className="space-y-3">
              {s.faq.items.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-white/[0.07] p-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <input className="input !py-2 !text-sm" placeholder="Question" value={f.q}
                      onChange={(e) => set("faq", { ...s.faq, items: s.faq.items.map((x, j) => j === i ? { ...x, q: e.target.value } : x) })} />
                    <textarea className="input !min-h-20 !py-2 !text-sm" placeholder="Answer" value={f.a}
                      onChange={(e) => set("faq", { ...s.faq, items: s.faq.items.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} />
                  </div>
                  <button type="button" aria-label="Remove question"
                    onClick={() => set("faq", { ...s.faq, items: s.faq.items.filter((_, j) => j !== i) })}
                    className="self-start rounded-lg p-2 text-muted transition hover:bg-red-500/20 hover:text-red-300">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
              {s.faq.items.length < 14 && (
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => set("faq", { ...s.faq, items: [...s.faq.items, { q: "", a: "" }] })}>
                  <Icon name="plus" size={14} /> Add a question
                </button>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h2 className="mb-4 font-display text-base text-paper">How it works</h2>
            <div className="space-y-3">
              {s.how.items.map((st, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-white/[0.07] p-3 sm:grid-cols-[2rem_1fr_auto] sm:items-start">
                  <span className="grid h-8 w-8 place-items-center rounded-full border border-white/12 text-sm text-lampsoft">{i + 1}</span>
                  <div className="space-y-2">
                    <input className="input !py-2 !text-sm" placeholder="Step" value={st.title}
                      onChange={(e) => set("how", { ...s.how, items: s.how.items.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                    <textarea className="input !min-h-16 !py-2 !text-sm" placeholder="What happens" value={st.body}
                      onChange={(e) => set("how", { ...s.how, items: s.how.items.map((x, j) => j === i ? { ...x, body: e.target.value } : x) })} />
                  </div>
                  <button type="button" aria-label="Remove step"
                    onClick={() => set("how", { ...s.how, items: s.how.items.filter((_, j) => j !== i) })}
                    className="self-start rounded-lg p-2 text-muted transition hover:bg-red-500/20 hover:text-red-300">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
              {s.how.items.length < 6 && (
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => set("how", { ...s.how, items: [...s.how.items, { title: "", body: "" }] })}>
                  <Icon name="plus" size={14} /> Add a step
                </button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ---------------- bot ---------------- */}
      {tab === "bot" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 font-display text-base text-paper">The chat bubble</h2>
            <div className="space-y-4">
              <Field label="Name"><input className="input" maxLength={30} value={s.bot.name}
                onChange={(e) => set("bot", { ...s.bot, name: e.target.value })} /></Field>
              <Field label="First thing it says" hint={`${s.bot.greeting.length}/300`}>
                <textarea className="input !min-h-20" maxLength={300} value={s.bot.greeting}
                  onChange={(e) => set("bot", { ...s.bot, greeting: e.target.value })} />
              </Field>
              <Field label="When it has no answer" hint={`${s.bot.fallback.length}/300`}>
                <textarea className="input !min-h-20" maxLength={300} value={s.bot.fallback}
                  onChange={(e) => set("bot", { ...s.bot, fallback: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 font-display text-base text-paper">How it answers</h2>
            <p className="mb-3 text-xs text-muted">
              Your written answers are always tried first — they are instant and cost nothing.
            </p>
            <Toggle on={s.bot.aiEnabled} onChange={(v) => set("bot", { ...s.bot, aiEnabled: v })}
              label="Let the AI handle the rest"
              hint="Only for questions your answers do not cover. Capped per visitor and per day, because this page needs no login." />
            <Link href="/admin/bot" className="btn btn-ghost btn-sm mt-4">
              <Icon name="chat" size={14} /> Write the answers
            </Link>
          </Card>
        </div>
      )}
    </Page>
  );
}
