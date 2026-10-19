# ElunaMind — project handoff

AI study platform. Next.js 16 (App Router) + Supabase + Stripe + OpenAI, deployed on Netlify.
This file exists so a fresh session can continue the work without re-reading the whole repo.

## How it is wired

- `lib/plans.ts` — **single source of truth** for plan rules: which tools are premium, daily
  limits (free vs premium), max input length, max AI output tokens. Change limits here only.
- `lib/guard.ts` — every AI route starts with `guard(req, "<feature>")`, which runs in order:
  kill switch (`AI_DISABLED=1`) → login check → premium gate, then returns `consume()` / `refund()`.
  Call `consume()` only AFTER validating input, and `refund()` whenever the AI call fails.
- `lib/auth.ts` — `requireUser(req)`: reads the Supabase session cookie (or an
  `Authorization: Bearer` token), then loads `plan` from `profiles` with the service role.
- `lib/usage.ts` — wraps the `consume_usage` / `refund_usage` Postgres functions (atomic daily counters).
- `lib/ai.ts` — OpenAI client. Setting `OPENAI_BASE_URL` switches to an OpenAI-compatible provider
  (e.g. Gemini); the compat layer there rewrites `response_format` and scales `max_tokens`.
- `lib/supabase/{browser,server,admin}.ts` — browser (cookie session), server (reads cookies),
  admin (service role, server only — never import it in a `"use client"` file).

## Routes

- Public: `/` (landing), `/pricing`, `/login`, `/auth/callback` (Google + email confirm), `/success`.
- App: `/dashboard`, plus one page per tool at `/dashboard/<slug>`. `app/dashboard/layout.tsx`
  requires login server-side and seeds `UsageProvider` with today's usage.
- Old URLs (`/qna`, `/flashcards`, …) are thin redirect pages pointing at their `/dashboard/*` version.
- APIs: one per tool, plus `/api/chat` (streaming), `/api/chats`, `/api/notes`, `/api/usage`,
  `/api/create-checkout-session`, `/api/stripe-webhook`.

## UI conventions

- Tokens live in `app/globals.css`: navy base `--ink`, a single amber accent `--lamp`, mint only
  for free/success signals. Headings use Fraunces (`font-display`), UI text uses Inter.
- Tool pages are assembled from `app/_components/ToolUI.tsx`: `ToolFrame` (header, remaining-uses
  chip, premium lock), `useToolRunner` (calls the API, handles 401 and limit errors, refreshes the
  usage meter), plus `Panel`, `Field`, `GenerateButton`, `ErrorBox`, `CopyButton`, `Skeleton`.
- `app/_components/tools.ts` is the tool registry (title, slug, icon, premium flag). Adding a tool
  means four things: a rule in `lib/plans.ts`, an entry here, an API route, and a page.

## Database

`supabase/` holds the migrations (`001_foundation.sql`, `002_chat_and_notes.sql`); the combined
one-shot file is `eluna_supabase_setup.sql`. Tables: `profiles`, `usage_daily`, `stripe_events`,
`chats`, `chat_messages`, `notes_history`. RLS is ON with no policies on server-only tables by
design — only the service role touches them. `profiles` allows read-own only, so a user cannot
set their own `plan`.

## Environment variables

See `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are server-only.
`NEXT_PUBLIC_GOOGLE_AUTH=1` shows the Google button on the login page.

## State of the work

Done: server-side auth fixed, per-user atomic daily limits, premium gating read from the database,
Stripe webhook handling cancel/unpaid, streaming tutor chat with history, notes history, usage
meter, landing-page redesign, Next.js on a patched 16.x (Netlify blocks vulnerable versions).

Not done yet, roughly in order:
1. File and image uploads, 3 per user per day, then feeding them to the AI (RAG).
2. Study library and student progress tracking.
3. Rate limiting (Upstash), Sentry, analytics.
4. Password reset flow.
5. Performance pass and load testing.

## Before changing anything

- Run `npm run build`; it catches most breakage.
- Test limits with a real account rather than by reading the code: the free plan should block at
  the documented count, and a failed AI call should refund the use.
- Never run migrations against the client's production Supabase without a backup.

## Admin panel (added later)

- `/admin` is gated by `requireAdmin()` in `lib/auth.ts`; non-admins are redirected to `/dashboard`
  and every `/api/admin/*` route answers 403.
- An admin is a row in `profiles` with `role = 'admin'`. Promote the first one with SQL
  (see the bottom of `supabase/003_admin.sql`), then promote others from the panel.
- Limits, pricing text, branding and site switches live in the `app_settings` table.
  `lib/plans.ts` holds the DEFAULTS; `lib/settings.ts` merges stored values over them, clamps
  every number, caches for 10 seconds, and falls back to defaults if the database is unreachable.
  Read `getSettings()` on the server; never read `DEFAULT_RULES` directly for live behaviour.
- Blog posts are in `blog_posts`; public pages are `/blog` and `/blog/[slug]`, revalidated every 5 min.
- Every admin write is recorded in `admin_audit` by `logAdmin()` and shown at `/admin/activity`.
- Blocked users (`profiles.status = 'blocked'`) are redirected to `/suspended` and refused by `guard()`.
