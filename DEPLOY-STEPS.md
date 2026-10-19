# Deploying this update

Covers Group A (uploads, transcripts, voice-over, translation, PPT download,
mind maps), Group B (trial, sub-admins, support inbox) and Group C
(error monitoring, card-backed trial with self-serve cancel, and the redesigned
public site).

Order matters: **database first, code second.** The code is written to survive a
missing migration, but the new features stay switched off until the SQL has run.

---

## 1. Put the files in your local repo

1. Unzip `elunamind-update.zip`.
2. Copy everything from inside it **over** your local clone of the repo,
   replacing files when asked.
3. `.env.local` is **not** in the zip, so your local keys are untouched.

What you should see afterwards in GitHub Desktop:

**New files**
```
lib/roles.ts                        lib/support.ts
lib/support-shared.ts               lib/transcribe.ts
lib/uploads.ts                      lib/extract.ts
lib/export/pptx.ts                  lib/export/docs.ts
app/_components/Attach.tsx          app/_components/Speak.tsx
app/_components/ExportMenu.tsx
app/api/upload/route.ts             app/api/uploads/[id]/route.ts
app/api/transcript/route.ts         app/api/translate/route.ts
app/api/trial/route.ts
app/api/support/route.ts            app/api/support/[id]/route.ts
app/api/admin/support/route.ts      app/api/admin/support/[id]/route.ts
app/dashboard/files/page.tsx        app/dashboard/transcript/page.tsx
app/dashboard/translate/page.tsx    app/dashboard/support/page.tsx
app/admin/support/page.tsx
supabase/006_uploads.sql            supabase/007_trial_roles_support.sql
```

**Changed files** — `lib/auth.ts`, `lib/plans.ts`, `lib/settings.ts`,
`app/api/chat/route.ts`, `app/api/chats/[id]/route.ts`, `app/api/generate/route.ts`,
`app/api/usage/route.ts`, `app/api/admin/*`, `app/dashboard/*`, `app/admin/*`,
`app/_components/*`, `app/blog/page.tsx`, `package.json`, `.env.example`.

---

## 2. Run the SQL (Supabase → SQL Editor)

Run these **in order**, one at a time, in the Supabase project you use for the demo.
Both are safe to run twice, so re-run if you are unsure whether one went through.

| # | File | Expected output |
|---|------|-----------------|
| 1 | `supabase/006_uploads.sql` | `uploads ready` |
| 2 | `supabase/007_trial_roles_support.sql` | `trial, roles and support ready` |
| 3 | `supabase/008_errors_and_billing.sql` | `errors and billing ready` |
| 4 | `supabase/009_site_content.sql` | `site content ready` |
| 5 | `supabase/010_ai_providers.sql` | `ai providers ready` |
| 6 | `supabase/011_career_and_voice.sql` | `career plans and voice samples ready` |
| 7 | `supabase/012_stripe_config.sql` | `stripe config ready` |

`NOTICE: constraint ... does not exist, skipping` lines are normal on a first run.
Anything starting with `ERROR:` is not — stop and send me the message.

### What 006 creates
- `uploads` table, `chat_messages.upload_id` column
- a **private** storage bucket called `uploads` (25 MB ceiling)

### What 007 creates
- `profiles.trial_started_at`, `profiles.trial_ends_at`
- `sub_admin` added to the allowed roles
- `support_tickets` and `support_messages` tables
- `start_trial()` function, and updated `admin_overview()` / `admin_user_list()`

### What 008 creates
- `app_errors` + `error_groups`, and the `record_error` / `prune_errors` functions
- `profiles.subscription_status`, `card_trial_ends_at`, `cancel_at_period_end`,
  `current_period_end` — the billing state behind "renews on the 30th"

### What 009 creates
- `site_pages` — privacy, terms, cookies and refunds, each with a starter body
- `bot_answers` + `bot_questions` — what the landing-page chat bubble says, and
  what visitors asked that it could not answer

