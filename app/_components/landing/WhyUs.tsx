import { Icon } from "../Icon";
import { Reveal } from "../Reveal";

const REASONS = [
  { icon: "chat" as const, head: "It teaches, not just answers", body: "You get the reasoning one step at a time, so the next question is one you can do on your own." },
  { icon: "attach" as const, head: "It reads your actual course", body: "Upload the chapter, the slide deck, a photo of your notes or a lecture recording, and every answer comes from that, not from a guess." },
  { icon: "zap" as const, head: "You always know what is left", body: "Every tool shows your remaining uses before you start. No silent cut-offs in the middle of an exam week." },
  { icon: "history" as const, head: "Your work stays", body: "Chats and notes are saved to your account and open again whenever you need them. Delete anything you want gone." },
  { icon: "shield" as const, head: "Honest about mistakes", body: "Citations carry a verify-first warning and nothing is dressed up as certain. You check, we make checking fast." },
];

export function WhyUs() {
  return (
    <div className="mx-auto grid max-w-5xl gap-x-12 gap-y-10 sm:grid-cols-2">
      {REASONS.map((r, i) => (
        <Reveal key={r.head} delay={i * 90}>
          <div className="flex gap-4">
            <span className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-lamp">
              <Icon name={r.icon} size={19} />
            </span>
            <div>
              <h3 className="font-display text-lg text-paper">{r.head}</h3>
              <p className="lede mt-1.5 text-sm">{r.body}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
