# START HERE — zero to live on a new Supabase + new Vercel

This is the only file you need. Follow it top to bottom once and the site is
live. About 30 minutes, almost all of it waiting for things to deploy.

Everything else in this folder is reference you can ignore today:
`DEPLOY-STEPS.md` (the long version), `VERCEL.md` (moving off Netlify),
`ADMIN_SETUP.md`, `TESTING.md`, `HANDOFF.md` (what to give the client).

---

## Before you start

You need four accounts, all free to open: **GitHub**, **Supabase**, **Vercel**,
and one **AI provider** (Google AI Studio is free — see step 7).

**Two warnings, both about clicking the wrong thing.**

1. Your client already has an ElunaMind project on Vercel and a Supabase project
   behind it. Everything below creates **new** ones under **your own** accounts.
   When Vercel asks which repo to import, make sure it is **your** GitHub repo.
   One wrong click here deploys over the client's live site.
2. **Vercel's free Hobby plan does not allow commercial use.** Your own build,
   your own demo, showing the client — that is fine. The moment it is the
   client's production site taking payments, it has to be on a paid plan
   (Pro, $20/mo) or deployed under the client's own paid account. Plan for the
   client to deploy the final copy themselves.

---

## 1. Create the Supabase project

1. Go to supabase.com → **New project**.
2. Name it anything (`elunamind-mine`). Pick the region closest to you —
   Singapore or Mumbai from Pakistan.
3. **Write the database password down somewhere.** You will not be shown it
   again, and you need it if you ever connect any other tool to this database.
4. Press create and wait ~2 minutes.

---

## 2. Build the database — one paste

1. Supabase → **SQL Editor** → **New query**.
2. Open `supabase/RUN-THIS-IN-SUPABASE.sql` from this folder. Select all, copy,
   paste it into the editor.
3. Press **Run**.

It takes about 10 seconds. `NOTICE` lines are normal — that is Postgres saying
"that already existed, skipping". **Only a line starting with `ERROR` matters.**

When it finishes you get one table with 15 rows. Every row should say `yes`:

| # | check | ready |
|---|---|---|
| 1 | Accounts | yes |
| 2 | Chat and notes | yes |
| 3 | Daily usage limits | yes |
| 4 | Admin settings | yes |
| 5 | File uploads | yes |
| 6 | Uploads storage | yes |
| 7 | Support tickets | yes |
| 8 | Error tracking | yes |
| 9 | Website content | yes |
| 10 | AI keys | yes |
| 11 | Career plans | yes |
| 12 | Payment keys | yes |
| 13 | Slide pictures | yes |
| 14 | Ad conversions | yes |
| 15 | Notifications | yes |

If any row says `no`, scroll the output for the `ERROR` line and send me the
whole line. Do not carry on with a `no`.

This file is safe to run again any time. It checks before it acts, so running
it twice changes nothing the second time. That is also the fix if you are ever
unsure whether a migration went through: run it again rather than guessing.

---

## 3. Copy the three Supabase keys

Supabase → **Project Settings** → **API keys**. You need three values:

| What you need | Where it is | Looks like |
|---|---|---|
| Project URL | Settings → API | `https://abcdefgh.supabase.co` |
| Publishable key | Settings → API keys | `sb_publishable_…` (or legacy `anon` JWT) |
| **Secret** key | Settings → API keys → reveal | `sb_secret_…` (or legacy `service_role`) |

Paste them into a notes file for the next step.

> **The secret key is the whole database.** It bypasses every security rule and
> can read and delete every user's data. It goes in **Vercel's environment
> variables and nowhere else** — never in the repo, never in a screenshot,
> never in a chat, not even to me. If it ever leaks, Supabase → API keys →
> roll it, then update Vercel.

---

## 4. Push the code to your own GitHub repo

If your repo already exists, just push this folder's contents to it and skip to
step 5.

```bash
cd elunamind
git init
git add .
git commit -m "ElunaMind"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
git push -u origin main
```

`.gitignore` already excludes `.env.local`, so your keys cannot be committed by
accident. Before you push, check it anyway:

```bash
git status --short | grep env
```

That must print **nothing**. If it lists `.env.local`, stop and tell me.

---

## 5. Create the Vercel project

1. vercel.com → sign in **with the GitHub account that owns your repo**.
2. **Add New → Project → Import** your repo.
3. Framework Preset says **Next.js** on its own. Leave Root Directory, Build
   Command and Output Directory exactly as they are.
4. Open **Environment Variables** and add these three, ticking
   **Production**, **Preview** and **Development** for each:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your project URL from step 3 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the secret key |

5. Press **Deploy** and wait ~2 minutes.

**That is all the environment variables the site needs.** No AI key, no Stripe
key — those go in the admin panel in steps 7 and 8, where you can change them
without a redeploy. I verified the build with exactly these three and nothing
else.

Vercel gives you a URL like `https://elunamind-mine.vercel.app`. Open it. The
homepage should load, styled, with the logo. Copy that URL — the next steps need
it.

