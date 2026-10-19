# Eluna Mind

An AI study platform: 20 study tools, a tutor chat, file uploads, a career
guide, subscriptions, and an admin panel that configures all of it without a
redeploy.

Next.js 16 (App Router) · React 19 · Tailwind 4 · Supabase · Stripe.

---

## Deploying it

→ **[`START-HERE.md`](START-HERE.md)** — zero to live on a new Supabase and a
new Vercel, in about 30 minutes. Start there. It is the only file you need.

The rest is reference:

| File | What it covers |
|---|---|
| `START-HERE.md` | **The setup guide. Read this one.** |
| `DEPLOY-STEPS.md` | The long version, with every option explained |
| `VERCEL.md` | Moving an existing deployment off Netlify |
| `ADMIN_SETUP.md` | What each admin page does |
| `TESTING.md` | The full pre-handover test list |
| `HANDOFF.md` | What to give the client, and what to keep |
| `supabase/emails/README.md` | The auth email templates |

## Running it locally

```bash
npm install
cp .env.example .env.local   # then fill in the three Supabase values
npm run dev
```

The database still has to exist: run `supabase/RUN-THIS-IN-SUPABASE.sql` in
your Supabase SQL editor first. See step 2 of `START-HERE.md`.

## The three things worth knowing

**Almost nothing is configured by environment variables.** The AI keys, the
Stripe keys, the plan limits, the pricing copy and the branding all live in the
database and are edited in `/admin`. Changes are live in about ten seconds with
no redeploy. Only Supabase's own three values and the site URL are env vars.

**The AI layer fails over.** Add several providers in Admin → AI keys and the
app tries them in priority order, records which ones are failing, and moves on.
Admin → Branding & site has a switch that pauses all AI instantly.

**`SUPABASE_SERVICE_ROLE_KEY` is the whole database.** It belongs in your host's
environment variables and nowhere else — never in the repo, never in a
screenshot. `.gitignore` already blocks `.env*`.

## Health check

Open `/diagnose` signed in as an admin. It reports the database, the keys, the
storage bucket and the payment setup, and names the one thing to fix first.
