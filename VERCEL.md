# Moving from Netlify to Vercel

Nothing in the code has to change. This is a Next.js app and Vercel is where
Next.js comes from, so a few Netlify workarounds simply stop applying.

**One warning before you start.** Your client already has an ElunaMind project on
Vercel. Create this under **your own Vercel account**, and when you import the
repo make sure it is **your** GitHub repo, not theirs. A wrong click here deploys
over the client's live site.

---

## 1. Create the project

1. Sign in at vercel.com with the GitHub account that owns your repo.
2. **Add New → Project → Import** your repo.
3. Framework Preset: **Next.js** (detected automatically).
4. Leave Root Directory, Build Command and Output Directory alone — the defaults
   are right. If Root Directory shows anything other than `./`, clear it.
5. **Do not deploy yet.** Add the environment variables first (next step), or the
   first build fails and you just have to redeploy.

---

## 2. Environment variables

Vercel will not read anything from Netlify. Copy these across by hand:
**Project → Settings → Environment Variables**, and tick **Production**,
**Preview** and **Development** for each one.

| Variable | Where to get it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **publishable** key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | the **secret** key (`sb_secret_…`) — server only, never in the repo |
| `OPENAI_API_KEY` | your provider key |
| `OPENAI_BASE_URL` | only when using Gemini; leave empty for OpenAI |
| `OPENAI_MODEL` | `gpt-4o-mini`, or `gemini-2.5-flash` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_PRICE_ID` | Stripe → Products |
| `STRIPE_WEBHOOK_SECRET` | **from the new webhook you make in step 4** |
| `AI_DISABLED` | `0` |
| `DEMO_CHECKOUT` | `0` before real payments, `1` only for demos |
| `NEXT_PUBLIC_APP_URL` | **the new Vercel URL** — see the warning below |

**`NEXT_PUBLIC_APP_URL` is the one people get wrong.** It is still pointing at
your Netlify address. Stripe uses it to build the return URL after checkout, so
if it is wrong, paying customers land on a dead site. Set it to your Vercel
production URL, with no trailing slash.

Optional, only if you want to change a default:

| Variable | Default |
|----------|---------|
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` |
| `TRANSCRIBE_MAX_BYTES` | `12582912` (12 MB) — see step 6 |
| `BOT_AI_DAILY_BUDGET` | `300` AI answers a day on the landing bot |

---

## 3. Point Supabase at the new address

**This is what breaks logins, and it is easy to miss.** Supabase only sends
people back to addresses it has been told about.

Supabase → **Authentication → URL Configuration**:

- **Site URL** → your Vercel production URL
- **Redirect URLs** → add both:
  - `https://your-project.vercel.app/auth/callback`
  - `https://your-project.vercel.app/**`

Keep the Netlify entries for now if that site is still up. Remove them once you
have stopped using it.

If you add a custom domain later, add it here too, or logins break again.

---

## 4. Point Stripe at the new address

The Netlify webhook still exists and still fires at a site you are leaving.
Payments would go through and nobody would get Premium.

1. Stripe → **Developers → Webhooks → Add endpoint**
2. URL: `https://your-project.vercel.app/api/stripe-webhook`
3. Events: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.trial_will_end`
4. Copy the new **signing secret** into `STRIPE_WEBHOOK_SECRET` on Vercel, then
   redeploy so it is picked up.
5. **Disable the old Netlify endpoint** once the new one shows successful events.

Also in Stripe: **Settings → Billing → Customer portal** must be enabled, or the
"Manage or cancel" button on the account page has nothing to open.

---

## 5. Deploy, and run the SQL

Deploy from the Vercel dashboard. Then, if you have not already, run these in the
Supabase SQL editor in order. They are safe to run twice.

1. `supabase/006_uploads.sql` → `uploads ready`
2. `supabase/007_trial_roles_support.sql` → `trial, roles and support ready`
3. `supabase/008_errors_and_billing.sql` → `errors and billing ready`
4. `supabase/009_site_content.sql` → `site content ready`

---

## 6. What gets better on Vercel

**Longer functions.** Netlify cut every request off at 26 seconds, which is why
transcription is capped at 12 MB. Vercel allows longer, but how much longer
depends on your plan — check **Settings → Functions → Max Duration** for yours.
The routes already ask for what they need (`maxDuration = 300` on transcription),
so if your plan allows it, nothing to change. If it allows more than 26 seconds,
raise `TRANSCRIBE_MAX_BYTES` to match and longer recordings start working.

**No more CVE blocks.** Netlify refused to build certain Next.js versions. Vercel
does not do that.

**Preview deploys.** Every branch gets its own URL. Useful before you show the
client anything: push to a branch, check the preview, then merge.

---

## 7. After it is live

- [ ] Home page loads with the new design — hard refresh (Ctrl+Shift+R) if it looks old
- [ ] Log in works, and so does signing up with a fresh email
- [ ] `/privacy` and `/terms` open
- [ ] Admin → Branding & site → **Reset to defaults** → Save
- [ ] Admin → Pages — fill in the legal text
- [ ] Upload a PDF in chat and ask about it
- [ ] Stripe test payment → check the user becomes Premium → check the webhook
      shows a successful delivery in Stripe
- [ ] Admin → Errors — empty, or only things you recognise

---

## 8. Turning Netlify off

Leave it running until everything above passes. Then:

1. Remove the Netlify entries from Supabase → Redirect URLs.
2. Delete the Netlify Stripe webhook endpoint.
3. Delete the Netlify site, or disconnect it from GitHub so it stops building.

Do not delete the Netlify site while its URL is still in `NEXT_PUBLIC_APP_URL`
or in Supabase — fix those first.