### Then add one more variable

Once you know your final URL, go back to **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://elunamind-mine.vercel.app` (no trailing slash) |

The site works without it — it falls back to Vercel's own URL — but set it
anyway. It is what goes into Stripe's return links and the share previews, and
without it a preview deployment can leak its temporary URL into a real email.
**Redeploy after adding it** (Deployments → ⋯ → Redeploy).

---

## 6. Point Supabase at your new URL

Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://elunamind-mine.vercel.app`
- **Redirect URLs**: add `https://elunamind-mine.vercel.app/**`
  (the `/**` matters — without it the password reset link bounces)

Add `http://localhost:3000/**` to Redirect URLs as well if you want to run it
locally too.

### The email templates

Supabase's default emails are plain and say "Supabase" on them. Six finished
templates are in `supabase/emails/`.

Supabase → **Authentication** → **Emails** → **Templates**. For each one below,
open the `.html` file in a text editor, copy **everything**, and paste it into
the matching template's body. **Set the subject line too** — Supabase keeps the
subject separate from the body, so pasting only the body leaves Supabase's
default subject on a redesigned email.

| Supabase template | File | Subject line |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirm your email — Eluna Mind |
| Magic Link | `magic-link.html` | Your sign-in link — Eluna Mind |
| Reset Password | `reset-password.html` | Reset your password — Eluna Mind |
| Change Email Address | `change-email.html` | Confirm your new email — Eluna Mind |
| Invite user | `invite.html` | You have been invited to Eluna Mind |
| Reauthentication | `reauthentication.html` | Your confirmation code — Eluna Mind |

All six are in `supabase/emails/`. Press **Save** on each.

The logo in these emails is loaded from your **Site URL**, which is why step 6
comes first — point Site URL at localhost and every email arrives with a broken
image. `supabase/emails/README.md` explains how to change the colours later.

> **"Email rate limit exceeded"** — you will hit this while testing. Supabase's
> built-in email sender allows only a few messages per hour on the free plan,
> and that is the error. It is not a bug in the app. For real use, connect your
> own sender: **Project Settings → Authentication → SMTP Settings**, with a
> free Resend or Brevo account. Then the limit is theirs, not Supabase's.

---

## 7. Make yourself the admin, then add the AI key

Sign up on your live site first — a normal signup with your real email, and
confirm it from the email.

Then Supabase → **SQL Editor**, with that same email:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

If it says `UPDATE 0`, the signup did not complete. Sign up first, then run it
again.

Now reload the site and go to **`/admin`**.

### AI keys — Admin → AI keys

A free key takes two minutes: **aistudio.google.com** → **Get API key** →
create. Then in the admin panel:

| Field | Value |
|---|---|
| Base URL | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Model | `gemini-2.5-flash` |
| API key | the key you just made |

Press **Save**, then **Test**. It should come back green within a few seconds.

You can add more than one provider — the app tries them in order and fails over
to the next if one is down or out of quota. If you would rather use OpenAI,
leave Base URL empty and use `gpt-4o-mini`.

Now open the app and generate something — notes, or a chat message. If text
comes back, the whole stack works.

### Pictures on presentation slides (optional)

Same page, lower down. Get a free key at **pexels.com/api** and paste it into
**Pexels API key**, then press **Test it**. Slides that would be clearer with a
photograph get one; without a key they are simply text slides.

Pexels is used rather than a web image search on purpose: its licence permits
commercial use, so a deck a student hands in is not somebody else's copyright.

The switch below it lets students generate pictures with AI instead. That costs
money per picture on your AI key, so it is off by default, and the cap next to
it limits how many any one deck can use.

---

---

## 7b. Google: analytics, search, and sign-in

All three are optional and all three live in **Admin → Branding & site**, so
none of them needs a redeploy.

### Analytics

Google Analytics → **Admin → Data streams** → your stream → copy the
**measurement ID** (starts with `G-`). Paste it into the **Google** card and
press **Save**. Reporting starts within a minute; the security headers already
allow it.

Leave it empty and **nothing from Google is loaded at all** — no script, no
cookie. That is the default.

It will not accept a `UA-` ID (Universal Analytics, retired) or a `GTM-` ID
(Tag Manager) — those need a different snippet. Only `G-`.

### Search Console — so Google actually indexes the site

Without this, Google finds the site eventually. With it, you can push the
sitemap and see what it has indexed and what it refused.

1. search.google.com/search-console → **Add property** → **URL prefix** → paste
   your site URL.
2. Choose the **HTML tag** method. Copy the whole `<meta …>` line.
3. Admin → Branding & site → **Search Console verification** → paste it. The
   token is pulled out of the tag for you. **Save.**
4. Back in Search Console, press **Verify**.
5. Then **Sitemaps** in the left menu → enter `sitemap.xml` → **Submit**.

### Sign in with Google

The button is already built. It needs Google and Supabase introduced to each
other first, and **the switch must stay off until they are** — otherwise the
button is there and returns an error.