### What 010 creates
- `ai_providers` — the AI keys, managed from **Admin → AI keys** instead of
  from environment variables, so changing one takes a save and not a redeploy

### What 012 creates
- `stripe_config` — the Stripe secret key, price and webhook secret, managed from
  **Admin → Payments** instead of from environment variables

### What 011 creates
- `career_plans` — saved career guidance, so a twelve-month plan can be reopened
  and asked questions about later
- `voice_samples` — one sample of the student's own writing per account, which is
  what **Make It Sound Human → In my voice** matches against

---

## 2-0. Branding — what a shared link looks like

Three things were missing and are now in:

**The site had no favicon at all.** `app/favicon.png` was never a filename Next.js
recognises — only `favicon.ico` and `icon.*` — so it never reached the build and
browsers showed the blank default. There is now `app/icon.svg` (a simplified mark:
at 16 pixels the brain folds turn to mud, so the favicon keeps the silhouette, the
seam and the light and drops the detail), `app/favicon.ico` holding 16 and 32 pixel
versions for Google and older Windows, `app/apple-icon.png` at 180 for iOS, and a
web manifest so "Add to home screen" gets the right name and icon.

**A shared link showed a grey box.** There was no `openGraph` metadata and no
`metadataBase`, which means even a correct image URL comes out relative and
WhatsApp, Slack and LinkedIn cannot resolve it. There is now a share card drawn at
`/opengraph-image`, 1200×630, carrying the mark, the headline and the tagline —
**read from Admin → Branding**, so renaming the site changes every future share
within the hour. It needs `NEXT_PUBLIC_APP_URL` set correctly; that is what makes
the image URL absolute.

**Auth emails were Supabase's defaults**, with Supabase's branding. Six branded
templates are in `supabase/emails/` with a README: confirm signup, reset password,
magic link, change email, invite and reauthentication. Paste each into
Supabase → Authentication → Emails, and set the subject line there too.

Also: `robots.txt` (the dashboard, the admin panel and `/diagnose` are kept out of
search), a `sitemap.xml` that picks up blog posts and legal pages from the database,
and the five Next.js starter SVGs that were still shipping in `public/` are gone.

**One thing worth knowing about the sitemap.** `/flashcards`, `/grammar`, `/career`
and the rest look like landing pages but every one is a redirect into the dashboard,
so a crawler following them lands on the login screen. They are deliberately left
out — a redirect in a sitemap is reported as an error, and whatever gets indexed is
the login page. They would be worth real landing pages later; that is an SEO job,
not a branding one.

---

## 2-00. A testing pass was run — three real bugs came out of it

Full write-up in `TESTING.md`, including the checklist you need to run yourself
on the signed-in side. The short version:

- **Every 404 page was completely unstyled** — Times New Roman on white, default
  blue links, permanently. The 404 now carries its own styles and depends on
  nothing.
- **`/api/client-error` returned 500 on every malformed report**, so browser
  crashes were never recorded and nothing said so.
- **Long links and tokens in AI answers were silently cut off** — the middle of a
  URL simply vanished, and a student copying it got a broken link.

Plus tap targets raised to the 24px floor and two skipped heading levels fixed.
The signed-out surface went from 94 findings to 3, and the three left are Next.js
prefetch noise.

---

## 2a. Payments move into the admin panel

**Saving a working Stripe key is what turns real payments on.** There is no second
switch, because a second switch is how a site ends up live in one place and demo in
another. Admin → **Payments** does the whole setup:

1. **Paste the secret key.** It is checked against Stripe *before* it is saved, so a
   mistyped key is refused on that screen rather than at a customer's checkout. Start
   with the `sk_test_` key — everything works, nothing is charged.
2. **Pick or create the price.** It lists the recurring prices already in your Stripe
   account, or creates a product and price for you from a name, amount and interval.
