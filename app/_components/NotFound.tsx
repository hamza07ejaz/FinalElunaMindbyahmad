/**
 * The 404 page, styled by itself.
 *
 * Every other page in the app gets its CSS from the root layout. A 404 does
 * not: when `notFound()` is reached, Next renders the not-found boundary
 * inside its own error document — a different <html> that never includes the
 * layout, and therefore never includes the stylesheet. The result, measured in
 * a browser, was Times New Roman and default-blue links on white: no
 * background, no brand, nothing.
 *
 * Importing globals.css here does not fix it, and neither does adding a
 * not-found.tsx per segment. So this page carries its own styles in a <style>
 * tag and uses no utility classes, no shared nav and no shared footer. It is
 * the one page in the app that must look right with no build output behind it,
 * which is exactly the property you want from the page people see when
 * something has already gone wrong.
 *
 * The values are copied from globals.css deliberately. They are a handful of
 * constants on one page; importing them would reintroduce the dependency this
 * exists to remove.
 */

const CSS = `
.nf-root {
  min-height: 100vh;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 48px 20px;
  background: #05060e;
  color: #edf1fb;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  text-align: center;
  box-sizing: border-box;
}
.nf-bar { display: flex; width: 100%; max-width: 420px; height: 4px; border-radius: 2px; overflow: hidden; margin-bottom: 40px; }
.nf-bar span { flex: 1; }
.nf-code { font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b7694; margin: 0 0 14px; }
.nf-title { font-size: clamp(28px, 6vw, 44px); line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 14px; }
.nf-text { font-size: 16px; line-height: 1.6; color: #9aa6c4; margin: 0 0 32px; max-width: 46ch; }
.nf-row { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
.nf-btn {
  display: inline-block; padding: 12px 22px; border-radius: 12px;
  font-size: 15px; font-weight: 600; text-decoration: none;
  border: 1px solid transparent; transition: opacity .15s ease, border-color .15s ease;
}
.nf-btn:hover { opacity: .88; }
.nf-primary { background: #575af9; color: #ffffff; }
.nf-ghost { border-color: rgba(255,255,255,.16); color: #edf1fb; }
.nf-ghost:hover { border-color: rgba(255,255,255,.34); }
.nf-mark { margin-bottom: 26px; }
.nf-links { margin-top: 40px; font-size: 13px; color: #6b7694; }
.nf-links a { display: inline-block; padding: 5px 4px; color: #9aa6c4; text-decoration: none; }
.nf-links a:hover { text-decoration: underline; }
.nf-links span { margin: 0 8px; opacity: .5; }
@media (prefers-reduced-motion: no-preference) {
  .nf-root > * { animation: nf-in .45s ease both; }
}
@keyframes nf-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;

const SWEEP = ["#00f0d4", "#00b4fc", "#575af9", "#9653fa", "#e838fd"];

export function NotFoundPage({
  code = "404",
  title = "This page is not here",
  message = "The link may be old, or mistyped. Everything else is where you left it.",
}: { code?: string; title?: string; message?: string }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="nf-root">
        <div className="nf-bar" aria-hidden="true">
          {SWEEP.map((c) => <span key={c} style={{ background: c }} />)}
        </div>

        {/* The mark, drawn inline for the same reason the styles are inline. */}
        <svg className="nf-mark" width="52" height="52" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="nf-sweep" x1="10" y1="32" x2="54" y2="32" gradientUnits="userSpaceOnUse">
              {SWEEP.map((c, i) => <stop key={c} offset={i / (SWEEP.length - 1)} stopColor={c} />)}
            </linearGradient>
          </defs>
          <g stroke="url(#nf-sweep)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M29.6 14.2c-5.4-2.5-11.1.1-12.8 5-4.4.8-7.1 4.6-6.4 8.6-3.3 2.5-3.6 7.1-.8 9.9-1.4 4.2 1.2 8.3 5.5 9 1 4.2 5.3 6.7 9.4 5.3 1.5 2.2 3.7 3.2 5.1 3.2" />
            <path d="M34.4 14.2c5.4-2.5 11.1.1 12.8 5 4.4.8 7.1 4.6 6.4 8.6 3.3 2.5 3.6 7.1.8 9.9 1.4 4.2-1.2 8.3-5.5 9-1 4.2-5.3 6.7-9.4 5.3-1.5 2.2-3.7 3.2-5.1 3.2" />
          </g>
          <line x1="32" y1="13" x2="32" y2="51" stroke="url(#nf-sweep)" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
          <circle cx="32" cy="32" r="2.9" fill="#ffffff" />
        </svg>

        <p className="nf-code">{code}</p>
        <h1 className="nf-title">{title}</h1>
        <p className="nf-text">{message}</p>

        {/*
          Plain anchors, not <Link>. A full navigation is the right behaviour
          here: it leaves the error document behind and loads the real app with
          its stylesheet, instead of client-routing within a broken shell.
        */}
        <div className="nf-row">
          <a className="nf-btn nf-primary" href="/">Back to the home page</a>
          <a className="nf-btn nf-ghost" href="/dashboard">Open the dashboard</a>
        </div>

        <p className="nf-links">
          <a href="/pricing">Pricing</a><span>·</span>
          <a href="/blog">Blog</a><span>·</span>
          <a href="/privacy">Privacy</a><span>·</span>
          <a href="/terms">Terms</a>
        </p>
      </div>
    </>
  );
}