1. **console.cloud.google.com** → create a project (any name).
2. **APIs & Services → OAuth consent screen**: External, fill in the app name,
   your support email, and a developer email. Save. Leave it in Testing while
   you try it; **Publish** it before real users sign up, or only the test
   accounts you list can log in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   type **Web application**.
4. **Authorised redirect URI** — this is the one people get wrong. It is
   **Supabase's** callback, not your site's:

   ```
   https://YOUR-PROJECT.supabase.co/auth/v1/callback
   ```

   Take the host from your `NEXT_PUBLIC_SUPABASE_URL`.
5. Create, then copy the **Client ID** and **Client secret**.
6. Supabase → **Authentication → Providers → Google** → switch on, paste both,
   **Save**.
7. Now Admin → Branding & site → **Sign in with Google** → on.

Test it in a private window. If it fails, the error almost always says
`redirect_uri_mismatch`, which means step 4 does not match exactly — no
trailing slash, `https`, and the Supabase host, not yours.

> Switching analytics on means your privacy policy has to say the site tracks
> visitors. Edit it in Admin → **Pages**. In most countries that is a legal
> requirement, not a formality.

---

## 8. Payments — Admin → Payments

**Skip this entirely if you are not taking money yet.** Everything else works
without it; Premium features simply stay locked.

All you need from Stripe is **one key**. Stripe → **Developers → API keys** →
copy the secret key. Use the **test** key (`sk_test_…`) until you are sure.

Then Admin → **Payments**:

1. Paste the secret key into **Secret key** and press **Save**. The app creates
   the Stripe webhook for you and stores its secret — there is nothing to set up
   in Stripe's dashboard by hand.
2. Press **Show my Stripe prices** and click the one you want to sell. If you
   have not made one yet, fill in the name, amount, currency and interval right
   there and it creates it in Stripe for you.
3. Press **Check setup**. It tells you, line by line, what is working and what
   is not.

The page shows you what mode you are in:

- **Test** — real Stripe checkout, test cards only. Use `4242 4242 4242 4242`.
- **Live** — real money. Only after you have put a live key in.
- **Demo** — no Stripe keys at all; the Premium button grants Premium without
  charging. Fine for showing the client, and it switches off by itself the
  moment you save a real key.

Checkout turns on automatically as soon as the keys are saved. No redeploy.

---

## 9. Check it actually works

Click through this once on the live site:

- [ ] Homepage loads, styled, with the logo
- [ ] Sign up with a second email → confirmation email arrives → you can log in
- [ ] Generate notes from a paragraph → text comes back
- [ ] A chat message streams in, and **Stop** stops it
- [ ] Upload a PDF in Files → it processes
- [ ] `/admin` opens for you, and redirects a normal user to `/dashboard`
- [ ] `/pricing` shows your price
- [ ] A made-up URL like `/nothing-here` shows the styled 404, not a bare page

There is also a health page built into the site: open **`/diagnose`** while
logged in as the admin. It checks the database, the keys and the storage bucket
and prints each one as OK or MISSING. Fastest way to see what is wrong without
opening Supabase.

`TESTING.md` has the long list if you want to be thorough before the client
sees it.

---

## 10. Things that will bite you later

**Supabase free pauses after a week of no traffic.** No requests for 7 days and
the project is paused; the site then shows database errors until you open the
dashboard and press **Restore**. It takes a minute and loses nothing. If this is
going to sit idle between demos, just restore it before you show anyone.

**Vercel Hobby is not for commercial use.** See the warning at the top. The
client's production copy belongs on their own paid account.

**Free tier ceilings**, both generous for a demo and both reached by a real user
base: Supabase gives 500 MB of database and 1 GB of storage; Vercel gives 100 GB
of bandwidth a month.

**Your AI provider is the one real cost.** Gemini's free tier has a daily
request cap. If the app gets busy, that cap is what you hit first — not Supabase
and not Vercel. Admin → Plans & limits is where you tighten the per-user daily
limits, and **Admin → Branding & site → Pause AI** is the emergency switch if
costs ever spike: the site stays up and every tool returns a polite "paused"
message.

**Never run a migration against the client's production database without a
backup first.** Supabase → Database → Backups.

---

## If something breaks

**The build fails on Vercel.** Read the log — it names the file. Nine times out
of ten it is a missing environment variable or a typo in one.

**The site loads but everything says "database error".** Either the three
Supabase variables are wrong, or the project is paused (see step 10), or step 2
did not finish. Open **`/diagnose`** on the site — it names the broken piece. If
the page itself will not load, run `supabase/DIAGNOSE.sql` in the SQL editor
instead; it only reads and prints the same thing.

**AI says it failed.** Admin → AI keys → **Test**. The error there is the real
one. Usually an expired key or a daily quota.

**Emails never arrive.** Rate limit (step 6), or Site URL is wrong (step 6), or
they are in spam — the default Supabase sender often lands there, which is the
other reason to set up your own SMTP.

Anything else, send me the exact error text and which step you were on.