3. **Press "Set up the webhook for me".** This creates the endpoint in your Stripe
   account and stores the signing secret, which Stripe only ever reveals at the moment
   an endpoint is created. Any endpoint already pointing at this same address is
   replaced first — two of them would deliver every event twice.

**Checkout stays off until all three are done.** That is deliberate: a key with no
webhook secret means a customer can be charged and never upgraded, which is the worst
thing this app can do, so it is treated as "not ready" rather than as a warning to
click past.

**`DEMO_CHECKOUT=1` is now harmless to leave set.** The free-upgrade route is gated on
whether real payments are live, not on that variable, so once Stripe works the demo
route refuses. Leaving it set no longer risks giving Premium away.

Environment variables still work as a fallback, so nothing breaks before the migration
is run. Anything saved in the panel takes over from them.

**Going live:** swap the test key for the `sk_live_` one, press **Set up the webhook
for me** again (a test-mode endpoint and secret do not work with a live key — the panel
clears them for you when the mode changes), then press **Check setup**. Make one real
payment on a small price and confirm the account actually shows Premium afterwards. If
it does not, the webhook is the thing to look at — `/diagnose` now reports it too.

---

## 2b. Two new tools

**Make It Sound Human** (Premium, `/dashboard/humanize`) — rewrites a draft in one
of five ways: sound natural, in my voice, simpler, more formal, shorter. Every
number it shows is calculated in code, not asked of the AI: Flesch-Kincaid grade,
average sentence length, how much that length varies, passive clauses, filler
words, and the stock phrases it found with a replacement for each. It also shows a
word-level diff of what changed.

**It is deliberately not an AI-detector bypass.** Those do not work for long —
detectors change monthly — and the feature would make the product unsellable to a
school or university, which is the market this is aimed at. The page says so
plainly where a student will read it.

**Career Guide, rebuilt** (`/dashboard/career`) — four modes now: *Find my path*
(seven questions, three careers with a fit score and the reasoning), *12-month
plan* (four phases, each with a provable milestone, plus a portfolio and where to
learn it), *The honest truth* (a typical day hour by hour, pay, hours, downsides,
and how to test the job cheaply before committing years) and *Earn while
studying*. Plans are saved and can be reopened, and you can ask follow-up
questions about the plan on screen.

Three things changed about how it behaves:

- **The hardcoded "advice" is gone.** The old route kept a generic six-step list
  and three stock career suggestions, and served them whenever the AI call failed
  — while refunding the allowance. A student could not tell the difference, so
  boilerplate was being presented as guidance about their own answers. It now says
  when it could not answer.
- **No invented links.** Course URLs from a model are frequently real-looking and
  dead, so the prompt forbids links entirely: you get the provider's name and the
  exact phrase to search for, and any URL that slips through is stripped.
- **Pay figures carry their region and a caveat**, both on screen and in anything
  you copy or export. There is also a "where will you be working?" box, because a
  salary band with no country attached is worse than none.

---

### Verify it worked
Run this and check all twelve rows say `yes`:

```sql
select 'uploads table'   as thing, to_regclass('public.uploads')          is not null as ok
union all select 'tickets table',  to_regclass('public.support_tickets')  is not null
union all select 'messages table', to_regclass('public.support_messages') is not null
union all select 'trial column',   exists (select 1 from information_schema.columns
                                           where table_name='profiles' and column_name='trial_ends_at')
union all select 'uploads bucket', exists (select 1 from storage.buckets where id='uploads')
union all select 'errors table',   to_regclass('public.app_errors')            is not null
union all select 'billing columns',exists (select 1 from information_schema.columns
                                           where table_name='profiles' and column_name='cancel_at_period_end')
union all select 'site pages',    to_regclass('public.site_pages')            is not null
union all select 'bot answers',   to_regclass('public.bot_answers')           is not null
union all select 'ai keys',       to_regclass('public.ai_providers')          is not null
union all select 'career plans', to_regclass('public.career_plans')          is not null
union all select 'voice samples',to_regclass('public.voice_samples')         is not null
union all select 'stripe config',to_regclass('public.stripe_config')         is not null;
```

---

## 2c. The hang and the empty answers — what was fixed earlier

Two separate faults, both fixed in this update. No SQL needed for either.

**1. Vercel was killing the AI routes after 10 seconds.** Nine routes — notes,
flashcards, tests, Q&A, study plan, citations, grammar, paraphrase, career — never
said how long they were allowed to take, and Vercel's default is 10 seconds. An AI
answer of any length takes longer, so the function was killed mid-generation and
the user saw a failure with nothing useful in the logs. Every AI route now declares
`maxDuration = 60`. *(Transcripts asked for 300 seconds, which is above what
Vercel's lower plans allow; that is now 60 as well.)*

**2. Nothing had a deadline, so a silent provider meant a frozen chat.** Three
places could wait forever, and all three now give up and say so:

| Where | Was | Now |
|-------|-----|-----|
| The provider connection | the SDK's own 10-minute default | 45s, no internal retries |
| Waiting for the first word | forever | 20s, then the next key is tried |
| A gap mid-answer | forever | 20s, keeping whatever arrived |
| The browser's reader | forever | 30s, then an error you can act on |
| Saving to the database | held the stream open | runs *after* the answer is delivered |

Also fixed along the way:

- **Streaming had no failover.** A stream that opened and then said nothing counted
  as a success, so a second key was never tried. A key now has to produce a real
  word before it is trusted.
- **An empty answer counted as an answer.** Gemini's 2.5 models think before
  replying and bill that thinking against the output budget — on a small budget
  they can spend all of it reasoning and return nothing. Thinking is now switched
  off on Gemini, output budgets have a floor, and an empty reply fails over to the
  next key instead of reaching the user.
- **A dead stream is retried once without streaming** before the user is told
  anything went wrong.
- **The chat's answers read better** — the tutor prompt now forbids the
  "Great question!" opener, requires every step of a calculation, and holds the
  LaTeX and table rules it had before.
- **`/diagnose` now covers the AI**: how many keys are set up, which are switched
  on, each one's health and last error, and whether AI is paused in the admin
  panel. It still never prints a key. If a tool fails, open `/diagnose` first — the
  `verdict` line names the one thing to fix.

### If you ever need to tune the deadlines
All optional. The defaults are chosen to fit inside Vercel's 60-second ceiling, so
only raise them if you move to a plan with a longer one.

| Variable | Default | What it does |
|----------|---------|--------------|
| `AI_REQUEST_MS` | `45000` | One request to a provider |
| `AI_FIRST_TOKEN_MS` | `20000` | How long a key gets to say its first word |
| `AI_IDLE_MS` | `20000` | Allowed silence mid-answer |
| `AI_TOTAL_MS` | `50000` | The whole attempt, failovers included |
| `AI_THINKING` | off | Set to `on` to let Gemini think again |
| `AI_MIN_OUTPUT_TOKENS` | `2000` | Floor on the output budget |

---

## 3. Netlify environment variables

Nothing here is required — the deploy works without touching it. Add these only
when you want to change the defaults:

| Variable | Default | Why you would set it |
|----------|---------|----------------------|
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Transcription model, once you are on a paid OpenAI key |
| `OPENAI_AUDIO_MODEL` | falls back to `OPENAI_MODEL` | Model used for the Gemini audio fallback |
| `TRANSCRIBE_MAX_BYTES` | `12582912` (12 MB) | Raise only if your host allows long requests |

**Check this is still right:** `SUPABASE_SERVICE_ROLE_KEY` must hold the key that
starts with `sb_secret_`, never the `sb_publishable_` one. `/diagnose` tells you
which one is loaded without printing it.

**Before taking real payments:** `DEMO_CHECKOUT` must be `0`. At `1` anyone gets
Premium for free.

---

## 4. Push

In GitHub Desktop: review the changed files, write a commit message
("uploads, transcripts, trial, sub-admins, support"), **Commit to main**, then **Push origin**.

Netlify builds automatically. Expect roughly 2–4 minutes.

If the build fails, copy the last 30 lines of the Netlify deploy log — the error is
almost always a missing environment variable, not the code.

---

## 5. After the deploy — do these once

1. **Reset the site copy.** Admin → Branding & site → **Reset to defaults**, then
   Save. Your old tagline and hero text are stored in the database and would keep
   overriding the new wording.
1. **Write the legal pages.** Admin → **Pages**. All four ship as a structure with
   every gap marked `[like this]` and a warning block at the top. Fill them in,
   delete the warning block, and have a lawyer read them before you take payments.
   They are linked from the footer and are the ones Stripe checks for.
1. **Put your logo in.** Admin → Branding & site → logo URL. Until you do, the
   site draws its own version of the mark — a split brain with the spectrum and
   the spark — which matches but is not your file.
2. **Check the new switches.** Admin → Branding & site should now show
   *In-app support tickets* and *Offer a free Premium trial* with a length field.
3. **Check the new limits.** Admin → Plans & limits should now list Uploads,
   Transcripts and Translate alongside the old tools.

---

## 6. Test it end to end (10 minutes)

Use a second, non-admin account for this — the admin account sees Premium tools anyway.

**Uploads**
- [ ] Dashboard → My Files → drop in a PDF. It shows as ready with a page count.
- [ ] Press **Ask** → chat opens with the file attached → ask something only that
      file answers → the answer uses it.
- [ ] Press **Notes** → notes are generated from the file, not from a typed prompt.
- [ ] Delete the file. It disappears, and Supabase → Storage → uploads loses the object.
- [ ] Upload a renamed `.exe` as `.pdf` — it is refused.

**Transcripts**
- [ ] Upload a short voice note on Lecture Transcripts. You get a transcript **and**
      revision notes.
- [ ] Run the same file again — it says it did not use an allowance.

**Voice-over**
- [ ] Hover an answer in chat → **Listen** reads it aloud. No `**` or LaTeX is spoken.

**Translation**
- [ ] Paste a paragraph, pick a language, press Translate, then **Compare**.

**PowerPoint**
- [ ] Slide Builder → generate → **Download** → the `.pptx` opens in PowerPoint.

**Free trial**
- [ ] On a fresh free account the upgrade button reads
      *"Try Premium free for 7 days"*.
- [ ] Press it. Premium tools unlock, the sidebar shows a countdown.
- [ ] Press it again elsewhere — it is refused, one trial per account.

**Support**
- [ ] As the user: Help & support → open a ticket.
- [ ] As the admin: Admin → Support inbox shows it with a dot. Reply. Status
      becomes *Replied*.
- [ ] Back as the user: the reply is there, and the ticket can be closed.

**Sub-admin**
- [ ] Admin → Users → open a test account → **Make sub-admin**.
- [ ] Log in as them: the panel shows Overview, Support, Users, Blog —
      **not** Plans & limits, Branding or Activity log.
- [ ] On a user page they see the plan but no buttons to change it.

---

## 7. Known limits, so they do not surprise you

- **Long recordings.** Netlify cuts a function off at 26 seconds, so transcription
  is capped at 12 MB (~15 minutes). Longer audio needs a background worker, which
  is not built yet. The UI says so.
- **Scanned PDFs** have no text layer. The error tells the user to upload the page
  as an image instead, which goes through vision.
- **Read-aloud uses the browser's own voices**, not an API. Quality depends on the
  user's device, and the button hides itself where the browser has no speech engine.
  This costs nothing per use, and works on the free Gemini key.
- **Gemini has no transcription endpoint.** The code tries Whisper first, then falls
  back to sending the audio as a chat message. On a paid OpenAI key the first path
  is used and quality is better.
- **Trial expiry is a date comparison**, so nothing needs to run on a schedule.
  A trial that ends while someone is mid-session applies on their next request.
